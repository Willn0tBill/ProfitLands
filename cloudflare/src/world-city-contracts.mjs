/* Regional city contracts. Each work order is accepted first and progresses
 * ONLY through a subsequent successful server-owned economic action.
 * Online and solo saves remain separate; callers cannot submit progress/cash.
 */
import core from './world-core.mjs';

const DAY_MS=86400000;
const MIN_REWARD_GAP_MS=15*60*1000;
const TEMPLATES=Object.freeze([
 {id:'open',title:'New on the Block',detail:'Purchase one new online business.',reward:75,action:'buyBusiness'},
 {id:'upgrade',title:'A Better Storefront',detail:'Upgrade an online company or location.',reward:90,action:'upgradeBusiness'},
 {id:'promote',title:'Get the Word Out',detail:'Purchase one marketing campaign.',reward:55,action:'runMarketing'},
 {id:'expand',title:'Across Town',detail:'Purchase one new business location.',reward:125,action:'openBranch'}
].map(x=>Object.freeze(x)));
const today=now=>new Date(now).toISOString().slice(0,10);
function eligible(p,template){
 if(!template)return false;
 if(template.id==='open')return p.businesses?.length<core.MAX_BUSINESSES;
 if(!(p.businesses||[]).length)return false;
 if(template.id==='expand')
  return p.businesses.some(b=>(b.sites?.length||1)<16);
 if(template.id==='promote')
  return p.businesses.some(b=>(b.marketing||0)<30);
 if(template.id==='upgrade')
  return p.businesses.some(b=>b.level<30||(b.sites||[]).some(s=>s.level<30));
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
 return TEMPLATES.filter(x=>eligible(p,x));
}
function accept(p,contractId,now){
 const e=p.enterprise;
 if(!e)return {ok:false,error:'city_contract_unavailable'};
 const template=TEMPLATES.find(x=>x.id===contractId);
 if(!template||!eligible(p,template))return {ok:false,error:'city_contract_unavailable'};
 if(e.cityContract?.day===today(now))return {ok:false,error:'city_contract_already_accepted'};
 if(remaining(e,now)>0)return {ok:false,error:'city_contract_cooldown'};
 e.cityContract={day:today(now),kind:template.id,status:'accepted',
  progress:0,acceptedAt:now};
 return {ok:true,player:p,cost:0};
}
function record(p,action,now){
 const current=p.enterprise?.cityContract;
 if(!current||current.status!=='accepted'||current.day!==today(now)||current.progress>=1)
  return false;
 const template=TEMPLATES.find(x=>x.id===current.kind);
 if(!template)return false;
 const matches=template.id==='upgrade'?
  ['upgradeBusiness','upgradeBranch'].includes(action):template.action===action;
 if(!matches)return false;
 current.progress=1;
 return true;
}
function claim(p,now){
 const e=p.enterprise;
 const current=e?.cityContract;
 if(!current||current.day!==today(now)||current.status!=='accepted'||
  current.progress!==1)return {ok:false,error:'city_contract_incomplete'};
 if(remaining(e,now)>0)return {ok:false,error:'city_contract_cooldown'};
 const template=TEMPLATES.find(x=>x.id===current.kind);
 if(!template)return {ok:false,error:'city_contract_unavailable'};
 current.status='claimed';
 current.claimedAt=now;
 e.lastCityRewardAt=now;
 e.cityCompleted=Math.min(1000000000,(Number(e.cityCompleted)||0)+1);
 const reward=core.credit(p,template.reward);
 return {ok:true,player:p,reward,cost:0};
}
function summary(p,now){
 const e=p.enterprise||{};
 const current=e.cityContract?.day===today(now)?e.cityContract:null;
 const template=TEMPLATES.find(x=>x.id===current?.kind);
 return {offers:offers(p,now).map(x=>({...x})),
  active:current?{...current,title:template?.title||'City contract',
   detail:template?.detail||'',reward:template?.reward||0}:null,
  canClaim:!!(current&&current.progress===1&&current.status==='accepted'&&remaining(e,now)===0),
  cooldownMs:remaining(e,now),completed:e.cityCompleted||0,
  day:today(now)};
}
export {TEMPLATES,MIN_REWARD_GAP_MS,offers,accept,record,claim,summary};
export default {offers,accept,record,claim,summary};
