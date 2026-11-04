'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','location-operations.js'),'utf8');
function harness(count=3){
 const handlers={};const state={started:true,cash:1000000,actions:100,news:[],businesses:[]};
 for(let i=0;i<count;i++)state.businesses.push({
  type:'coffee',name:'Company '+i,level:1,popularity:60,marketing:0,efficiency:0,
  chainCount:0,financialBalance:0,locations:[{id:'downtown',name:'Downtown '+i,level:1,workers:0,basePopularity:60,rent:1,demand:1}]
 });
 const type={id:'coffee',name:'Coffee Shop',icon:'☕',desc:'Coffee stores',cost:500,baseExpense:48};
 const controls=new Map();
 const content={innerHTML:'',
  querySelector(selector){
   if(selector==='#plCompanyPrev'||selector==='#plCompanyNext'){
    if(!controls.has(selector))controls.set(selector,{disabled:false,onclick:null});
    return controls.get(selector);
   }
   return null;
  },
  querySelectorAll(){return[]}
 };
 const modal={
  classList:{value:new Set(['hidden']),add(v){this.value.add(v)},remove(v){this.value.delete(v)},contains(v){return this.value.has(v)}},
  querySelector(selector){
   if(selector==='.pl-company-nav:not([hidden])'&&content.innerHTML.includes('class="pl-company-nav"')&&!content.innerHTML.includes('class="pl-company-nav" aria-label="Switch companies" hidden'))return{};
   return null;
  }
 };
 const document={getElementById:id=>id==='manageContent'?content:id==='manageModal'?modal:null,
  addEventListener(name,cb){handlers[name]=cb}};
 const window={ProfitLandsGrowth:{workforceTier:()=>({cap:100})},
  ProfitLandsRealtime:{period:60,formatRate:n=>'$'+n},
  ProfitLandsEconomy:{companyFactors:()=>({}),locationProfit:()=>120},
  businessDailyProfit:()=>120,confirm:()=>true
 };
 const context={document,window,state,BUSINESS_TYPES:[type],
  money:n=>'$'+Number(n).toFixed(0),
  spendAction:()=>true,save(){},render(){},toast(){},console};
 new vm.Script(code,{filename:'location-operations.js'}).runInContext(vm.createContext(context));
 const key=(key,opts={})=>{
  const e={key,altKey:true,ctrlKey:false,metaKey:false,target:{},prevented:false,
   preventDefault(){this.prevented=true},...opts};
  handlers.keydown(e);return e;
 };
 return{state,window,content,modal,controls,key};
}
test('company navigation renders accurate counters and disabled boundary controls',()=>{
 const h=harness();
 h.window.openManage(0);
 assert.match(h.content.innerHTML,/Company 1 of 3/);
 assert.match(h.content.innerHTML,/id="plCompanyPrev" type="button" disabled/);
 assert.match(h.content.innerHTML,/id="plCompanyNext" type="button"  aria-label/);
 h.controls.get('#plCompanyNext').onclick();
 assert.match(h.content.innerHTML,/Company 1<\/h2>/i); // Now managing Company 1
 assert.match(h.content.innerHTML,/Company 2 of 3/);
 h.controls.get('#plCompanyPrev').onclick();
 assert.match(h.content.innerHTML,/Company 0<\/h2>/i);
});
test('Alt-arrow navigation works in management view but not inside form fields or other dialogs',()=>{
 const h=harness(),before=JSON.stringify(h.state);
 h.window.openManage(0);
 const next=h.key('ArrowRight');
 assert.equal(next.prevented,true);
 assert.match(h.content.innerHTML,/Company 2 of 3/);
 const typed=h.key('ArrowRight',{target:{closest:()=>({})}});
 assert.equal(typed.prevented,false);
 assert.match(h.content.innerHTML,/Company 2 of 3/);
 const previous=h.key('ArrowLeft');
 assert.equal(previous.prevented,true);
 assert.match(h.content.innerHTML,/Company 1 of 3/);
 h.modal.classList.add('hidden');
 assert.equal(h.key('ArrowRight').prevented,false);
 h.modal.classList.remove('hidden');
 h.content.innerHTML='<div>Trading stock</div>';
 assert.equal(h.key('ArrowRight').prevented,false);
 assert.equal(JSON.stringify(h.state),before,'navigation does not modify the empire');
});
test('single-company management hides company navigation',()=>{
 const h=harness(1);h.window.openManage(0);
 assert.match(h.content.innerHTML,/class="pl-company-nav" aria-label="Switch companies" hidden/);
 assert.equal(h.key('ArrowRight').prevented,false);
});
