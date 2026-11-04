'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'enhancements.js'),'utf8');
const districts=['downtown','suburbs','tourist','university','waterfront','tech','industrial'];
function harness(count=7){
 const b={type:'coffee',name:'Sunrise Coffee',level:1,marketing:0,efficiency:0,
  popularity:60,chainCount:count-1,locationManagementVersion:1,
  locations:Array.from({length:count},(_,i)=>({
   id:districts[i%districts.length],name:districts[i%districts.length],
   level:1,marketing:0,efficiency:0,workers:0,manager:false,basePopularity:60,
   demand:1.1,rent:1.2
  }))
 };
 const state={started:true,businesses:[b],cash:10000000,actions:100,news:[],stocks:{},property:0};
 const nodes=new Map();const get=id=>{
  if(!nodes.has(id))nodes.set(id,{
   id,innerHTML:'',onclick:null,classList:{add(){},remove(){}},dataset:{}
  });
  return nodes.get(id);
 };
 let saved=0,rendered=0;const notices=[],selected=[],siteEstimates=[],factorCalls=[];
 let choices=[];
 const document={
  getElementById:get,
  addEventListener(){},
  querySelectorAll(selector){
   if(selector!=='[data-location]')return [];
   const html=get('manageContent').innerHTML;
   choices=[...html.matchAll(/<button[^>]*data-location="([^"]+)"[^>]*>/g)].map(m=>({
    dataset:{location:m[1]},disabled:/\sdisabled\b/.test(m[0]),onclick:null
   }));
   return choices;
  }
 };
 const window={
  openManage:(i,j)=>selected.push([i,j]),
  ProfitLandsEconomy:{
   companyFactors:company=>{factorCalls.push(company);return{type:company.type}},
   locationProfit:(company,site,index,factors)=>{
    siteEstimates.push({index,id:site.id,level:site.level,workers:site.workers,factors});
    return 120;
   }
  },
  ProfitLandsRealtime:{period:60,formatRate:n=>'$'+n.toFixed(2)}
 };
 const context={
  window,document,state,console,
  $:get,
  BUSINESS_TYPES:[{id:'coffee',name:'Coffee Shop',cost:500,baseRevenue:115,baseExpense:48}],
  STOCKS:[],money:n=>'$'+Number(n).toFixed(2),
  spendAction:amount=>{
   if(!Number.isFinite(amount)||amount<0||state.actions<1||state.cash<amount)return false;
   state.actions--;state.cash-=amount;return true;
  },
  save:()=>saved++,render:()=>rendered++,toast:msg=>notices.push(msg),
  closeModal:()=>{},setTimeout:()=>1,Math
 };
 vm.createContext(context);
 new vm.Script(source,{filename:'enhancements.js'}).runInContext(context);
 return{state,b,window,document,get,selected,siteEstimates,factorCalls,notices,
  options:()=>choices,saved:()=>saved,rendered:()=>rendered};
}
test('all seven districts remain available after owning one of each',()=>{
 const h=harness(7);
 h.window.manageAction(0,'chain');
 const options=h.options();
 assert.equal(options.length,7);
 assert.ok(options.every(x=>!x.disabled),'districts are reusable, not one-time slots');
 const html=h.get('manageContent').innerHTML;
 assert.match(html,/multiple independently managed branches/);
 assert.match(html,/1 existing branch/);
 assert.match(html,/Est\. \+\$2\.00\/sec/);
 assert.equal(h.factorCalls.length,1,'the seven forecasts share one company context');
 assert.equal(h.siteEstimates.length,7);
 assert.ok(h.siteEstimates.every(x=>x.index===7&&x.factors.type==='coffee'));
});
test('opening a second branch in the same district uses one action and focuses the new location',()=>{
 const h=harness(7),oldCash=h.state.cash,oldActions=h.state.actions,oldFirst=JSON.stringify(h.b.locations[0]);
 h.window.manageAction(0,'chain');
 const downtown=h.options().find(x=>x.dataset.location==='downtown');
 assert.ok(downtown&&!downtown.disabled);
 downtown.onclick();
 assert.equal(h.b.locations.length,8);
 assert.equal(h.b.chainCount,7);
 assert.equal(h.b.locations[7].id,'downtown');
 assert.equal(h.b.locations[7].name,'Downtown · Branch 2');
 assert.equal(h.b.locations[7].level,1);
 assert.equal(h.b.locations[7].workers,0);
 assert.equal(h.state.cash,oldCash-15500);
 assert.equal(h.state.actions,oldActions-1);
 assert.equal(JSON.stringify(h.b.locations[0]),oldFirst,'original branch must be untouched');
 assert.deepEqual(h.selected,[[0,7]],'open the newly bought branch inside management');
 assert.equal(h.saved(),1);
 assert.equal(h.rendered(),1);
 assert.equal(h.state.news.length,1);
});
test('repeated purchases make uniquely named independent branches without district exhaustion',()=>{
 const h=harness(7);
 for(let n=2;n<=4;n++){
  h.window.manageAction(0,'chain');
  const downtown=h.options().find(x=>x.dataset.location==='downtown');
  assert.ok(downtown&&!downtown.disabled);
  downtown.onclick();
  assert.equal(h.b.locations.at(-1).name,'Downtown · Branch '+n);
 }
 assert.equal(h.b.locations.length,10);
 assert.equal(h.b.locations.filter(l=>l.id==='downtown').length,4);
 assert.equal(h.saved(),3);
});
test('branch purchasing stops before crossing the backup-supported per-company limit',()=>{
 const h=harness(50000),before=h.state.cash,actions=h.state.actions;
 h.window.manageAction(0,'chain');
 assert.ok(h.options().every(x=>x.disabled));
 assert.match(h.get('manageContent').innerHTML,/supported location limit/);
 h.options()[0].onclick();
 assert.equal(h.b.locations.length,50000);
 assert.equal(h.state.cash,before);
 assert.equal(h.state.actions,actions);
 assert.equal(h.saved(),0);
});
test('empire-wide location limit prevents unsaveable purchases in a smaller company',()=>{
 const h=harness(1),other={type:'coffee',name:'Second Company',
  locations:Array.from({length:99999},()=>({id:'tech'}))};
 h.state.businesses.push(other);
 const before=h.state.cash;
 h.window.manageAction(0,'chain');
 assert.ok(h.options().every(x=>x.disabled));
 h.options()[0].onclick();
 assert.equal(h.b.locations.length,1);
 assert.equal(h.state.cash,before);
 assert.equal(h.saved(),0);
});
