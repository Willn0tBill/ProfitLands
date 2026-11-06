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
test('market prices and upgrades reflect the server wallet and 40-shop cap',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 const getBuy=id=>h.buttons('worldStore','world-buy').find(b=>b.dataset.worldBuy===id);
 assert.equal(getBuy('coffee').disabled,false,'$1500 can purchase a $500 coffee shop');
 assert.equal(getBuy('hotel').disabled,true,'$1500 cannot purchase a $25,000 hotel');
 assert.match(h.element('worldStore').innerHTML,/Need \$23,500 more/);
 h.setPlayer({uid:'qa-player',cash:100000,netWorth:100000,pvpEnabled:false,
  protectedUntil:0,nextAttackAt:0,businesses:Array.from({length:40},()=>({type:'coffee',level:1}))});
 h.setTime(1_011_000); // manual refresh has a 10-second server quota guard
 await h.window.ProfitLandsWorld.refresh();await h.settle();
 assert.equal(getBuy('coffee').disabled,true);
 assert.match(h.element('worldStore').innerHTML,/40-shop alpha cap reached/);
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
test('opt-in auto-sync respects a visible active World view and 2-minute interval',async()=>{
 const h=harness();h.window.ProfitLandsWorld.render();await h.settle();
 assert.equal(h.window.ProfitLandsWorld.autoSyncEnabled(),false);
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.element('worldAutoSync').onclick();
 assert.equal(h.window.ProfitLandsWorld.autoSyncEnabled(),true);
 assert.equal(h.prefs.get('profitlands-world1-auto-sync-v1'),'1');
 assert.equal(h.element('worldAutoSync').attributes['aria-pressed'],'true');
 h.setTime(1_130_000);h.setVisibility('hidden');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.setVisibility('visible');h.setView('businesses');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false);
 h.setView('world');
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),true);
 await h.settle();
 assert.deepEqual(h.counts,{me:2,board:2,players:2});
 assert.equal(h.window.ProfitLandsWorld.autoSyncIfDue(),false,'never poll again immediately');
 h.element('worldAutoSync').onclick();
 assert.equal(h.window.ProfitLandsWorld.autoSyncEnabled(),false);
});
