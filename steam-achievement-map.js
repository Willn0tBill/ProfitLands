/* Future Steamworks curation manifest. Does NOT call Steam API.
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
window.ProfitLandsSteamAchievements={achievements,unlocked,connected:false};
})();