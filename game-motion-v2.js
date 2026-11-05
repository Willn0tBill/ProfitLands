/* ProfitLands Motion v3: visible, lightweight feedback for the actual game.
 * Cosmetic only: never edits economy values, business data or save state.
 */
(function(){
'use strict';
const root=document.documentElement;
const reduced=()=>root.classList.contains('pl-reduced-motion')||
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const lowPower=()=>Number(navigator.deviceMemory||4)<=2||
 Number(navigator.hardwareConcurrency||4)<=2;
const isPlaying=()=>document.getElementById('gameScreen')?.classList.contains('active')===true;
const frame=callback=>(window.requestAnimationFrame||((fn)=>setTimeout(fn,16)))(callback);
let previousView=null,generation=0,cleanupTimer=null;

function animateView(view){
 if(typeof view!=='string'||!/^[a-z0-9_-]{1,32}$/i.test(view))return false;
 if(reduced()||!isPlaying()||document.hidden)return false;
 const section=document.querySelector('#gameScreen .pl-workspace-view[data-workspace-content="'+view+'"]');
 if(!section||section.hidden||!section.classList.contains('active'))return false;
 const header=document.querySelector('.pl-workspace-section-head');
 if(previousView&&previousView!==section)previousView.classList.remove('pl-motion-enter');
 previousView=section;
 if(cleanupTimer!==null){clearTimeout(cleanupTimer);cleanupTimer=null}
 section.classList.remove('pl-motion-enter');
 header?.classList.remove('pl-motion-heading');
 const token=++generation;
 frame(()=>{
  if(token!==generation||reduced()||!isPlaying()||document.hidden||section.hidden||
     !section.classList.contains('active'))return;
  section.classList.add('pl-motion-enter');
  header?.classList.add('pl-motion-heading');
  // Unmount entrance classes after the transition, so normal real-time
  // economy updates cannot restart expensive layout-wide animations.
  cleanupTimer=setTimeout(()=>{
   if(token!==generation)return;
   section.classList.remove('pl-motion-enter');
   header?.classList.remove('pl-motion-heading');
   cleanupTimer=null;
  },760);
 });
 return true;
}
function setupCounters(){
 if(typeof MutationObserver!=='function')return;
 for(const id of ['cash','netWorth','dailyIncome','actionsLeft']){
  const number=document.getElementById(id);
  if(!number)continue;
  let old=number.textContent,lastMotion=0,clearTimer=null;
  const observer=new MutationObserver(()=>{
   const next=number.textContent;
   if(next===old)return;
   old=next;
   if(reduced()||lowPower()||document.hidden||!isPlaying())return;
   const now=Date.now();
   // Cash can update each second: avoid perpetual repeated animation.
   const cooldown=id==='cash'||id==='netWorth'?1800:850;
   if(now-lastMotion<cooldown)return;
   lastMotion=now;
   if(clearTimer!==null)clearTimeout(clearTimer);
   number.classList.remove('pl-motion-value');
   frame(()=>{
    if(!reduced()&&isPlaying())number.classList.add('pl-motion-value');
   });
   clearTimer=setTimeout(()=>{number.classList.remove('pl-motion-value');clearTimer=null},440);
  });
  observer.observe(number,{childList:true,characterData:true,subtree:true});
 }
}
function setupEntrance(){
 if(typeof MutationObserver!=='function')return;
 const screen=document.getElementById('gameScreen');
 if(!screen)return;
 let wasActive=isPlaying();
 const observer=new MutationObserver(()=>{
  const active=isPlaying();
  if(active&&!wasActive){
   const view=window.ProfitLandsWorkspace?.active?.();
   if(view)animateView(view);
  }
  wasActive=active;
 });
 observer.observe(screen,{attributes:true,attributeFilter:['class']});
}
function setupRipples(){
 if(typeof document.addEventListener!=='function'||typeof document.createElement!=='function')return;
 document.addEventListener('pointerdown',event=>{
  if(reduced()||document.hidden||!isPlaying())return;
  const button=event.target?.closest?.('button');
  // A ripple host sets position:relative. On an absolutely positioned X
  // it displaces the button before click, making the dialog appear impossible
  // to close. Never add ripple hosts to dismiss or menu controls.
  if(button?.matches?.('.modal-close,[data-close],#plGameMenu,#plFullscreenToggle'))return;
  if(!button||button.disabled||!button.closest?.('#gameScreen, .modal:not(.hidden)')||
    typeof button.getBoundingClientRect!=='function')return;
  const rect=button.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const ripple=document.createElement('span');
  ripple.className='pl-motion-ripple';
  ripple.setAttribute('aria-hidden','true');
  const x=Number.isFinite(event.clientX)?event.clientX-rect.left:rect.width/2;
  const y=Number.isFinite(event.clientY)?event.clientY-rect.top:rect.height/2;
  ripple.style.left=x+'px';
  ripple.style.top=y+'px';
  button.classList.add('pl-motion-ripple-host');
  button.appendChild(ripple);
  setTimeout(()=>{
   ripple.remove();
   if(!button.querySelector?.('.pl-motion-ripple'))button.classList.remove('pl-motion-ripple-host');
  },640);
 },{passive:true});
}
function init(){
 root.classList.add('pl-motion-v2');
 root.classList.add('pl-motion-v3');
 if(lowPower())root.classList.add('pl-motion-lite');
 window.addEventListener('profitlands:viewchange',event=>animateView(event?.detail?.view));
 setupCounters();
 setupEntrance();
 setupRipples();
 if(isPlaying()){
  const view=window.ProfitLandsWorkspace?.active?.();
  if(view)animateView(view);
 }
}
window.ProfitLandsMotionV2={
 animateView,isReducedMotion:reduced,isLowPower:lowPower,
 diagnostics:()=>({loaded:root.classList.contains('pl-motion-v3'),playing:isPlaying(),
  reduced:reduced(),lowPower:lowPower()})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
