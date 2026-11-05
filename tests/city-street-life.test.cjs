'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'city-street-life.js'),'utf8');
const css=fs.readFileSync(path.join(root,'city-street-life.css'),'utf8');

function classes(initial=[]){
 const set=new Set(initial);
 return {add:key=>set.add(key),remove:(...keys)=>keys.forEach(key=>set.delete(key)),
  contains:key=>set.has(key)};
}
function node(tag='div'){
 const classNames=classes(),children=[];
 const n={tag,tagName:tag.toUpperCase(),children,style:{props:{},
    setProperty(key,value){this.props[key]=value}},
  classList:classNames,dataset:{},removed:false,parentElement:null,attributes:{},
  setAttribute(key,value){this.attributes[key]=value},
  append(...els){for(const el of els)this.appendChild(el)},
  appendChild(el){children.push(el);el.parentElement=this;return el},
  remove(){this.removed=true;if(this.parentElement){
   const siblings=this.parentElement.children;
   const index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1)
  }},
  getBoundingClientRect(){return this.rect||{left:0,width:500,height:240,top:0}},
  querySelectorAll(selector){return selector==='.pl-street-cargo'?
   children.filter(c=>c.className==='pl-street-cargo'):[]}
 };
 Object.defineProperty(n,'className',{
  set(s){n._cls=s;for(const item of String(s).split(/\s+/).filter(Boolean))classNames.add(item)},
  get(){return n._cls||''}
 });
 return n;
}
function setup({businesses=[{type:'coffee',level:1,popularity:55}],
  playing=true,hidden=false,reduced=false,systemReduced=false,
  memory=8,cores=8,playType='single'}={}){
 let now=10000,serial=1;
 const timers=new Map(),intervals=[],events={},docEvents={},observers=[];
 const city=node('section'),overview=node('section'),stage=node('div'),buildings=node('div');
 const game=node('section');game.classList=classes(playing?['active']:[]);
 city.closest=selector=>selector==='.pl-workspace-view'?overview:null;
 city.querySelector=selector=>selector==='.pl-city-stage'?stage:null;
 stage.rect={left:0,width:520,height:260,top:0};
 overview.hidden=false;
 const state={playType,businesses:businesses.map(b=>({...b}))};
 function addBuilding(index){
  const b=node('button');b.dataset.businessIndex=String(index);
  b.rect={left:32+index*48,width:35,height:80,top:80};
  buildings.appendChild(b);return b;
 }
 state.businesses.forEach((_,i)=>{if(i>=Math.max(0,state.businesses.length-9))addBuilding(i)});
 const document={
  readyState:'complete',hidden,documentElement:{classList:classes(reduced?['pl-reduced-motion']:[])},
  getElementById:id=>({plLivingCity:city,plCityBuildings:buildings,gameScreen:game})[id]||null,
  createElement:node,
  addEventListener:(type,fn)=>{docEvents[type]=fn}
 };
 class MutationObserver{
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(target,config){this.target=target;this.config=config}
  disconnect(){this.disconnected=true}
 }
 const window={
  state,
  matchMedia:()=>({matches:systemReduced}),
  addEventListener:(type,fn)=>{events[type]=fn},
  setInterval:fn=>{intervals.push(fn);return intervals.length},
  ProfitLandsLivingCity:{modelFor(st){
   const start=Math.max(0,st.businesses.length-9);
   return {buildings:st.businesses.slice(-9).map((b,i)=>({
    businessIndex:start+i,level:b.level||1,locations:b.locations?.length||1
   }))};
  }}
 };
 const context={document,window,MutationObserver,
  navigator:{deviceMemory:memory,hardwareConcurrency:cores},
  Date:{now:()=>now},setTimeout:(fn,delay)=>{const id=serial++;timers.set(id,{fn,at:now+delay});return id},
  clearTimeout:id=>timers.delete(id),console};
 vm.runInNewContext(script,context,{filename:'city-street-life.js'});
 function advance(ms){
  const end=now+ms;
  for(let i=0;i<200;i++){
   let firstId=null,earliest=Infinity;
   for(const [id,t] of timers){if(t.at<=end&&t.at<earliest){earliest=t.at;firstId=id}}
   if(firstId===null)break;
   const t=timers.get(firstId);timers.delete(firstId);now=t.at;t.fn();
  }
  now=end;
 }
 return {window,document,stage,buildings,city,overview,game,state,intervals,
  observers,timers,advance,events,docEvents,
  api:window.ProfitLandsStreetLife,addBuilding,
  now:()=>now
 };
}

test('new game with empty lots has no imaginary customers or deliveries',()=>{
 const h=setup({businesses:[]});
 assert.equal(h.api.diagnostics().mounted,true);
 assert.equal(h.api.diagnostics().actors,0);
 assert.equal(h.api.diagnostics().arrivals,0);
 assert.equal(h.api.diagnostics().deliveries,0);
 assert.equal(h.api.spawnCustomer(),false);
 assert.equal(h.api.spawnDelivery(),false);
});

test('a real owned shop immediately brings street customers and a real shop visit',()=>{
 const h=setup();
 assert.equal(h.api.diagnostics().actors,2,'one customer and one supply truck at first play');
 const visitor=h.stage.children[0].children.find(x=>x.classList.contains('pl-street-customer'));
 assert.ok(visitor);
 assert.match(visitor.style.props['--street-to'],/px$/);
 assert.equal(visitor.attributes['aria-hidden'],'true');
 h.advance(2750);
 assert.equal(h.api.diagnostics().arrivals,1);
 assert.equal(h.buildings.children[0].classList.contains('pl-city-serving'),true);
 h.advance(2500);
 assert.equal(h.buildings.children[0].classList.contains('pl-city-serving'),false);
});

test('supply vans target eligible stores, unload a crate, and depart without payouts',()=>{
 const h=setup({businesses:[{type:'factory',level:3,popularity:64}]});
 const delivery=h.stage.children[0].children.find(x=>x.classList.contains('pl-street-delivery'));
 assert.ok(delivery,'factory should have delivery vehicle');
 h.advance(3700);
 assert.equal(h.api.diagnostics().deliveries,1);
 assert.equal(h.buildings.children[0].classList.contains('pl-city-receiving'),true);
 assert.ok(h.stage.children[0].children.some(x=>x.className==='pl-street-cargo'));
 h.advance(6200);
 assert.equal(h.api.diagnostics().actors,0);
 assert.equal(h.buildings.children[0].classList.contains('pl-city-receiving'),false);
 assert.equal(h.state.businesses[0].level,3,'no upgrade or payout from visual delivery');
});

test('software firms still attract customers without fake supply trucks',()=>{
 const h=setup({businesses:[{type:'software',level:7}]});
 assert.equal(h.api.diagnostics().actors,1);
 assert.equal(h.api.diagnostics().deliveries,0);
 assert.equal(h.api.spawnDelivery(),false);
});

test('visitor weights scale with actual business levels and popularity',()=>{
 const h=setup({businesses:[{type:'coffee',level:1,popularity:20},
  {type:'hotel',level:12,popularity:90}]});
 const options=h.api.weightedOptions([{businessIndex:0,level:1},{businessIndex:1,level:12}]);
 assert.equal(options.filter(s=>s.businessIndex===0).length,1);
 assert.equal(options.filter(s=>s.businessIndex===1).length,5);
 assert.equal(options.length,6);
});

test('visitors are bounded at three and low-powered devices use one and skip deliveries',()=>{
 const h=setup({businesses:[{type:'restaurant',level:9}]});
 for(let i=0;i<15;i++)h.api.spawnCustomer();
 const visitors=h.stage.children[0].children.filter(x=>x.classList.contains('pl-street-customer'));
 assert.equal(visitors.length,3);
 const lite=setup({businesses:[{type:'coffee',level:4}],memory:2,cores:2});
 assert.equal(lite.api.diagnostics().actors,1);
 for(let i=0;i<12;i++)lite.api.spawnCustomer();
 assert.equal(lite.api.diagnostics().actors,1);
 assert.equal(lite.api.spawnDelivery(),false);
});

test('upgrading a business triggers temporary construction visuals, without changing level',()=>{
 const h=setup({businesses:[{type:'hotel',level:2}]});
 h.state.businesses[0].level=6;
 h.api.tick();
 assert.equal(h.buildings.children[0].classList.contains('pl-city-renovating'),true);
 assert.equal(h.state.businesses[0].level,6);
 h.advance(1950);
 assert.equal(h.buildings.children[0].classList.contains('pl-city-renovating'),false);
});

test('buying another business reveals a NOW OPEN animation on its building',()=>{
 const h=setup({businesses:[{type:'coffee',level:1}]});
 h.state.businesses.push({type:'restaurant',level:1});
 h.addBuilding(1);
 h.api.tick();
 assert.equal(h.buildings.children[1].classList.contains('pl-city-new-open'),true);
 h.advance(1660);
 assert.equal(h.buildings.children[1].classList.contains('pl-city-new-open'),false);
});

test('switching screens or backgrounding clears existing actors and never runs simulation',()=>{
 const h=setup();
 assert.ok(h.api.diagnostics().actors>0);
 h.events['profitlands:viewchange']({detail:{view:'businesses'}});
 assert.equal(h.api.diagnostics().actors,0);
 h.overview.hidden=true;
 assert.equal(h.api.tick(),false);
 h.overview.hidden=false;
 h.document.hidden=true;
 assert.equal(h.api.spawnCustomer(),false);
 assert.equal(h.api.tick(),false);
});

test('OS and user reduced motion suppress activity but preserve business data',()=>{
 for(const opts of [{reduced:true},{systemReduced:true},{playType:'multi'}]){
  const h=setup(opts);
  assert.equal(h.api.diagnostics().actors,0);
  assert.equal(h.api.spawnCustomer(),false);
  assert.equal(h.api.spawnDelivery(),false);
  assert.equal(h.state.businesses.length,1);
 }
});

test('visual activity loads after city and honors CSS accessibility without network or save writes',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('city-street-life.css')>html.indexOf('district-theme.css'));
 assert.ok(html.indexOf('city-street-life.js')>html.indexOf('living-city.js'));
 assert.match(html,/city-street-life\.css\?v=street01/);
 assert.match(html,/city-street-life\.js\?v=street01/);
 for(const name of ['plStreetVisit','plStreetDelivery','plStreetCargo','plStreetBuild',
  'pl-city-serving','pl-city-receiving','pl-city-renovating','pl-city-new-open']){
  assert.ok(css.includes(name),name);
 }
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/html\.pl-reduced-motion/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|fetch\(|\.cash\s*[+*/-]?=|\.actions\s*[+*/-]?=/);
});
