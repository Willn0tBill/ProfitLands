/* Server-owned multi-stage regional work orders.
 * Only completed, paid server actions after acceptance advance a step.
 * Replayed receipt IDs are intercepted before record() and cannot advance twice.
 */
import core from './world-core.mjs';
const DAY_MS=86400000;
const MIN_REWARD_GAP_MS=15*60*1000;
const TEMPLATES=Object.freeze([
 {id:'open',title:'New on the Block',detail:'Purchase one new online business.',reward:75,steps:[['buyBusiness']]},
 {id:'upgrade',title:'A Better Storefront',detail:'Upgrade an online company or location.',reward:90,steps:[['upgradeBusiness','upgradeBranch']]},
 {id:'promote',title:'Get the Word Out',detail:'Purchase one marketing campaign.',reward:55,steps:[['runMarketing']]},
 {id:'expand',title:'Across Town',detail:'Purchase one new business location.',reward:125,steps:[['openBranch']]},
 {id:'workforce',title:'Build a Stronger Team',detail:'Hire staff, then appoint a manager in a paid company.',reward:250,steps:[['hireStaff'],['appointManager']]},
 {id:'supply',title:'Keep the Shelves Stocked',detail:'Order branch stock, then upgrade business efficiency.',reward:180,steps:[['restockBranch'],['upgradeEfficiency']]},
 {id:'network',title:'Regional Distribution Upgrade',detail:'Build a warehouse, then purchase a delivery truck.',reward:600,steps:[['buyWarehouse'],['buyTruck']]},
 {id:'invest',title:'Broaden Your Portfolio',detail:'Purchase property, then invest in public shares.',reward:400,steps:[['buyProperty'],['buyShares']]}
].map(x=>Object.freeze({...x,steps:Object.freeze(x.steps.map(s=>Object.freeze(s)))})));
const today=now=>new Date(now).toISOString().slice(0,10);
function eligible(p,template){
 if(!template)return false;
 const businesses=p.businesses||[],e=p.enterprise||{};
 if(template.id==='open')return businesses.length<core.MAX_BUSINESSES;
 if(template.id==='invest')return (e.properties?.length||0)<100;
 if(template.id==='network')return (e.warehouse||0)<20&&(e.trucks||0)<100;
 if(!businesses.length)return false;
 if(template.id==='expand')return businesses.some(b=>(b.sites?.length||1)<16);
 if(template.id==='promote')return businesses.some(b=>(b.marketing||0)<30);
 if(template.id==='upgrade')return businesses.some(b=>b.level<30||
  (b.sites||[]).some(s=>s.level<30));
 if(template.id==='workforce')return businesses.some(b=>
  !b.manager&&(b.workers||0)<100);
 if(template.id==='supply')return businesses.some(b=>
  (b.efficiency||0)<30&&(b.sites||[]).some(s=>(s.stock||0)<5000));
 return false;
}
function remaining(e,now){
 const last=Number(e.lastCityRewardAt);
 return Number.isSafeInteger(last)&&last>0&&last<=now?
  Math.max(0,MIN_REWARD_GAP_MS-(now-last)):0;
}
function offers(p,now){
 const e=p.enterprise||{};
 const record=e.cityContract;
 if(record?.day===today(now)||remaining(e,now)>0)return [];
 return TEMPLATES.filter(x=>eligible(p,x)).map(t=>({...t,
  steps:t.steps.map(s=>[...s]),total:t.steps.length}));
}
function accept(p,contractId,now){
 const e=p.enterprise;
 if(!e)return {ok:false,error:'city_contract_unavailable'};
 const template=TEMPLATES.find(x=>x.id===contractId);
 if(!template||!eligible(p,template))return {ok:false,error:'city_contract_unavailable'};
 if(e.cityContract?.day===today(now))return {ok:false,error:'city_contract_already_accepted'};
 if(remaining(e,now)>0)return {ok:false,error:'city_contract_cooldown'};
 e.cityContract={day:today(now),kind:template.id,status:'accepted',progress:0,acceptedAt:now};
 return {ok:true,player:p,cost:0};
}
function record(p,action,now){
 const current=p.enterprise?.cityContract;
 if(!current||current.status!=='accepted'||current.day!==today(now))return false;
 const template=TEMPLATES.find(x=>x.id===current.kind);
 if(!template||!Number.isSafeInteger(current.progress)||
  current.progress<0||current.progress>=template.steps.length)return false;
 if(!template.steps[current.progress].includes(action))return false;
 current.progress++;
 return true;
}
function claim(p,now){
 const e=p.enterprise,current=e?.cityContract;
 const template=TEMPLATES.find(x=>x.id===current?.kind);
 if(!template||!current||current.day!==today(now)||current.status!=='accepted'||
  current.progress!==template.steps.length)return {ok:false,error:'city_contract_incomplete'};
 if(remaining(e,now)>0)return {ok:false,error:'city_contract_cooldown'};
 current.status='claimed';current.claimedAt=now;
 e.lastCityRewardAt=now;
 e.cityCompleted=Math.min(1000000000,(Number(e.cityCompleted)||0)+1);
 const reward=core.credit(p,template.reward);
 return {ok:true,player:p,reward,cost:0};
}
function summary(p,now){
 const e=p.enterprise||{};
 const current=e.cityContract?.day===today(now)?e.cityContract:null;
 const template=TEMPLATES.find(x=>x.id===current?.kind);
 return {offers:offers(p,now),
  active:current?{...current,title:template?.title||'City contract',
   detail:template?.detail||'',reward:template?.reward||0,
   total:template?.steps.length||1,
   nextAction:template?.steps[current.progress]?.join(' or ')||null}:null,
  canClaim:!!(current&&current.progress===template?.steps.length&&
   current.status==='accepted'&&remaining(e,now)===0),
  cooldownMs:remaining(e,now),completed:e.cityCompleted||0,day:today(now)};
}
export {TEMPLATES,MIN_REWARD_GAP_MS,offers,accept,record,claim,summary};
export default {offers,accept,record,claim,summary};
