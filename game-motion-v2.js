/* ProfitLands motion v2: cosmetic-only game animation coordinator.
   Never updates game state, timers, purchases, or save data. */
(function(){
'use strict';
const root=document.documentElement;
const reduced=()=>root.classList.contains('pl-reduced-motion')||
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const lowPower=()=>Number(navigator.deviceMemory||4)<=2||
 Number(navigator.hardwareConcurrency||4)<=2;
const isPlaying=()=>document.getElementById('gameScreen')?.classList.contains('active')===true;
const frame=callback=>(window.requestAnimationFrame||((fn)=>setTimeout(fn,16)))(callback);
let previousView=null;
let generation=0;

function animateView(view){
 if(typeof view!=='string'||!/^[a-z0-9_-]{1,32}$/i.test(view))return false;
 if(reduced()||lowPower()||!isPlaying()||document.hidden)return false;
 const section=document.querySelector('#gameScreen .pl-workspace-view[data-workspace-content="'+view+'"]');
 if(!section||section.hidden||!section.classList.contains('active'))return false;
 if(previousView&&previousView!==section)previousView.classList.remove('pl-motion-enter');
 previousView=section;
 // Re-arm the active page without forcing a synchronous layout flush.
 section.classList.remove('pl-motion-enter');
 const token=++generation;
 frame(()=>{
  if(token!==generation||reduced()||!isPlaying()||document.hidden||section.hidden||
    !section.classList.contains('active'))return;
  section.classList.add('pl-motion-enter');
  // Keep the animation scoped to an actual navigation, not every later
  // background rerender of a business list or leaderboard.
  setTimeout(()=>{
   if(token===generation)section.classList.remove('pl-motion-enter');
  },480);
 });
 return true;
}
function setupCounters(){
 if(typeof MutationObserver!=='function')return;
 for(const id of ['cash','netWorth','dailyIncome','actionsLeft']){
  const number=document.getElementById(id);
  if(!number)continue;
  let old=number.textContent;
  let lastMotion=0;
  let clearTimer=null;
  const observer=new MutationObserver(()=>{
   const next=number.textContent;
   if(next===old)return;
   old=next;
   if(reduced()||lowPower()||document.hidden||!isPlaying())return;
   const now=Date.now();
   if(now-lastMotion<800)return;
   lastMotion=now;
   if(clearTimer!==null)clearTimeout(clearTimer);
   number.classList.remove('pl-motion-value');
   frame(()=>{
    if(!reduced()&&isPlaying())number.classList.add('pl-motion-value');
   });
   clearTimer=setTimeout(()=>{number.classList.remove('pl-motion-value');clearTimer=null},310);
  });
  observer.observe(number,{childList:true,characterData:true,subtree:true});
 }
}
function init(){
 root.classList.add('pl-motion-v2');
 if(lowPower())root.classList.add('pl-motion-lite');
 window.addEventListener('profitlands:viewchange',event=>animateView(event?.detail?.view));
 setupCounters();
 if(isPlaying()){
  const view=window.ProfitLandsWorkspace?.active?.();
  if(view)animateView(view);
 }
}
window.ProfitLandsMotionV2={animateView,isReducedMotion:reduced,isLowPower:lowPower};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
