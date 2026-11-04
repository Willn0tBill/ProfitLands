/* Lightweight game feedback. All effects reflect existing actions; no money is awarded here. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const reduce=()=>document.documentElement.classList.contains('pl-reduced-motion')||
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const lowPower=()=>Number(navigator.deviceMemory||4)<=2;
let lastClick=null,lastReward='',lastPulse=0,bursts=0;
function pulse(element){
 if(!element||reduce()||document.hidden)return false;
 element.classList.remove('pl-gain-flash');
 // Restart only the existing CSS animation; does not modify any stat value.
 void element.offsetWidth;
 element.classList.add('pl-gain-flash');
 setTimeout(()=>element.classList.remove('pl-gain-flash'),760);
 return true;
}
function celebrate(label){
 if(reduce()||lowPower()||document.hidden||bursts>2)return false;
 const rect=lastClick?.getBoundingClientRect?.();
 const x=rect?rect.left+rect.width/2:window.innerWidth/2;
 const y=rect?rect.top+rect.height/2:window.innerHeight*.58;
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 const layer=document.createElement('div');
 layer.className='pl-game-burst';layer.style.left=x+'px';layer.style.top=y+'px';
 const colors=['#ffe49c','#8df8dc','#bdadff','#ffb18a'];
 for(let i=0;i<7;i++){
  const shard=document.createElement('i');
  shard.className='pl-game-shard';
  shard.style.setProperty('--shard-color',colors[i%colors.length]);
  shard.style.setProperty('--angle',i*360/7+'deg');
  shard.style.setProperty('--range',38+(i%3)*12+'px');
  layer.appendChild(shard);
 }
 const reward=document.createElement('span');
 reward.className='pl-game-reward';
 reward.textContent=label;layer.appendChild(reward);
 document.body.appendChild(layer);bursts++;
 setTimeout(()=>{layer.remove();bursts=Math.max(0,bursts-1)},1050);
 return true;
}
function init(){
 document.addEventListener('pointerdown',event=>{
  lastClick=event.target?.closest?.('button,[role="button"],.business-card')||null;
 },{passive:true});
 const toast=$('toast');
 if(toast&&typeof MutationObserver==='function'){
  const rewarded=/\b(opened|upgraded|purchased|hired|earned|completed|claimed|expanded|sold|bought|unlocked|reward|level up|promoted)\b/i;
  const blocked=/\b(not enough|failed|error|cannot|unavailable|no actions|cancel|denied)\b/i;
  const check=()=>{
   const message=String(toast.textContent||'').trim();
   if(!toast.classList.contains('show')||!message||message===lastReward)return;
   lastReward=message;
   if(rewarded.test(message)&&!blocked.test(message))celebrate('★ NICE MOVE!');
  };
  new MutationObserver(check).observe(toast,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
 }
 for(const id of ['cash','netWorth','dailyIncome','actionsLeft']){
  const target=$(id);if(!target||typeof MutationObserver!=='function')continue;
  let previous=target.textContent;
  new MutationObserver(()=>{
   if(previous===target.textContent)return;
   previous=target.textContent;
   const now=Date.now();
   if(now-lastPulse<1250)return;
   lastPulse=now;
   pulse(target.closest?.('.stat'));
  }).observe(target,{characterData:true,childList:true,subtree:true});
 }
}
window.ProfitLandsGameFX={pulse,celebrate,isReducedMotion:reduce};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
