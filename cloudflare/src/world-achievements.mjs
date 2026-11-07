/* Compact server-derived online achievements.
 * Mirrors the 8 industries x 16 tracks x 1024 tiers in achievement-engine.js.
 * The online server computes ranks from authoritative activity; clients cannot award trophies.
 */
import core from './world-core.mjs';
const TRACKS=[
 ['highestLevel','maxLevel',5,5,false],['totalLevels','totalLevels',3,3,false],
 ['highestMarketing','maxMarketing',1,1,false],['totalMarketing','totalMarketing',1,2,false],
 ['highestEfficiency','maxEfficiency',1,1,false],['totalEfficiency','totalEfficiency',1,2,false],
 ['workforce','workers',1,2,false],['investments','capital',200,1.055,true],
 ['upgrades','upgrades',1,5,false],['campaigns','campaigns',1,5,false],
 ['optimizations','optimizations',1,5,false],['hired','hired',1,5,false],
 ['inventory','inventory',10,20,false],['sales','sales',5,10,false],
 ['cycles','cycles',1,3,false],['earnings','earnings',250,1.045,true]
];
const MAX_RANK=1024;
const COUNTERS=new Set(['upgrades','campaigns','optimizations','hired','inventory','sales','cycles','earnings']);
function record(p,sector,metric,amount=1){
 if(!core.BUSINESS_TYPES.some(t=>t.id===sector)||!COUNTERS.has(metric)||
  !Number.isFinite(amount)||amount<=0)return false;
 if(!p.enterprise||typeof p.enterprise!=='object')p.enterprise={};
 if(!p.enterprise.badgeCounters)p.enterprise.badgeCounters={};
 if(!p.enterprise.badgeCounters[sector])p.enterprise.badgeCounters[sector]={};
 const state=p.enterprise.badgeCounters[sector];
 state[metric]=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Number(state[metric]||0))+amount);
 return true;
}
function threshold(track,rank){return track[4]?Math.ceil(track[2]*Math.pow(track[3],rank-1)):track[2]+(rank-1)*track[3]}
function rankFor(track,value){
 value=Math.max(0,Number(value)||0);
 let low=0,high=MAX_RANK;
 while(low<high){const mid=Math.ceil((low+high)/2);if(value>=threshold(track,mid))low=mid;else high=mid-1}
 return low;
}
function sectorStats(player,sector){
 const shops=(player.businesses||[]).filter(b=>b.type===sector);
 const base=core.BUSINESS_TYPES.find(x=>x.id===sector)?.cost||0;
 let maxLevel=0,totalLevels=0,maxMarketing=0,totalMarketing=0;
 let maxEfficiency=0,totalEfficiency=0,workers=0,capital=0;
 for(const b of shops){
  const sites=Array.isArray(b.sites)&&b.sites.length?b.sites:[{level:1}];
  maxLevel=Math.max(maxLevel,Number(b.level||1));
  workers+=Number(b.workers||0);
  maxMarketing=Math.max(maxMarketing,Number(b.marketing||0));
  totalMarketing+=Number(b.marketing||0)*sites.length;
  maxEfficiency=Math.max(maxEfficiency,Number(b.efficiency||0));
  totalEfficiency+=Number(b.efficiency||0)*sites.length;
  for(const s of sites){
   const level=Math.max(1,Number(s.level||1));
   maxLevel=Math.max(maxLevel,level);
   totalLevels+=level;
   capital+=base*(1+Math.max(0,level-1)*.75);
  }
 }
 const stats={maxLevel,totalLevels,maxMarketing,totalMarketing,maxEfficiency,
  totalEfficiency,workers,capital};
 const counters=player.enterprise?.badgeCounters?.[sector]||{};
 for(const metric of COUNTERS)stats[metric]=Number(counters[metric]||0);
 return stats;
}
function summary(p){
 const sectors=core.BUSINESS_TYPES.map(item=>{
  const stats=sectorStats(p,item.id);
  const ranks={};let earned=0;
  for(const track of TRACKS){
   const current=rankFor(track,stats[track[1]]);
   const lifetime=Number(p.enterprise?.prestigeTrophies?.[item.id]?.[track[0]]||0);
   const rank=Math.max(current,Number.isSafeInteger(lifetime)?Math.max(0,Math.min(MAX_RANK,lifetime)):0);
   ranks[track[0]]=rank;earned+=rank;
  }
  return {id:item.id,name:item.name,earned,ranks};
 });
 return {earned:sectors.reduce((sum,s)=>sum+s.earned,0),total:131072,sectors};
}
export {TRACKS,record,rankFor,sectorStats,summary};
export default {record,rankFor,summary};
