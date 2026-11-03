/* ProfitLands — lightweight, optional CrazyGames first-session guide.
 * This module changes only UI preferences in a separate localStorage key.
 * Never alters state.cash, businesses, actions, trophies, or save snapshots.
 */
(function(){
'use strict';
if(window.profitLandsPlatform?.name!=='crazygames')return;
const KEY='profitlands-cg-guide-v1';
const STEPS=[
  {id:'open',title:'Open your first business',detail:'Start with a Coffee Shop for $500. Businesses earn or lose cash while you play.',action:'Open business shop',done:(s,p)=>Array.isArray(s?.businesses)&&s.businesses.length>0},
  {id:'inspect',title:'Meet your new company',detail:'Check its popularity, income, operating costs and available upgrades.',action:'Manage my business',done:(s,p)=>Boolean(p.inspectedBusiness)},
  {id:'improve',title:'Make your first improvement',detail:'Try marketing or an upgrade. Improvements have costs, so check your cash first.',action:'View improvements',done:(s,p)=>(s?.businesses||[]).some(b=>
    Number(b.level)>1||Number(b.marketing)>0||Number(b.efficiency)>0||Number(b.workers)>0||Number(b.chainCount)>0||
    (b.locations||[]).some(l=>Number(l.level)>1||Number(l.marketing)>0||Number(l.efficiency)>0||Number(l.workers)>0||l.manager===true)
  )},
  {id:'markets',title:'Explore the market',detail:'See how fictional company stocks move, then decide how to expand your empire.',action:'Explore stocks',done:(s,p)=>Boolean(p.visitedMarkets)}
];
function read(){
  try{
    const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch(e){return {}}
}
let prefs=read(),open=false,card=null,trigger=null,previousBusinesses=null,successTimer=null,success=null;
function persist(){
 try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch(e){/* Still usable without storage. */}
}
function snapshot(state,flags={}){
 const completed=STEPS.map(step=>Boolean(step.done(state,flags)));
 const count=completed.filter(Boolean).length;
 const nextIndex=completed.findIndex(value=>!value);
 return {
  completed:count,total:STEPS.length,done:nextIndex<0,
  next:nextIndex<0?null:{
    id:STEPS[nextIndex].id,index:nextIndex,
    title:STEPS[nextIndex].title,detail:STEPS[nextIndex].detail,
    action:STEPS[nextIndex].action
  }
 };
}
function show(){
 open=true;prefs.dismissed=false;persist();draw();
}
function hide(){
 open=false;prefs.dismissed=true;persist();draw();trigger?.focus?.();
}
function navigate(id){
 if(!window.state?.started)return;
 if(id==='open'){
   window.ProfitLandsWorkspace?.show?.('businesses');
   document.getElementById('openBusinessShop')?.click();
 }else if(id==='inspect'||id==='improve'){
   if(!window.state.businesses?.length)return;
   window.ProfitLandsWorkspace?.show?.('businesses');
   if(typeof window.openManage==='function'){
     window.openManage(0);
     prefs.inspectedBusiness=true;persist();
   }
 }else if(id==='markets'){
   if(window.ProfitLandsWorkspace?.show?.('markets')){
     prefs.visitedMarkets=true;persist();
   }
 }
 draw();
}
function announceFirstBusiness(){
 if(!success||!window.state?.started)return;
 success.hidden=false;
 success.textContent='Your first business is open. Watch its cash flow and manage its growth.';
 clearTimeout(successTimer);
 successTimer=setTimeout(()=>{success.hidden=true},3500);
}
function draw(){
 if(!card||!trigger)return;
 const s=window.state;
 const progress=snapshot(s,prefs);
 const playing=Boolean(s?.started&&document.getElementById('gameScreen')?.classList.contains('active'));
 const businessCount=Array.isArray(s?.businesses)?s.businesses.length:0;
 if(previousBusinesses===0&&businessCount>0&&playing&&!prefs.firstBusinessCelebrated){
   prefs.firstBusinessCelebrated=true;persist();announceFirstBusiness();
 }
 previousBusinesses=businessCount;
 if(progress.done&&!prefs.completed){prefs.completed=true;persist()}
 trigger.hidden=!playing;
 trigger.textContent=progress.done?'Guide complete':'Getting started';
 trigger.setAttribute('aria-label',progress.done?'Review completed starter goals':'Show starter goals');
 const visible=playing&&open;
 card.hidden=!visible;
 if(!visible)return;
 const number=progress.next?progress.next.index+1:STEPS.length;
 card.querySelector('[data-cg-progress-label]').textContent=progress.done?'ALL STARTER GOALS COMPLETE':'STARTER GOAL '+number+' / '+STEPS.length;
 const title=card.querySelector('[data-cg-title]');
 const description=card.querySelector('[data-cg-description]');
 const button=card.querySelector('[data-cg-action]');
 const fill=card.querySelector('[data-cg-fill]');
 const bar=card.querySelector('[data-cg-bar]');
 title.textContent=progress.done?'Your empire is underway':progress.next.title;
 description.textContent=progress.done?'You have learned the essentials. Keep building, or visit the other workspaces when you want to explore.':progress.next.detail;
 button.textContent=progress.done?'Continue playing':progress.next.action;
 button.dataset.mission=progress.done?'done':progress.next.id;
 fill.style.width=Math.round(progress.completed/STEPS.length*100)+'%';
 bar.setAttribute('aria-valuenow',String(progress.completed));
}
function mount(){
 const header=document.querySelector('#gameScreen .pl-workspace-section-head');
 if(!header||card)return;
 trigger=document.createElement('button');
 trigger.type='button';
 trigger.className='pl-cg-guide-trigger';
 trigger.textContent='Getting started';
 trigger.addEventListener('click',show);
 header.appendChild(trigger);

 card=document.createElement('section');
 card.className='pl-cg-coach';
 card.hidden=true;
 card.setAttribute('aria-label','ProfitLands getting started');
 card.innerHTML='<div class="pl-cg-coach-top"><span data-cg-progress-label></span><button type="button" class="pl-cg-coach-dismiss" aria-label="Dismiss starter guide">Dismiss</button></div>'+
  '<div class="pl-cg-coach-body"><div class="pl-cg-coach-copy"><h3 data-cg-title></h3><p data-cg-description></p></div><button type="button" class="pl-cg-coach-action" data-cg-action></button></div>'+
  '<div class="pl-cg-coach-progress" role="progressbar" aria-label="Starter goals completed" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" data-cg-bar><span data-cg-fill></span></div>';
 header.insertAdjacentElement('afterend',card);
 card.querySelector('.pl-cg-coach-dismiss').addEventListener('click',hide);
 card.querySelector('[data-cg-action]').addEventListener('click',()=>{
   const step=card.querySelector('[data-cg-action]').dataset.mission;
   if(step==='done')hide();else navigate(step);
 });
 success=document.createElement('div');
 success.className='pl-cg-success';
 success.hidden=true;
 success.setAttribute('role','status');
 header.insertAdjacentElement('afterend',success);
 // Existing saved empires never get a forced first-time popup.
 open=Boolean(window.profitLandsPlatform?.freshEmpire&&!prefs.dismissed&&!prefs.completed);
 draw();
 window.addEventListener('profitlands:viewchange',event=>{
   if(event.detail?.view==='markets'){
     prefs.visitedMarkets=true;persist();
   }
   draw();
 });
 document.addEventListener('click',event=>{
   if(event.target?.closest?.('.business-card')&&window.state?.businesses?.length){
     prefs.inspectedBusiness=true;persist();draw();
   }
   if(event.target?.closest?.('[data-workspace-view="markets"]')){
     prefs.visitedMarkets=true;persist();draw();
   }
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')draw()});
 // One lightweight state read per second; no per-frame rendering or save calls.
 setInterval(()=>{
   if(document.visibilityState==='hidden')return;
   draw();
 },1200);
}
window.ProfitLandsCrazyCoach={snapshot,show,hide,navigate};
if(document.readyState==='complete')mount();
else window.addEventListener('load',mount,{once:true});
})();