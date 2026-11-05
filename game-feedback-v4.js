/* ProfitLands gameplay feedback v4.
 * Non-authoritative presentation: observes real confirmed game notifications.
 * No game-state changes, cash calculations, or save writes. */
(function(){
'use strict';
const root=document.documentElement;
const $=id=>document.getElementById(id);
const reduced=()=>root.classList.contains('pl-reduced-motion')||
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const lowPower=()=>Number(navigator.deviceMemory||4)<=2||
 Number(navigator.hardwareConcurrency||4)<=2;
const playing=()=>Boolean($('gameScreen')?.classList.contains('active'));
const success=/\b(opened|upgraded|purchased|hired|earned|completed|claimed|expanded|sold|bought|unlocked|promoted|level up)\b/i;
const failure=/\b(not enough|failed|error|cannot|unavailable|no actions|cancel|denied|rejected|blocked)\b/i;
let active=null,hideTimer=null,removeTimer=null,lastMessage='',lastAt=0;
let hoverCard=null,pendingSpot=null,spotScheduled=false;

function qualifies(message){
 return typeof message==='string'&&message.length>0&&message.length<=240&&
 success.test(message)&&!failure.test(message);
}
function clearReceipt(){
 if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null}
 if(removeTimer!==null){clearTimeout(removeTimer);removeTimer=null}
 active?.remove?.();active=null;
}
function showReceipt(message){
 const text=String(message||'').trim().slice(0,240);
 if(!qualifies(text)||!playing()||document.hidden)return false;
 const now=Date.now();
 if(text===lastMessage&&now-lastAt<750)return false;
 lastMessage=text;lastAt=now;
 clearReceipt();
 const card=document.createElement('aside');
 card.className='pl-action-receipt';
 card.setAttribute('aria-hidden','true'); // The existing toast owns announcements.
 const symbol=document.createElement('span');
 symbol.className='pl-action-receipt-symbol';symbol.textContent='✓';
 const contents=document.createElement('span');
 contents.className='pl-action-receipt-copy';
 const heading=document.createElement('strong');
 heading.textContent='ACTION COMPLETE';
 const detail=document.createElement('span');
 detail.textContent=text; // Never HTML from a user-owned business name.
 contents.append(heading,detail);
 const track=document.createElement('i');
 track.className='pl-action-receipt-track';
 card.append(symbol,contents,track);
 document.body.appendChild(card);
 active=card;
 if(!reduced()){
  const header=document.querySelector('#gameScreen .pl-workspace-section-head');
  header?.classList.remove('pl-action-done');
  header?.classList.add('pl-action-done');
  setTimeout(()=>header?.classList.remove('pl-action-done'),650);
 }
 hideTimer=setTimeout(()=>{
  if(active!==card)return;
  card.classList.add('pl-action-receipt-out');
  removeTimer=setTimeout(()=>{
   if(active===card){card.remove();active=null}
   removeTimer=null;
  },260);
  hideTimer=null;
 },2700);
 return true;
}
function initToast(){
 if(typeof MutationObserver!=='function')return;
 const toast=$('toast');
 if(!toast)return;
 const inspect=()=>{
  if(!toast.classList.contains('show'))return;
  showReceipt(toast.textContent||'');
 };
 new MutationObserver(inspect).observe(toast,{
  attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true
 });
}
function updateSpotlight(){
 spotScheduled=false;
 const data=pendingSpot;pendingSpot=null;
 if(!data||!playing()||reduced()||lowPower()||document.hidden)return;
 const card=data.card;
 if(!card?.isConnected||typeof card.getBoundingClientRect!=='function')return;
 const rect=card.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 card.style.setProperty('--pl-spot-x',Math.max(0,Math.min(rect.width,data.x-rect.left))+'px');
 card.style.setProperty('--pl-spot-y',Math.max(0,Math.min(rect.height,data.y-rect.top))+'px');
}
function initSpotlight(){
 if(typeof document.addEventListener!=='function')return;
 document.addEventListener('pointermove',event=>{
  if(reduced()||lowPower()||!playing()||document.hidden||event.pointerType==='touch')return;
  const card=event.target?.closest?.('#businessList .business-card');
  if(!card)return;
  hoverCard=card;
  pendingSpot={card,x:event.clientX,y:event.clientY};
  if(spotScheduled)return;
  spotScheduled=true;
  (window.requestAnimationFrame||((fn)=>setTimeout(fn,16)))(updateSpotlight);
 },{passive:true});
 document.addEventListener('pointerout',event=>{
  const card=event.target?.closest?.('#businessList .business-card');
  if(!card||event.relatedTarget?.closest?.('#businessList .business-card')===card)return;
  if(hoverCard===card){hoverCard=null;pendingSpot=null}
 },{passive:true});
}
function init(){
 root.classList.add('pl-motion-v4');
 initToast();
 initSpotlight();
}
window.ProfitLandsGameFeedback={
 qualifies,showReceipt,isReducedMotion:reduced,isLowPower:lowPower,
 diagnostics:()=>({loaded:root.classList.contains('pl-motion-v4'),playing:playing(),reduced:reduced(),lowPower:lowPower()})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();