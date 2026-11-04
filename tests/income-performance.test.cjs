'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
const original=fs.readFileSync(path.join(__dirname,'fixtures','income-v1.9-reference.js'),'utf8');
const ITEMS=[
 ['coffee',500,115,48],['restaurant',2000,390,190],['gamestore',5000,760,420],
 ['hotel',25000,3300,1900],['dealership',100000,12500,7900],['factory',500000,62000,41000],
 ['software',2500000,330000,170000],['logistics',10000000,1250000,770000]
];
const types=ITEMS.map(([id,cost,baseRevenue,baseExpense])=>({id,cost,baseRevenue,baseExpense,name:id}));
const areas=['downtown','suburbs','tourist','university','waterfront','tech','industrial','custom'];
function business(type,index,count,legacy=false){
 return{
  type,name:'Company '+index,locationManagementVersion:legacy?0:1,
  level:2+index%4,marketing:index%3,efficiency:index%2,popularity:45+index%50,
  chainCount:count-1,financialBalance:0,workers:3,manager:true,
  initiativeUntilTime:Date.now()+3600000,
  locations:Array.from({length:count},(_,i)=>({
   id:areas[(i+index)%areas.length],level:1+i%7,marketing:i%4,
   efficiency:i%3,workers:i%5,manager:i%6===0,basePopularity:30+i%65,
   rent:1.1+(i%4)*.14,demand:.9+(i%5)*.17
  }))
 };
}
function harness({companies=8,locations=8,legacy=false}={}){
 const state={
  mode:'standard',playType:'single',started:true,day:19,actions:60,cash:25000000,
  stocks:{},loans:[],property:1,majorCompanies:[],news:[],
  businesses:types.slice(0,companies).map((t,i)=>business(t.id,i,locations,legacy)),
  economy:{health:67,history:[60,65],demandIndex:1.08,rentIndex:1.12,wageIndex:1.03,supplyIndex:1.14,
   loanRate:.08,activeEvents:[{id:'tech_boom',days:2},{id:'shipping',days:2},{id:'wildfire',days:1},{id:'travel_boom',days:1}]},
  liveDayProfit:0,liveTotalProfit:0
 };
 let netCalls=0,countryCalls=0,costCalls=0,industryCalls=0,saved=0,init=()=>{};
 const window={
  render(){},
  ProfitLandsDifficulty:{current:()=>({revenue:1.15,expenses:1.09})},
  ProfitLandsCountry:{
   current:()=>{countryCalls++;return{demand:1.03,revenue:.96,rent:1,wage:1}},
   costIndex:()=>{costCalls++;return 1.08},
   industry:()=>{industryCalls++;return 1.04},
   recordOperatingProfit(){}
  },
  ProfitLandsAdvancements:{modifiers:()=>({revenue:1.05,expenses:.96})},
  ProfitLandsLocationOps:{staffingAdjustment:(b,l,rev,cost)=>rev*.08-cost*.032},
  ProfitLandsEmpire:{delta:(b,l,rev,cost)=>rev*.021-cost*.018},
  ProfitLandsGrowth:{adjustProfit:()=>41},
  ProfitLandsBadges:{record(){}},
  ProfitLandsBalance:{tick(){}},
  ProfitLandsProgression:{render(){}}
 };
 const game={classList:{contains:key=>key==='active'}};
 const document={
  readyState:'loading',visibilityState:'visible',
  addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')init=fn},
  getElementById:id=>id==='gameScreen'?game:null
 };
 const ctx=vm.createContext({
  window,document,state,console,Math,Number,Date,Set,Map,
  BUSINESS_TYPES:types,STOCKS:[],MODES:{standard:{daySeconds:900,actions:60}},
  netWorth:()=>{netCalls++;return 1e10},
  save:()=>{saved++},money:n=>'$'+n,render(){},
  setTimeout:()=>1,clearInterval(){},setInterval:()=>1
 });
 const insertion='  window.ProfitLandsEconomy={MAJOR,EVENTS,RISK,LOCS};';
 assert.ok(source.includes(insertion));
 new vm.Script(source.replace(insertion,original+'\n'+insertion),{filename:'economy-system.js'}).runInContext(ctx);
 init();
 return{
  state,window,
  reset:()=>{netCalls=0;countryCalls=0;costCalls=0;industryCalls=0},
  counts:()=>({netCalls,countryCalls,costCalls,industryCalls,saved}),
  old:window.__baselineProfit,new:window.ProfitLandsEconomy
 };
}
test('optimized income exactly matches v1.9 formulas for all industries and locations',()=>{
 const h=harness({companies:8,locations:12});
 for(const b of h.state.businesses){
  for(let i=0;i<b.locations.length;i++){
   const expected=Math.round(h.old.location(b,b.locations[i],i));
   const actual=h.new.locationProfit(b,b.locations[i],i);
   assert.equal(actual,expected,b.type+' location '+i);
  }
  assert.equal(h.new.businessProfit(b),h.old.business(b),b.type+' full company');
 }
});
test('legacy company-level upgrades and workforce bonus retain their earnings',()=>{
 const h=harness({companies:8,locations:10,legacy:true});
 for(const b of h.state.businesses)assert.equal(h.new.businessProfit(b),h.old.business(b));
});
test('economic events, market indices, location upgrades and staffing take effect immediately',()=>{
 const h=harness({companies:8,locations:9});
 for(const [health,demand,day] of [[25,.78,20],[82,1.34,21],[99,.95,22]]){
  h.state.economy.health=health;h.state.economy.demandIndex=demand;h.state.day=day;
  for(const b of h.state.businesses){
   b.locations[0].level+=2;b.locations[0].workers+=1;
   assert.equal(h.new.businessProfit(b),h.old.business(b),b.type+' new market '+day);
  }
 }
});
test('10,000 locations use one empire-wide context for the portfolio calculation',()=>{
 const h=harness({companies:8,locations:100});
 h.state.businesses=Array.from({length:100},(_,i)=>business(types[i%8].id,i,100,false));
 h.reset();
 const profit=h.window.totalBusinessProfit();
 assert.ok(Number.isFinite(profit));
 const calls=h.counts();
 assert.equal(calls.netCalls,1,'tier calculation must not run per location');
 assert.equal(calls.countryCalls,1);
 assert.equal(calls.costCalls,1);
 assert.equal(calls.industryCalls,100,'industry multiplier is company-specific');
});
test('half-second income settlement shares factors and still updates every company ledger',()=>{
 const h=harness({companies:8,locations:30});
 h.window.ProfitLandsRealtime.settle(1000000);
 const oldCash=h.state.cash;
 h.reset();
 const earned=h.window.ProfitLandsRealtime.settle(1000500);
 assert.ok(Number.isFinite(earned)&&earned!==0,'settlement produces a real amount');
 assert.notEqual(h.state.cash,oldCash);
 assert.equal(h.counts().netCalls,1);
 assert.equal(h.counts().countryCalls,1);
 assert.ok(h.state.businesses.every(b=>b.financialBalance!==0));
 assert.equal(h.counts().saved,0,'new calculation does not add any game saves');
});
test('standalone business and location forecasts use fresh shared factors',()=>{
 const h=harness({companies:8,locations:6}),b=h.state.businesses[0];
 h.reset();h.new.businessProfit(b);
 assert.equal(h.counts().netCalls,1);
 h.reset();h.new.locationProfit(b,b.locations[0],0);
 assert.equal(h.counts().netCalls,1);
});
