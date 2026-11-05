/* Living Empire: a visible animated city linked to actual game state.
   Presentation only: no simulated income, saves, purchases or cloud operations. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TYPES={
 coffee:{label:'Coffee Shop',icon:'CAFÉ',kind:'cafe',height:89},
 restaurant:{label:'Restaurant',icon:'DINER',kind:'food',height:103},
 gamestore:{label:'Game Store',icon:'GAMES',kind:'retail',height:112},
 hotel:{label:'Hotel',icon:'HOTEL',kind:'hotel',height:146},
 dealership:{label:'Car Dealership',icon:'MOTORS',kind:'retail',height:105},
 factory:{label:'Factory',icon:'WORKS',kind:'factory',height:120},
 software:{label:'Software Company',icon:'TECH',kind:'tech',height:160},
 logistics:{label:'Logistics Company',icon:'DEPOT',kind:'factory',height:132}
};
const MAX_VISIBLE=9;
const DAY_LENGTHS={fast:300,standard:900,long:3600,persistent:86400};
function phaseFor(state){
 if(!state?.started)return 'day';
 const duration=DAY_LENGTHS[state.mode]||DAY_LENGTHS.standard;
 const remaining=Number(state.timeLeft);
 if(!Number.isFinite(remaining)||remaining<0)return 'day';
 const fraction=Math.max(0,Math.min(1,remaining/duration));
 return fraction<.22?'night':fraction<.44?'dusk':'day';
}
let panel=null,overview=null,lastSignature='',interval=null,renderCount=0;
function nonnegativeInt(value,fallback=0){
 const n=Number(value);
 return Number.isFinite(n)?Math.max(0,Math.floor(n)):fallback;
}
function modelFor(state){
 const all=Array.isArray(state?.businesses)?state.businesses:[];
 const start=Math.max(0,all.length-MAX_VISIBLE);
 const buildings=all.slice(-MAX_VISIBLE).map((business,index)=>{
  const def=TYPES[business?.type]||{label:'Business',icon:'OFFICE',kind:'office',height:106};
  const level=Math.min(30,nonnegativeInt(business?.level,1)||1);
  const sites=Array.isArray(business?.locations)?business.locations.length:
   nonnegativeInt(business?.chainCount,0)+1;
  const locations=Math.min(25,sites||1);
  return {label:def.label,icon:def.icon,kind:def.kind,
   height:Math.min(188,def.height+(level-1)*8+Math.min(32,(locations-1)*5)),
   level,locations,index,businessIndex:start+index};
 });
 return {count:all.length,buildings,day:nonnegativeInt(state?.day,1)||1,
  totalLevels:all.reduce((sum,b)=>sum+(nonnegativeInt(b?.level,1)||1),0),phase:phaseFor(state)};
}
function signature(model){
 return [model.count,model.buildings.map(b=>[b.kind,b.icon,b.height,b.level,b.locations].join('-')).join('|')].join(':');
}
function make(tag,className,text){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=text;
 return el;
}
function createBuilding(data,ghost=false){
 const element=make(ghost?'div':'button','pl-city-building '+(ghost?'pl-city-building-ghost':'pl-city-'+data.kind));
 if(!ghost){
  element.type='button';
  element.dataset.businessIndex=String(data.businessIndex);
  element.setAttribute('aria-label','Manage '+data.label+', level '+data.level);
 }
 element.style.setProperty('--city-height',data.height+'px');
 element.style.setProperty('--city-order',String(data.index));
 element.title=ghost?'Future business location':data.label+' · Level '+data.level;
 element.appendChild(make('div','pl-city-roof'));
 const windows=make('div','pl-city-windows');
 for(let j=0;j<12;j++){
  const w=make('i','pl-city-window');
  w.style.setProperty('--window-delay',((j*3+data.index*5)%11)*-.34+'s');
  windows.appendChild(w);
 }
 element.appendChild(windows);
 element.appendChild(make('div','pl-city-storefront',ghost?'':data.icon));
 if(!ghost)element.appendChild(make('span','pl-city-profit-particle','$'));
 return element;
}
function render(state){
 if(!panel)return false;
 const model=modelFor(state);
 const count=$('plCityBusinessCount'),levels=$('plCityUpgradeCount');
 const day=$('plCityDay'),flow=$('plCityFlow'),hint=$('plCityHint');
 if(count)count.textContent=model.count.toLocaleString();
 const tickerCount=$('plCityTickerCount');
 if(tickerCount)tickerCount.textContent=model.count+' ACTIVE '+(model.count===1?'BUSINESS':'BUSINESSES');
 if(levels)levels.textContent=model.totalLevels.toLocaleString();
 if(day)day.textContent='DAY '+model.day;
 const phase=$('plCityPhase');if(phase)phase.textContent=model.phase.toUpperCase();
 panel.classList.toggle('pl-city-phase-night',model.phase==='night');
 panel.classList.toggle('pl-city-phase-dusk',model.phase==='dusk');
 if(hint)hint.textContent=model.count?
   'Select a building to manage it. Upgrades change the skyline.':
   'Your first shop will fill an empty lot.';
 const realFlow=$('dailyIncome')?.textContent?.trim();
 if(flow)flow.textContent=realFlow||'—';
 const key=signature(model);
 if(lastSignature===key)return true;
 lastSignature=key;
 const root=$('plCityBuildings');
 if(!root)return false;
 const fragment=document.createDocumentFragment();
 if(model.buildings.length){
  for(const building of model.buildings)fragment.appendChild(createBuilding(building));
 }else{
  for(let i=0;i<5;i++)fragment.appendChild(createBuilding({
   index:i,height:64+((i*31)%58),kind:'office',level:1
  },true));
 }
 root.replaceChildren(fragment);
 panel.classList.toggle('pl-city-empty',model.count===0);
 const more=$('plCityMore');
 if(more){
  const hidden=Math.max(0,model.count-MAX_VISIBLE);
  more.hidden=hidden===0;
  more.textContent=hidden?'+'+hidden+' more businesses':'';
 }
 renderCount++;
 return true;
}
function active(){
 return overview&&!overview.hidden&&!document.hidden&&
 $('gameScreen')?.classList.contains('active')&&window.state?.playType!=='multi';
}
function sync(force=false){
 if(!panel)return false;
 if(!force&&!active())return false;
 return render(window.state);
}
function mount(){
 if(panel)return true;
 overview=document.querySelector('#gameScreen .pl-workspace-view[data-workspace-content="overview"]');
 if(!overview)return false;
 panel=make('section','pl-city-panel pl-city-empty');
 panel.id='plLivingCity';
 panel.setAttribute('aria-label','Live animated empire city');
 panel.innerHTML="\n<header class=\"pl-city-head\"><div class=\"pl-city-head-copy\">\n  <div class=\"pl-city-kicker\"><span class=\"pl-city-live-dot\"></span> YOUR BUSINESS DISTRICT <span id=\"plCityDay\" class=\"pl-city-day\">DAY 1</span> <span id=\"plCityPhase\" class=\"pl-city-phase\">DAY</span></div>\n  <h3>Your city, your businesses.</h3>\n  <p id=\"plCityHint\">Your first shop will fill an empty lot.</p>\n </div><button type=\"button\" id=\"plCityManage\" class=\"pl-city-manage\">View businesses <span aria-hidden=\"true\">↗</span></button></header>\n<div class=\"pl-city-stage\" role=\"region\" aria-label=\"Interactive business district\">\n <div class=\"pl-city-stars\" aria-hidden=\"true\"></div><div class=\"pl-city-sun\" aria-hidden=\"true\"></div>\n <div class=\"pl-city-cloud pl-city-cloud-a\"></div><div class=\"pl-city-cloud pl-city-cloud-b\"></div>\n <div class=\"pl-city-distant\"></div><div class=\"pl-city-hill\"></div>\n <div class=\"pl-city-buildings\" id=\"plCityBuildings\" role=\"group\" aria-label=\"Select a building to manage a business\"></div>\n <div class=\"pl-city-pedestrian pl-city-pedestrian-a\" aria-hidden=\"true\"></div><div class=\"pl-city-pedestrian pl-city-pedestrian-b\" aria-hidden=\"true\"></div><div class=\"pl-city-lamp pl-city-lamp-a\"></div><div class=\"pl-city-lamp pl-city-lamp-b\"></div>\n <div class=\"pl-city-road\"><div class=\"pl-city-lanes\"></div>\n <div class=\"pl-city-car pl-city-car-a\"><i></i></div>\n <div class=\"pl-city-car pl-city-car-b\"><i></i></div>\n <div class=\"pl-city-van\"><i></i></div></div>\n <div class=\"pl-city-horizon-light\"></div>\n <span class=\"pl-city-more\" id=\"plCityMore\" hidden></span>\n</div>\n<footer class=\"pl-city-footer\">\n <div><span>ACTIVE BUSINESSES</span><strong id=\"plCityBusinessCount\">0</strong></div>\n <div><span>COMBINED LEVELS</span><strong id=\"plCityUpgradeCount\">0</strong></div>\n <div><span>CURRENT INCOME</span><strong id=\"plCityFlow\">—</strong></div>\n <span class=\"pl-city-live-label\"><i></i> DISTRICT VIEW</span>\n</footer>";
 overview.prepend(panel);
 const heading=document.querySelector('#gameScreen .pl-workspace-section-head');
 if(heading&&typeof heading.insertAdjacentElement==='function'&&!$('plCityTicker')){
  const ticker=make('div','pl-city-ticker');
  ticker.id='plCityTicker';
  ticker.setAttribute('aria-label','Live empire production activity');
  ticker.innerHTML='<span class="pl-city-ticker-status"><i></i> EMPIRE ACTIVITY</span>'+
   '<span class="pl-city-ticker-conveyor" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'+
   '<strong id="plCityTickerCount">0 ACTIVE BUSINESSES</strong>';
  heading.insertAdjacentElement('afterend',ticker);
 }
 const buildings=$('plCityBuildings');
 buildings?.addEventListener('click',event=>{
  const button=event.target?.closest?.('button[data-business-index]');
  if(!button)return;
  const index=Number(button.dataset.businessIndex);
  if(!Number.isSafeInteger(index)||index<0||index>=window.state?.businesses?.length)return;
  // Use the game's existing management workflow, not a duplicate purchase UI.
  window.openManage?.(index);
 });
 $('plCityManage')?.addEventListener('click',()=>{
  window.ProfitLandsWorkspace?.show?.('businesses');
  if(!Array.isArray(window.state?.businesses)||window.state.businesses.length===0)
   $('openBusinessShop')?.click?.();
 });
 window.addEventListener('profitlands:viewchange',event=>{
  if(event?.detail?.view==='overview')sync(true);
 });
 window.addEventListener('focus',()=>sync());
 document.addEventListener('visibilitychange',()=>sync());
 if(typeof window.setInterval==='function')interval=window.setInterval(()=>sync(),1300);
 sync(true);
 return true;
}
function init(){
 if(!mount()&&typeof MutationObserver==='function'){
  const game=$('gameScreen');
  if(game){
   const observer=new MutationObserver(()=>{
    if(mount())observer.disconnect();
   });
   observer.observe(game,{childList:true,subtree:true});
  }
 }
}
window.ProfitLandsLivingCity={
 mount,refresh:()=>sync(true),modelFor,phaseFor,
 diagnostics:()=>({mounted:!!panel,renderCount,active:!!active(),interval:!!interval})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();