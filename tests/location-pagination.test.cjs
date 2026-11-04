'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'location-operations.js'),'utf8');
function makeHarness(n=10000){
 const b={
  type:'coffee',name:'Coffee Company',popularity:65,level:1,marketing:0,
  efficiency:0,chainCount:n-1,financialBalance:0,locationManagementVersion:1,
  locations:Array.from({length:n},(_,i)=>({
   id:i%2?'tourist':'downtown',name:'Site '+(i+1),level:1,marketing:0,
   efficiency:0,workers:0,manager:false,basePopularity:60,rent:1.3,demand:1.22
  }))
 };
 const state={started:true,businesses:[b],cash:1000000,actions:100,news:[]};
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{
   id,innerHTML:'',hidden:false,disabled:false,value:'',
   classList:{add(){},remove(){}},
   querySelector(){return null},
   querySelectorAll(){return []},
   scrollIntoView(){},
   setAttribute(){},addEventListener(){}
  });
  return nodes.get(id);
 };
 let scanCount=0,contextCount=0,profitCalls=0,renderCount=0,saveCount=0;
 const contexts=[];
 const window={
  confirm:()=>true,
  ProfitLandsGrowth:{workforceTier:()=>({cap:50000}),render(){}},
  ProfitLandsRealtime:{period:60},
  ProfitLandsEconomy:{
   companyFactors:()=>{contextCount++;return{serial:contextCount}},
   locationProfit:(company,site,i,factors)=>{
    contexts.push(factors);
    profitCalls++;
    return 50+site.level*20+site.marketing*10+site.efficiency*5;
   }
  },
  businessDailyProfit:()=>12000
 };
 const context={
  window,state,document:{getElementById:get},
  BUSINESS_TYPES:[{id:'coffee',name:'Coffee Shop',icon:'☕',desc:'Sells coffee',cost:500,baseExpense:48}],
  money:n=>'$'+Math.round(n),
  spendAction:amount=>{if(state.cash<amount||state.actions<1)return false;state.cash-=amount;state.actions--;return true},
  save:()=>saveCount++,render:()=>renderCount++,toast(){},console
 };
 vm.createContext(context);
 // Count full-empire employee scans without changing their behavior.
 const traced=source.replace('function allWorkers(){','function allWorkers(){window.__workerScans=(window.__workerScans||0)+1;');
 new vm.Script(traced,{filename:'location-operations.js'}).runInContext(context);
 const counts=()=>({scan:window.__workerScans||0,context:contextCount,profit:profitCalls,renders:renderCount,saves:saveCount});
 return{ops:window.ProfitLandsLocationOps,b,state,get,window,counts,contexts};
}
function indices(markup){return [...markup.matchAll(/data-site-section="(\d+)"/g)].map(x=>Number(x[1]))}
test('ten thousand locations render only 24 management cards with one worker scan and one economic snapshot',()=>{
 const h=makeHarness();
 h.ops.open(0);
 const html=h.get('manageContent').innerHTML;
 const found=indices(html),c=h.counts();
 assert.equal(found.length,24);
 assert.deepEqual(found,Array.from({length:24},(_,i)=>i));
 assert.equal(c.scan,1,'allWorkers must not run for every rendered location');
 assert.equal(c.context,1,'page previews share a fresh economic snapshot');
 assert.equal(c.profit,24*7,'each visible card has one live rate and six upgrade comparison calculations');
 assert.ok(h.contexts.every(x=>x===h.contexts[0]));
 assert.match(html,/id="siteSearch"/);
 assert.match(html,/id="siteNext"/);
 assert.ok(html.length<250000,'initial management markup remains bounded');
});
test('focused location on a late page uses original site indexes and upgrades that site only',()=>{
 const h=makeHarness();
 h.ops.open(0,8765);
 const html=h.get('manageContent').innerHTML;
 assert.deepEqual(indices(html),Array.from({length:24},(_,i)=>8760+i));
 const before=h.state.cash;
 assert.equal(h.ops.doAction(0,8765,'upgrade'),true);
 assert.equal(h.b.locations[8765].level,2);
 assert.equal(h.b.locations[8764].level,1);
 assert.equal(h.state.actions,99);
 assert.ok(h.state.cash<before);
 assert.ok(indices(h.get('manageContent').innerHTML).includes(8765));
 assert.equal(h.counts().saves,1);
});
test('short companies retain all location actions and do not show the page toolbar',()=>{
 const h=makeHarness(3);
 h.ops.open(0);
 const html=h.get('manageContent').innerHTML;
 assert.deepEqual(indices(html),[0,1,2]);
 assert.match(html,/class="site-pagination" hidden/);
 assert.equal((html.match(/data-site-action="hire"/g)||[]).length,3);
 assert.equal((html.match(/data-site-toggle="/g)||[]).length,3);
});
test('company and location names are safely escaped before they enter management HTML',()=>{
 const h=makeHarness(3);
 h.b.name='<img src=x onerror=alert(1)>';
 h.b.locations[1].name='<svg onload=alert(1)>';
 h.b.locations[1].icon='<script>';
 h.ops.open(0);
 const markup=h.get('manageContent').innerHTML;
 assert.ok(!markup.includes('<img'));
 assert.ok(!markup.includes('<svg'));
 assert.ok(!markup.includes('<script>'));
 assert.match(markup,/&lt;img/);
 assert.match(markup,/&lt;svg/);
});
test('invalid sale confirmations remain fail-closed after location pagination',()=>{
 const h=makeHarness(50),before=h.state.cash;
 h.window.confirm=()=>false;
 h.ops.open(0,39);
 assert.equal(h.ops.doAction(0,39,'sell'),false);
 assert.equal(h.b.locations.length,50);
 assert.equal(h.state.cash,before);
});
