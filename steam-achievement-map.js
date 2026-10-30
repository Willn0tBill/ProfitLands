/* Steamworks curation and optional native desktop adapter. Does NOT load Steam in browsers.
   Steam starts with up to 100 achievements before app vetting.
   ProfitLands' complete in-game collection remains independent.
*/
(function(){
'use strict';
const SECTORS=['coffee','restaurant','gamestore','hotel','dealership','factory','software','logistics'];
const TRACKS=['highestLevel','totalLevels','highestMarketing','totalMarketing','highestEfficiency','totalEfficiency','workforce','investments','upgrades','campaigns','hired','earnings'];
const SPECIAL=[
 ['coffee','highestLevel',100],
 ['restaurant','workforce',100],
 ['factory','totalLevels',250],
 ['software','earnings',500]
];
const upper=s=>s.replace(/[^a-z0-9]/gi,'_').toUpperCase();
const achievements=Object.freeze([
 ...SECTORS.flatMap(sector=>TRACKS.map(track=>({
  apiName:'PL_'+upper(sector)+'_'+upper(track)+'_01',
  badgeId:sector+'.'+track+'.1'
 }))),
 ...SPECIAL.map(([sector,track,rank])=>({
  apiName:'PL_'+upper(sector)+'_'+upper(track)+'_'+rank,
  badgeId:sector+'.'+track+'.'+rank
 }))
]);
function unlocked(){
 const engine=window.ProfitLandsBadges;
 if(!engine)return[];
 return achievements.filter(item=>{
  const [sector,track,raw]=item.badgeId.split('.');
  return engine.rankAt(sector,track)>=Number(raw);
 }).map(item=>item.apiName);
}
// The browser cannot reach Steamworks. Only a trusted native desktop shell
// explicitly enabling Steam may provide these functions.
let native=null,inflight=null,resyncRequested=false;
const confirmed=new Set();
function validBridge(bridge){
 return window.profitLandsPlatform?.steamEnabled===true && bridge?.ready===true &&
  ['getAchievement','setAchievement','storeStats'].every(name=>typeof bridge[name]==='function');
}
async function sync(){
 if(!native)return false;
 if(inflight){resyncRequested=true;return inflight}
 inflight=(async()=>{
  const staged=[];
  try{
   for(const name of unlocked()){
    if(confirmed.has(name))continue;
    if(await native.getAchievement(name)===true){confirmed.add(name);continue}
    if(await native.setAchievement(name)!==true)return false;
    staged.push(name);
   }
   if(staged.length){
    // Native host must wait for Steam's stats-store acknowledgement.
    if(await native.storeStats()!==true)return false;
    for(const name of staged)confirmed.add(name);
   }
   return true;
  }catch(e){console.warn('Native Steam achievement sync failed; in-game badges are unaffected.',e);return false}
 })();
 try{return await inflight}finally{
  inflight=null;
  if(resyncRequested){resyncRequested=false;void sync()}
 }
}
async function connect(bridge=window.ProfitLandsSteamBridge){
 if(!validBridge(bridge))return false;
 if(native!==bridge){native=bridge;confirmed.clear()}
 return sync();
}
function disconnect(){native=null;confirmed.clear();resyncRequested=false}
window.ProfitLandsSteamAchievements={
 achievements,unlocked,connect,sync,disconnect,
 get connected(){return !!native}
};
if(typeof window.addEventListener==='function')
 window.addEventListener('profitlands:steam-ready',()=>{void connect()});
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void connect()},{once:true});
 else void connect();
}
})();