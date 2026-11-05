/* ProfitLands City Contracts.
 * One optional paid contract per in-game day. Progress is based on NEW,
 * player-triggered changes after accepting, not existing inventory.
 * Save markers live in the same game state as the authoritative cash ledger.
 * Singleplayer only; not an online rewards system.
 */
(function(){
'use strict';
const TEMPLATES=Object.freeze([
 Object.freeze({id:'open',title:'New on the Block',detail:'Open one new business.',reward:75,metric:'shops',view:'businesses'}),
 Object.freeze({id:'upgrade',title:'A Better Storefront',detail:'Upgrade your businesses by one combined level.',reward:90,metric:'levels',view:'businesses'}),
 Object.freeze({id:'promote',title:'Get the Word Out',detail:'Buy one marketing improvement.',reward:55,metric:'marketing',view:'businesses'}),
 Object.freeze({id:'expand',title:'Across Town',detail:'Add a business location.',reward:125,metric:'locations',view:'operations'})
]);
const byId=Object.fromEntries(TEMPLATES.map(c=>[c.id,c]));
// Fast cycles are only five minutes long. Keep the daily-work-order flavor,
// but cap cash bonuses at one per 15 real-world minutes across all world modes.
const MIN_REWARD_GAP_MS=15*60*1000;
const MAX_BRANCHES_PER_EMPIRE=100000;
const MAX_BRANCHES_PER_COMPANY=50000;
const $=id=>document.getElementById(id);
const num=v=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):0;
const dayOf=s=>Math.max(1,num(s?.day));
function snapshot(s){
 const companies=Array.isArray(s?.businesses)?s.businesses:[];
 let levels=0,marketing=0,locations=0;
 for(const b of companies){
  // Live management stores upgrades on EACH location, not on b.level.
  // Legacy company-wide saves may be migrated on first management open:
  // compute the same effective totals before and after that migration.
  const sites=Array.isArray(b?.locations)&&b.locations.length?b.locations:[null];
  for(const site of sites){
   levels+=Math.max(1,num(site?.level??b?.level??1));
   marketing+=num(site?.marketing??b?.marketing??0);
  }
  locations+=Math.max(sites.length-1,num(b?.chainCount));
 }
 return {shops:companies.length,levels,marketing,locations};
}
function cooldownMs(s,now=Date.now()){
 const last=Number(s?.cityContractLastRewardAt);
 if(!Number.isFinite(last)||last<=0||last>now)return 0;
 return Math.max(0,MIN_REWARD_GAP_MS-(now-last));
}
function offersFor(s){
 const companies=Array.isArray(s?.businesses)?s.businesses:[];
 if(cooldownMs(s)>0)return [];
 const owned=new Set(companies.map(c=>c?.type));
 const types=Array.isArray(window.ProfitLandsBusinessTypes)?window.ProfitLandsBusinessTypes:[];
 const openPossible=types.length===0||types.some(t=>!owned.has(t.id));
 const branches=companies.reduce((sum,b)=>sum+
  (Array.isArray(b?.locations)&&b.locations.length?b.locations.length:1),0);
 const canExpand=companies.some(b=>(Array.isArray(b?.locations)?b.locations.length:1)<MAX_BRANCHES_PER_COMPANY)&&
  branches<MAX_BRANCHES_PER_EMPIRE;
 const options=TEMPLATES.filter(c=>{
  if(c.id==='open')return openPossible;
  if(!companies.length)return false;
  if(c.id==='expand')return canExpand;
  return true;
 });
 // Show up to three honest options, prioritizing variety and not hiding expansion.
 const offset=(dayOf(s)-1)%Math.max(1,options.length);
 const rotated=options.slice(offset).concat(options.slice(0,offset));
 return rotated.slice(0,3);
}
function recordFor(s){
 const record=s?.cityContract;
 if(!record||typeof record!=='object'||record.day!==dayOf(s)||
   !byId[record.kind]||record.status!=='accepted'&&record.status!=='claimed'||
   !record.baseline||typeof record.baseline!=='object')return null;
 const baseline=record.baseline;
 if(!['shops','levels','marketing','locations'].every(k=>Number.isSafeInteger(baseline[k])&&baseline[k]>=0))return null;
 return record;
}
function progressFor(s){
 const record=recordFor(s);
 if(!record)return null;
 const config=byId[record.kind];
 const total=snapshot(s)[config.metric];
 const base=record.baseline[config.metric];
 // New contracts use authenticated in-game action hooks, not a portfolio
 // difference that can be completed by selling/rebuying an unrelated asset
 // or merely converting an old save to per-location management.
 // Old active contracts retain their baseline fallback until their day ends.
 const current=Number.isSafeInteger(record.activity)&&record.activity>=0?
  record.activity:Math.max(0,total-base);
 return {kind:config.id,description:config.detail,title:config.title,
  reward:config.reward,progress:Math.min(1,current),complete:current>=1,claimed:record.status==='claimed'};
}
function playing(){
 return !!(window.state?.started&&window.state?.playType==='single'&&
  $('gameScreen')?.classList.contains('active'));
}
function accept(id){
 if(!playing()||!byId[id]||recordFor(window.state)||!offersFor(window.state).some(c=>c.id===id))return false;
 const s=window.state;
 s.cityContract={day:dayOf(s),kind:id,status:'accepted',baseline:snapshot(s),activity:0};
 window.save?.();
 render(true);
 return true;
}
// Invoked only AFTER a game transaction has paid its cost and updated state.
// The contract itself never triggers, pays for, or repeats a purchase.
function recordAction(kind){
 if(!playing())return false;
 const record=recordFor(window.state);
 if(!record||record.status!=='accepted'||record.kind!==kind||
  !Number.isSafeInteger(record.activity)||record.activity<0)return false;
 record.activity=Math.min(1,record.activity+1);
 render(true);
 return true;
}
function claim(){
 if(!playing())return false;
 const s=window.state,progress=progressFor(s),record=recordFor(s);
 if(!record||record.status!=='accepted'||!progress?.complete)return false;
 const reward=byId[record.kind].reward;
 if(cooldownMs(s)>0)return false;
 if(typeof window.ProfitLandsMoney?.gain!=='function'&&(!Number.isFinite(s.cash)))return false;
 // Commit the claim marker BEFORE paying; a second click cannot pay twice.
 record.status='claimed';
 const oldRewardAt=s.cityContractLastRewardAt;
 s.cityContractLastRewardAt=Date.now();
 try{
  if(typeof window.ProfitLandsMoney?.gain==='function')window.ProfitLandsMoney.gain(reward);
  else s.cash+=reward;
 }catch(e){
  record.status='accepted';
  if(oldRewardAt===undefined)delete s.cityContractLastRewardAt;
  else s.cityContractLastRewardAt=oldRewardAt;
  return false;
 }
 if(Array.isArray(s.news)){
  s.news.push('City contract complete: '+progress.title+' — '+reward+' cash earned.');
  if(s.news.length>150)s.news.splice(0,s.news.length-150);
 }
 window.save?.();
 window.render?.();
 window.toast?.('Contract completed. '+reward+' cash earned.');
 render(true);
 return true;
}
function create(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
}
let city=null,board=null,view=null,interval=null,rendered='',renders=0;
let cards=[],current=null,offerWrap=null;
function assemble(){
 const root=create('section','pl-contract-board');
 root.id='plCityContracts';
 root.setAttribute('aria-label','Daily city contracts');
 const head=create('div','pl-contract-head');
 const headline=create('div','pl-contract-heading');
 headline.append(create('span','pl-contract-kicker','CITY CONTRACTS'),
  create('h3','', 'Take a local job.'));
 const day=create('span','pl-contract-day');day.id='plContractDay';
 head.append(headline,day);
 const explanation=create('p','pl-contract-explanation','Choose one job per market cycle. Cash bonuses have a 15-minute cooldown across all modes; normal investment costs and actions still apply.');
 const offerStatus=create('p','pl-contract-offer-status');offerStatus.id='plContractOfferStatus';
 offerStatus.hidden=true;
 offerWrap=create('div','pl-contract-offers');offerWrap.id='plContractOffers';
 for(const config of TEMPLATES){
  const card=create('button','pl-contract-offer');
  card.type='button';card.dataset.kind=config.id;
  card.append(create('strong','',config.title),
   create('small','',config.detail),
   create('span','pl-contract-reward','+$'+config.reward));
  card.addEventListener('click',()=>accept(config.id));
  offerWrap.appendChild(card);cards.push(card);
 }
 current=create('div','pl-contract-active');current.id='plContractActive';
 const label=create('span','pl-contract-active-label');label.id='plContractState';
 const title=create('strong','pl-contract-active-title');title.id='plContractTitle';
 const details=create('p','pl-contract-active-detail');details.id='plContractDetail';
 const track=create('div','pl-contract-progress');track.id='plContractProgress';
 track.setAttribute('role','progressbar');
 track.setAttribute('aria-label','Current city contract progress');
 track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','1');
 const fill=create('i','pl-contract-progress-fill');track.appendChild(fill);
 const actions=create('div','pl-contract-actions');
 const hint=create('span','pl-contract-hint');hint.id='plContractHint';
 const go=create('button','pl-contract-goto','Go to businesses');go.type='button';
 go.id='plContractGo';
 go.addEventListener('click',()=>{
  const data=progressFor(window.state);
  if(data&&playing())window.ProfitLandsWorkspace?.show?.(byId[data.kind].view);
 });
 const collect=create('button','pl-contract-claim','Claim bonus');collect.type='button';
 collect.id='plContractClaim';collect.addEventListener('click',claim);
 actions.append(hint,go,collect);
 current.append(label,title,details,track,actions);
 root.append(head,explanation,offerStatus,offerWrap,current);
 return root;
}
function render(force=false){
 if(!board||!playing()||view?.hidden||document.hidden)return false;
 const s=window.state,day=dayOf(s),progress=progressFor(s);
 const cooldown=cooldownMs(s);
 const sig=[day,progress?.kind||'offers',progress?.progress||0,progress?.claimed?'claimed':'open',
  (Array.isArray(s.businesses)?s.businesses.length:0),Math.ceil(cooldown/60000)].join(':');
 if(sig===rendered&&!force)return true;
 rendered=sig;
 $('plContractDay').textContent='DAY '+day;
 offerWrap.hidden=Boolean(progress);
 current.hidden=!progress;
 if(progress){
  $('plContractState').textContent=progress.claimed?'JOB PAID':progress.complete?'READY TO COLLECT':'JOB IN PROGRESS';
  $('plContractTitle').textContent=progress.title;
  $('plContractDetail').textContent=progress.description;
  $('plContractProgress').setAttribute('aria-valuenow',String(progress.progress));
  const fill=current.querySelector?.('.pl-contract-progress-fill');if(fill)fill.style.width=progress.progress*100+'%';
  $('plContractHint').textContent=progress.claimed?'Next contracts arrive next game day.':
    progress.complete?'Contract finished. Collect your bonus.':'Complete the job using the regular game tools.';
  $('plContractGo').textContent=byId[progress.kind].view==='operations'?'Go to operations':'Go to businesses';
  $('plContractGo').hidden=progress.claimed||progress.complete;
  $('plContractClaim').hidden=progress.claimed||!progress.complete;
  $('plContractClaim').disabled=progress.claimed||!progress.complete;
  $('plContractClaim').textContent='Claim $'+progress.reward;
 }else{
  const eligible=new Set(offersFor(s).map(c=>c.id));
  for(const card of cards)card.hidden=!eligible.has(card.dataset.kind);
  const message=$('plContractOfferStatus');
  if(message){
   message.hidden=eligible.size>0;
   message.textContent=cooldown>0?
    'Contracts refresh in about '+Math.ceil(cooldown/60000)+' minute'+(Math.ceil(cooldown/60000)===1?'':'s')+'.':
    'No new contracts are currently available.';
  }
 }
 renders++;
 return true;
}
function mount(){
 if(board)return true;
 city=$('plLivingCity');
 view=city?.closest?.('.pl-workspace-view');
 if(!city||!view)return false;
 board=assemble();
 const anchor=$('plDistrictBoard')||city;
 anchor.insertAdjacentElement('afterend',board);
 window.addEventListener('profitlands:viewchange',event=>{
  if(event?.detail?.view==='overview')render(true);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(true)});
 if(typeof window.setInterval==='function')interval=window.setInterval(()=>render(),1250);
 render(true);
 return true;
}
function init(){
 if(!mount()&&typeof MutationObserver==='function'){
  const game=$('gameScreen');
  if(!game)return;
  const ob=new MutationObserver(()=>{if(mount())ob.disconnect()});
  ob.observe(game,{childList:true,subtree:true});
 }
}
window.ProfitLandsCityContracts={
 mount,refresh:()=>render(true),snapshot,offersFor,progressFor,accept,recordAction,claim,cooldownMs,
 diagnostics:()=>({mounted:!!board,renders,active:playing(),contract:progressFor(window.state),loop:!!interval})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();