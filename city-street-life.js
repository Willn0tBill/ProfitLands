/* ProfitLands street life: visual customers, suppliers and construction.
   Reads the real city and portfolio; never awards revenue or changes saved state.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const MAX_CUSTOMERS=3,MAX_DELIVERIES=1,MAX_VISIBLE=9;
const DELIVERY_TYPES=new Set(['coffee','restaurant','gamestore','hotel','dealership','factory','logistics']);
const reduced=()=>document.documentElement.classList.contains('pl-reduced-motion')||
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const lowPower=()=>Number(navigator.deviceMemory||4)<=2||
 Number(navigator.hardwareConcurrency||4)<=2;
let panel=null,view=null,stage=null,buildings=null,layer=null;
let loop=null,observer=null,customerNumber=0,deliveryNumber=0;
let nextCustomer=0,nextDelivery=0,previous=new Map(),initializedPortfolio=false,lastCount=0;
let arrivals=0,deliveries=0;
const actors=new Set(),timeouts=new Set();
function later(fn,ms){
 const timer=setTimeout(()=>{timeouts.delete(timer);fn()},ms);
 timeouts.add(timer);
 return timer;
}
function create(tag,cls){
 const el=document.createElement(tag);
 el.className=cls;
 return el;
}
function active(){
 return !!(panel&&view&&!view.hidden&&!document.hidden&&
 $('gameScreen')?.classList.contains('active')&&window.state?.playType==='single');
}
function allowed(){
 return active()&&!reduced();
}
function findBuilding(index){
 if(!buildings)return null;
 // Index is produced by LivingCity.modelFor and is safe for this exact portfolio.
 const nodes=buildings.children||[];
 for(const node of nodes){
  if(node.dataset?.businessIndex===String(index))return node;
 }
 return null;
}
function scenePoint(button){
 if(!button||!stage||typeof button.getBoundingClientRect!=='function'||
    typeof stage.getBoundingClientRect!=='function')return null;
 const parent=stage.getBoundingClientRect(),b=button.getBoundingClientRect();
 if(!(parent.width>0&&b.width>0))return null;
 return {x:Math.max(18,Math.min(parent.width-18,b.left+b.width/2-parent.left)),
  width:parent.width};
}
function visualData(){
 const model=window.ProfitLandsLivingCity?.modelFor?.(window.state);
 const shops=Array.isArray(model?.buildings)?model.buildings:[];
 return shops.filter(item=>Number.isSafeInteger(item.businessIndex)&&
   item.businessIndex>=0&&item.businessIndex<(window.state?.businesses?.length||0)&&
   findBuilding(item.businessIndex));
}
function weightedOptions(shops){
 const items=[];
 for(const shop of shops){
  const state=window.state?.businesses?.[shop.businessIndex]||{};
  const level=Number(shop.level)||1;
  const popularity=Number(state.popularity)||0;
  const weight=Math.min(5,1+Math.floor(Math.max(0,level-1)/3)+(popularity>=75?1:0));
  for(let i=0;i<weight;i++)items.push(shop);
 }
 return items;
}
function pickShop(shops,count){
 const weighted=weightedOptions(shops);
 return weighted.length?weighted[count%weighted.length]:null;
}
function decorateBuilding(button,kind,ms){
 if(!button?.classList)return;
 const name=kind==='delivery'?'pl-city-receiving':'pl-city-serving';
 button.classList.add(name);
 later(()=>button.classList.remove(name),ms);
}
function spawnCustomer(shops=visualData()){
 if(!allowed()||!layer||actors.size>=MAX_CUSTOMERS+MAX_DELIVERIES||!shops.length)return false;
 const shop=pickShop(shops,customerNumber++);
 const building=findBuilding(shop.businessIndex),point=scenePoint(building);
 if(!point)return false;
 const fromLeft=customerNumber%2===1;
 const start=fromLeft?-20:point.width+20;
 const exit=fromLeft?point.width+48:-50;
 const actor=create('div','pl-street-actor pl-street-customer pl-street-customer-'+(customerNumber%3));
 actor.setAttribute('aria-hidden','true');
 const head=create('i','pl-street-person-head');
 const torso=create('i','pl-street-person-body');
 const legs=create('i','pl-street-person-legs');
 actor.append(head,torso,legs);
 actor.style.setProperty('--street-start',start+'px');
 actor.style.setProperty('--street-to',(point.x-start)+'px');
 actor.style.setProperty('--street-exit',(exit-start)+'px');
 layer.appendChild(actor);actors.add(actor);
 const duration=7200;
 later(()=>{
  if(!actors.has(actor)||!allowed())return;
  const current=findBuilding(shop.businessIndex);
  decorateBuilding(current,'customer',2400);
  arrivals++;
 },Math.round(duration*.37));
 later(()=>{actor.remove();actors.delete(actor)},duration+100);
 return true;
}
function spawnDelivery(shops=visualData()){
 if(!allowed()||!layer||lowPower()||!shops.length)return false;
 if([...actors].some(actor=>actor.classList.contains('pl-street-delivery')))return false;
 const candidates=shops.filter(shop=>DELIVERY_TYPES.has(window.state?.businesses?.[shop.businessIndex]?.type));
 if(!candidates.length)return false;
 const shop=pickShop(candidates,deliveryNumber++);
 const building=findBuilding(shop.businessIndex),point=scenePoint(building);
 if(!point)return false;
 const fromLeft=deliveryNumber%2===1;
 const start=fromLeft?-98:point.width+100,exit=fromLeft?point.width+115:-115;
 const truck=create('div','pl-street-actor pl-street-delivery '+(fromLeft?'pl-street-east':'pl-street-west'));
 truck.setAttribute('aria-hidden','true');
 truck.append(create('i','pl-street-truck-cab'),create('i','pl-street-truck-window'),
  create('i','pl-street-truck-wheel pl-street-wheel-front'),
  create('i','pl-street-truck-wheel pl-street-wheel-back'));
 truck.style.setProperty('--street-start',start+'px');
 truck.style.setProperty('--street-to',(point.x-start)+'px');
 truck.style.setProperty('--street-exit',(exit-start)+'px');
 layer.appendChild(truck);actors.add(truck);
 const duration=9500;
 later(()=>{
  if(!actors.has(truck)||!allowed())return;
  const current=findBuilding(shop.businessIndex);
  decorateBuilding(current,'delivery',2850);
  deliveries++;
  const box=create('div','pl-street-cargo');
  box.setAttribute('aria-hidden','true');
  box.style.left=Math.max(0,point.x-8)+'px';
  layer.appendChild(box);
  later(()=>box.remove(),2850);
 },Math.round(duration*.38));
 later(()=>{truck.remove();actors.delete(truck)},duration+100);
 return true;
}
function onPortfolioChange(shops){
 const next=new Map();
 for(const shop of shops)next.set(shop.businessIndex,{
  level:Number(shop.level)||1,locations:Number(shop.locations)||1
 });
 if(initializedPortfolio&&window.state?.businesses?.length>=lastCount){
  for(const shop of shops){
   const before=previous.get(shop.businessIndex),now=next.get(shop.businessIndex);
   if(!before)continue;
   if(now.level>before.level||now.locations>before.locations){
    const building=findBuilding(shop.businessIndex);
    if(!building)continue;
    building.classList.add('pl-city-renovating');
    later(()=>building.classList.remove('pl-city-renovating'),1900);
   }
  }
 }
 previous=next;
 initializedPortfolio=true;
 lastCount=window.state?.businesses?.length||0;
}
function clearActors(){
 for(const actor of actors)actor.remove();
 actors.clear();
 layer?.querySelectorAll?.('.pl-street-cargo').forEach(node=>node.remove());
 for(const timeout of timeouts)clearTimeout(timeout);
 timeouts.clear();
 for(const node of buildings?.children||[]){
  node.classList?.remove('pl-city-serving','pl-city-receiving','pl-city-renovating');
 }
}
function tick(){
 if(!active()||reduced()){
  if(actors.size||timeouts.size)clearActors();
  return false;
 }
 const shops=visualData();
 // Detect portfolio growth even when there are no customers in this frame.
 onPortfolioChange(shops);
 if(!shops.length)return false;
 const now=Date.now();
 if(now>=nextCustomer){
  if(spawnCustomer(shops)){
   // More and larger shops create a livelier street, with a hard cap on actors.
   const averageLevel=shops.reduce((sum,shop)=>sum+(Number(shop.level)||1),0)/shops.length;
   nextCustomer=now+Math.max(2500,5300-shops.length*390-Math.min(1100,averageLevel*130));
  }else nextCustomer=now+1700;
 }
 if(now>=nextDelivery){
  if(spawnDelivery(shops))nextDelivery=now+Math.max(11000,18500-shops.length*700);
  else nextDelivery=now+5000;
 }
 return true;
}
function mount(){
 if(panel)return true;
 const city=$('plLivingCity'),overview=city?.closest?.('.pl-workspace-view');
 const scene=city?.querySelector?.('.pl-city-stage'),row=$('plCityBuildings');
 if(!city||!overview||!scene||!row)return false;
 panel=city;view=overview;stage=scene;buildings=row;
 layer=create('div','pl-street-life');
 layer.setAttribute('aria-hidden','true');
 stage.appendChild(layer);
 // Immediate activity as soon as the user opens their empire.
 window.addEventListener('profitlands:viewchange',event=>{
  if(event?.detail?.view==='overview'){
   // Defer until Living City refreshes its building DOM after navigation.
   later(()=>tick(),60);
  }else clearActors();
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)clearActors();else tick();
 });
 if(typeof window.setInterval==='function')loop=window.setInterval(tick,1150);
 if(typeof MutationObserver==='function'){
  observer=new MutationObserver(()=>{if(active())tick()});
  observer.observe(buildings,{childList:true});
 }
 tick();
 return true;
}
function init(){
 if(!mount()&&typeof MutationObserver==='function'){
  const screen=$('gameScreen');
  if(!screen)return;
  const connect=new MutationObserver(()=>{if(mount())connect.disconnect()});
  connect.observe(screen,{childList:true,subtree:true});
 }
}
window.ProfitLandsStreetLife={
 mount,tick,spawnCustomer,spawnDelivery,weightedOptions,
 diagnostics:()=>({mounted:!!panel,actors:actors.size,arrivals,deliveries,
  playing:!!active(),reduced:reduced(),lowPower:lowPower(),loop:!!loop})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();