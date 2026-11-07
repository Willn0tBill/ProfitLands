'use strict';
// World 1 client-side regressions: no Firebase credentials or live server writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','multiplayer-world.js'),'utf8');

function harness(options={}){
 const nodes=new Map(),listeners={},prefs=new Map();
 let now=1000000,visible='visible',view='world';
 const counts={me:0,board:0,players:0},intervals=[];
 const catalog=[{id:'coffee',name:'Coffee Shop',cost:500},{id:'hotel',name:'Hotel',cost:25000}];
 let player=Object.assign({
  uid:'qa-player',cash:1500,netWorth:1500,pvpEnabled:false,
  protectedUntil:0,nextAttackAt:0,businesses:[]
 },options.player||{});
 let rivals=options.rivals||[{uid:'rival',displayName:'Rival',pvpEnabled:false}];
 class Element {
  constructor(id='',attrs=''){
   this.id=id;this.dataset={};this.attributes={};this.listeners={};
   this.disabled=/\sdisabled(?:\s|=|$)/i.test(attrs);
   this.textContent='';this.value='';this.hidden=false;
   this.children=[];this.onclick=null;
   for(const m of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)){
    const key=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    this.dataset[key]=m[2];
   }
   this.classList={contains:n=>id==='gameScreen'&&n==='active'};
  }
  set innerHTML(v){
   this.html=String(v);this.children=[];
   for(const tag of this.html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
    const attrs=tag[2],id=attrs.match(/\sid="([^"]+)"/)?.[1]||'';
    if(!id&&tag[1]!=='button')continue;
    const node=new Element(id,attrs);
    if(id)nodes.set(id,node);
    if(tag[1]==='button')this.children.push(node);
   }
  }
  get innerHTML(){return this.html||''}
  querySelectorAll(selector){
   const data=selector.match(/^\[data-([\w-]+)\]$/)?.[1];
   if(data){
    const key=data.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    return this.children.filter(n=>n.dataset[key]!==undefined);
   }
   return [];
  }
  addEventListener(name,handler){this.listeners[name]=handler}
  setAttribute(name,value){this.attributes[name]=String(value)}
  focus(){}
 }
 nodes.set('gameScreen',new Element('gameScreen'));
 nodes.set('worldContent',new Element('worldContent'));
 const document={
  get visibilityState(){return visible},
  getElementById:id=>nodes.get(id)||null,
  querySelectorAll:selector=>{
   const key=selector.match(/^\[data-([\w-]+)\]$/)?.[1];
   if(!key)return [];
   const prop=key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
   return [...nodes.values()].flatMap(el=>el.children).filter(el=>el.dataset[prop]!==undefined);
  },
  readyState:'loading',
  addEventListener:(type,fn)=>listeners[type]=fn
 };
 class Clock extends Date {static now(){return now}}
 const window={
  state:{playType:'multi'},ProfitLandsPvPRules:{ATTACKS:[{
   id:'supplier',name:'Supply Disruption',icon:'⚔',baseCost:5000,
   penalty:.12,durationSeconds:480
  }]},
  ProfitLandsWorkspace:{active:()=>view},
  localStorage:{getItem:k=>prefs.get(k)||null,setItem:(k,v)=>prefs.set(k,String(v))},
  addEventListener:(type,fn)=>listeners[type]=fn,
  setInterval:(fn,delay)=>{intervals.push({fn,delay});return intervals.length}
 };
 const online={
  isConnected:()=>true,
  getCatalog:()=>catalog,
  getMyEmpire:async()=>{counts.me++;return {player:structuredClone(player)}},
  getLeaderboard:async()=>{counts.board++;return []},
  getPlayers:async()=>{counts.players++;return structuredClone(rivals)},
  togglePvP:async()=>{
   player.pvpEnabled=!player.pvpEnabled;
   return {player:structuredClone(player)};
  },
  buyBusiness:async id=>{
   const item=catalog.find(x=>x.id===id);
   if(!item||player.cash<item.cost)throw Error('insufficient_cash');
   player.cash-=item.cost;player.businesses.push({type:id,level:1});
   return {player:structuredClone(player)};
  },
  upgradeBusiness:async()=>({player:structuredClone(player)}),
  chatEnabled:()=>false
 };
 window.ProfitLandsOnline=online;
 vm.runInNewContext(source,{window,document,Date:Clock,console,Promise,structuredClone});
 listeners.DOMContentLoaded();
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {
  window,nodes,online,counts,prefs,intervals,settle,
  setTime:n=>now=n,setVisibility:s=>visible=s,setView:s=>view=s,
  setPlayer:next=>player=next,setRivals:next=>rivals=next,
  element:id=>nodes.get(id),buttons:(id,key)=>nodes.get(id)?.querySelectorAll('[data-'+key+']')||[]
 };
}
test('World 1 renders wallet once and does not double-query server on repeat render',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 assert.deepEqual(h.counts,{me:1,board:1,players:1});
 assert.match(h.element('worldStore').innerHTML,/My Online Empire/);
 assert.match(h.element('worldLastSynced').textContent,/Server-verified/);
 h.window.ProfitLandsWorld.render();await h.settle();
 assert.deepEqual(h.counts,{me:1,board:1,players:1},'connection event must not fetch the same records twice');
});
test('market prices and upgrades reflect the server wallet and 80-business cap',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 const getBuy=id=>h.buttons('worldStore','world-buy').find(b=>b.dataset.worldBuy===id);
 assert.equal(getBuy('coffee').disabled,false,'$1500 can purchase a $500 coffee shop');
 assert.equal(getBuy('hotel').disabled,true,'$1500 cannot purchase a $25,000 hotel');
 assert.match(h.element('worldStore').innerHTML,/Need \$23,500 more/);
 h.setPlayer({uid:'qa-player',cash:100000,netWorth:100000,pvpEnabled:false,
  protectedUntil:0,nextAttackAt:0,enterprise:{companyCap:80,siteCap:16},
  businesses:Array.from({length:80},()=>({type:'coffee',level:1}))});
 h.setTime(1_011_000); // manual refresh has a 10-second server quota guard
 await h.window.ProfitLandsWorld.refresh();await h.settle();
 assert.equal(getBuy('coffee').disabled,true);
 assert.match(h.element('worldStore').innerHTML,/80-business limit reached/);
});
test('PvP is visibly off by default and updates only after a server-confirmed toggle',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 assert.match(h.element('worldPvpStatus').textContent,/Your PvP: Off/);
 assert.equal(h.element('worldPvpToggle').textContent,'Enable PvP');
 assert.equal(h.buttons('worldContent','pvp-attack')[0].disabled,true);
 await h.element('worldPvpToggle').onclick();await h.settle();
 assert.match(h.element('worldPvpStatus').textContent,/Your PvP: On/);
 assert.equal(h.element('worldPvpToggle').textContent,'Turn PvP off');
 assert.equal(h.buttons('worldContent','pvp-attack')[0].disabled,true,'target is still opted out');
});
test('default background sync fetches only the player every five minutes in the visible World view',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 assert.equal(h.window.ProfitLandsWorld.autoSyncEnabled(),true);
 assert.equal(h.element('worldAutoSync').attributes['aria-pressed'],'true');
 assert.ok(h.intervals.some(x=>x.delay===500),'the local money display ticks every half-second');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.setTime(1_301_000);h.setVisibility('hidden');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.setVisibility('visible');h.setView('businesses');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.setView('world');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),true);
 await h.settle();
 assert.deepEqual(h.counts,{me:2,board:1,players:1},
  'background sync fetches only own account, not leaderboards or all rivals');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false,'no extra request immediately');
 h.element('worldAutoSync').onclick();
 assert.equal(h.window.ProfitLandsWorld.autoSyncEnabled(),false);
 assert.equal(h.prefs.get('profitlands-world1-auto-sync-v1'),'0');
 h.setTime(2_000_000);
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false,'opt-out persists');
});
test('half-second live wallet updates without Workers requests or client-side money mutation',async()=>{
 const h=harness({player:{
  uid:'qa-player',cash:400,netWorth:500,incomePerSecond:2,
  pvpEnabled:false,protectedUntil:0,nextAttackAt:0,businesses:[]}});
 h.window.ProfitLandsWorld.render();await h.settle();
 const before={...h.counts};
 assert.equal(h.element('worldLiveCash').textContent,'$400.00');
 h.setTime(1_000_500);
 assert.equal(h.window.ProfitLandsWorld.liveWalletTick(),true);
 assert.equal(h.element('worldLiveCash').textContent,'$401.00');
 assert.equal(h.element('worldLiveWorth').textContent,'$501.00');
 assert.deepEqual(h.counts,before,'500 ms animation sends zero network requests');
 const coffee=h.buttons('worldStore','world-buy').find(x=>x.dataset.worldBuy==='coffee');
 assert.equal(coffee.disabled,true);
 h.setTime(1_050_000);
 assert.equal(h.window.ProfitLandsWorld.liveWalletTick(),true);
 assert.equal(h.element('worldLiveCash').textContent,'$500.00');
 assert.equal(coffee.disabled,false,'a projected affordable shop can ask the server to approve purchase');
 assert.deepEqual(h.counts,before,'projected affordability is read-only');
 h.setVisibility('hidden');h.setTime(1_060_000);
 assert.equal(h.window.ProfitLandsWorld.liveWalletTick(),false);
 assert.equal(h.element('worldLiveCash').textContent,'$500.00');
 h.setVisibility('visible');h.setView('businesses');
 assert.equal(h.window.ProfitLandsWorld.liveWalletTick(),false);
 h.setView('world');
 assert.equal(h.window.ProfitLandsWorld.liveWalletTick(),true);
 assert.equal(h.element('worldLiveCash').textContent,'$520.00');
 assert.deepEqual(h.counts,before);
});

test('online upgrade buttons require server-verified affordability and respect the level cap',async()=>{
 const base={uid:'qa-player',cash:700,netWorth:1200,pvpEnabled:false,protectedUntil:0,nextAttackAt:0,
  businesses:[{type:'coffee',level:1}]};
 const h=harness({player:base});h.window.ProfitLandsWorld.render();await h.settle();
 let button=h.buttons('worldStore','world-upgrade')[0];
 assert.equal(button.disabled,true,'$700 cannot pay an $875 first upgrade');
 assert.match(h.element('worldStore').innerHTML,/Need \$175 more online cash/);
 h.setPlayer({...base,cash:900,netWorth:1400});
 h.setTime(1_012_000);await h.window.ProfitLandsWorld.refresh();await h.settle();
 button=h.buttons('worldStore','world-upgrade')[0];
 assert.equal(button.disabled,false,'$900 can pay a $875 first upgrade');
 h.setPlayer({...base,cash:900000,netWorth:900000,businesses:[{type:'coffee',level:30}]});
 h.setTime(1_024_000);await h.window.ProfitLandsWorld.refresh();await h.settle();
 button=h.buttons('worldStore','world-upgrade')[0];
 assert.equal(button.disabled,true,'level 30 is the server upgrade cap');
 assert.match(h.element('worldStore').innerHTML,/Max level/);
});
