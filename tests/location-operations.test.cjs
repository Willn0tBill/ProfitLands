const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
function harness(){
 const type={id:'coffee',name:'Coffee Shop',cost:500,baseRevenue:115,baseExpense:48};
 const b={type:'coffee',name:'Coffee Shop #1',level:3,marketing:2,efficiency:1,workers:4,manager:true,popularity:60,locations:[
  {id:'downtown',name:'Downtown',icon:'🏙️',demand:1.22,rent:1.3,basePopularity:60},
  {id:'tourist',name:'Tourist District',icon:'🌴',demand:1.35,rent:1.85,basePopularity:65}
 ]};
 const state={businesses:[b],cash:500000,actions:50,news:[],started:true};
 const dom=new Map();
 const elements=id=>{
  if(!dom.has(id))dom.set(id,{id,innerHTML:'',classList:{add(){},remove(){}},querySelectorAll(){return[]},querySelector(){return null},scrollIntoView(){},disabled:false});
  return dom.get(id);
 };
 const document={getElementById:elements};
 const window={confirm:()=>true,ProfitLandsGrowth:{workforceTier:()=>({cap:150}),render(){}},ProfitLandsRealtime:{period:60},businessDailyProfit:()=>0};
 let saved=0,rendered=0;
 const context={state,window,document,BUSINESS_TYPES:[type],money:n=>'$'+Math.round(n),spendAction:cost=>{
   if(state.cash<cost||state.actions<1)return false;
   state.cash-=cost;state.actions--;return true
  },save:()=>saved++,render:()=>rendered++,toast(){},console};
 vm.createContext(context);
 new vm.Script(fs.readFileSync(path.join(root,'location-operations.js'),'utf8')).runInContext(context);
 return {ops:window.ProfitLandsLocationOps,b,state,window,dom,saved:()=>saved,rendered:()=>rendered};
}
test('migrates company-wide settings into independent location state once',()=>{
 const h=harness(),b=h.b,ops=h.ops;
 assert.equal(b.locationManagementVersion,1);
 assert.equal(b.locations[0].level,3);
 assert.equal(b.locations[1].level,3);
 assert.equal(b.locations[0].marketing,2);
 assert.equal(b.locations[1].efficiency,1);
 assert.equal(b.locations[0].workers,4);
 assert.equal(b.locations[1].workers,0);
 assert.equal(b.locations[0].manager,true);
 assert.equal(b.locations[1].manager,false);
 ops.normalize(b);assert.equal(b.locations[0].workers,4,'migration must not duplicate staff');
});
test('location upgrades and marketing apply only to chosen branch and have distinct costs',()=>{
 const h=harness(),ops=h.ops,b=h.b;
 const downtown=b.locations[0],tourist=b.locations[1];
 const downtownCost=ops.price(b,downtown,'upgrade'),touristCost=ops.price(b,tourist,'upgrade');
 assert.notEqual(downtownCost,touristCost,'rent should affect local upgrades');
 const previousTourist={...tourist},originalCash=h.state.cash,actions=h.state.actions;
 assert.equal(ops.doAction(0,0,'upgrade'),true);
 assert.equal(downtown.level,4);
 assert.equal(tourist.level,previousTourist.level);
 assert.equal(h.state.cash,originalCash-downtownCost);
 assert.equal(h.state.actions,actions-1);
 assert.equal(ops.doAction(0,1,'marketing'),true);
 assert.equal(tourist.marketing,previousTourist.marketing+1);
 assert.equal(downtown.marketing,2);
 assert.ok(tourist.basePopularity>previousTourist.basePopularity);
 assert.ok(h.saved()>0);
});
test('efficiency reduces local costs; staff and managers stay at selected branch',()=>{
 const h=harness(),ops=h.ops,b=h.b;
 assert.equal(ops.doAction(0,1,'efficiency'),true);
 assert.equal(b.locations[1].efficiency,2);
 assert.equal(b.locations[0].efficiency,1);
 assert.equal(ops.doAction(0,1,'hire',5),true);
 assert.equal(b.locations[1].workers,5);
 assert.equal(b.locations[0].workers,4);
 assert.equal(ops.doAction(0,1,'manager'),true);
 assert.equal(b.locations[1].manager,true);
 assert.equal(b.locations[0].manager,true);
 const gross=1000,running=500;
 assert.notEqual(ops.staffingAdjustment(b,b.locations[1],gross,running),ops.staffingAdjustment(b,b.locations[0],gross,running));
 assert.equal(ops.doAction(0,1,'hire',25),false,'cannot hire past site limit');
});
test('selling a branch removes only that location and keeps company with staff',()=>{
 const h=harness(),ops=h.ops,b=h.b;
 const priorCash=h.state.cash,amount=ops.price(b,b.locations[1],'sell');
 assert.equal(ops.doAction(0,1,'sell'),true);
 assert.equal(b.locations.length,1);
 assert.equal(b.locations[0].id,'downtown');
 assert.equal(b.locations[0].workers,4);
 assert.equal(h.state.cash,priorCash+amount);
 assert.equal(h.state.businesses.length,1);
 assert.equal(ops.doAction(0,0,'sell'),true);
 assert.equal(h.state.businesses.length,0,'last location sold removes whole business');
});
test('new branch starts at level one with zero staff after legacy migration',()=>{
 const h=harness(),ops=h.ops,b=h.b;
 b.locations.push({id:'tech',name:'Tech District',rent:1.35,demand:1.1});
 ops.normalize(b);
 const l=b.locations[2];
 assert.equal(l.level,1);
 assert.equal(l.marketing,0);
 assert.equal(l.efficiency,0);
 assert.equal(l.workers,0);
 assert.equal(l.manager,false);
 assert.equal(ops.cap(l),6);
});
test('serializing and restoring branch operations retains independent location state',()=>{
 const h=harness(),ops=h.ops;
 ops.doAction(0,1,'upgrade');
 ops.doAction(0,1,'hire',3);
 const restored=JSON.parse(JSON.stringify(h.b));
 const otherLevel=restored.locations[0].level;
 ops.normalize(restored);
 assert.equal(restored.locations[1].level,4);
 assert.equal(restored.locations[1].workers,3);
 assert.equal(restored.locations[0].level,otherLevel);
});
test('game loads locations after economy renderer and uses location-specific economics',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const growth=fs.readFileSync(path.join(root,'growth-system.js'),'utf8');
 assert.ok(html.indexOf('location-operations.js')>html.indexOf('economy-render.js'));
 assert.ok(html.includes('location-operations.css'));
 assert.ok(economy.includes('function locationProfit(b,l,i)'));
 assert.ok(economy.includes('l.level||1'));
 assert.ok(economy.includes('staffingAdjustment'));
 assert.ok(growth.includes('growthStaffLocation'));
});

test('company management visibly shows controls and staff for every location',()=>{
 const h=harness();
 h.ops.open(0);
 const markup=h.dom.get('manageContent').innerHTML;
 assert.ok(markup.includes('data-site-section="0"'),'first location section');
 assert.ok(markup.includes('data-site-section="1"'),'second location section');
 assert.equal((markup.match(/data-site-action="upgrade"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="marketing"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="efficiency"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="sell"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="hire"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="manager"/g)||[]).length,2);
 assert.ok(markup.includes('Staff & management'));
});

test('per-location economy calculations respond only to that location changes',()=>{
 const h=harness(),b=h.b,ops=h.ops;
 const source=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const begin=source.indexOf('  function locationProfit(b,l,i){');
 const end=source.indexOf('  function businessProfit(b){',begin);
 assert.ok(begin>=0&&end>begin,'location profit implementation available');
 const locationProfit=new Function(
  'BUSINESS_TYPES','state','riskFor','tier','LOCS','activeEffect','window',
  source.slice(begin,end)+';return locationProfit;'
 )([{id:'coffee',cost:500,baseRevenue:115,baseExpense:48}],{
   day:1,economy:{health:60,demandIndex:1,rentIndex:1,wageIndex:1,supplyIndex:1}
 },()=>({econ:1,cost:1,weather:.7,vol:.15}),()=>0,{
   downtown:{demand:1.22,rent:1.3},tourist:{demand:1.35,rent:1.85}
 },()=>1,{ProfitLandsLocationOps:ops});
 const baseDowntown=locationProfit(b,b.locations[0],0);
 const baseTourist=locationProfit(b,b.locations[1],1);
 b.locations[0].level++;
 assert.ok(locationProfit(b,b.locations[0],0)!==baseDowntown);
 assert.equal(locationProfit(b,b.locations[1],1),baseTourist,'independent upgrade');
 b.locations[0].marketing++;
 assert.equal(locationProfit(b,b.locations[1],1),baseTourist,'independent marketing');
 b.locations[0].efficiency++;
 assert.equal(locationProfit(b,b.locations[1],1),baseTourist,'independent efficiency');
 b.locations[0].workers++;
 assert.equal(locationProfit(b,b.locations[1],1),baseTourist,'independent payroll');
});

test('each location has an independent minimize toggle that preserves its action markup',()=>{
 const h=harness();h.ops.open(0);
 const markup=h.dom.get('manageContent').innerHTML;
 assert.equal((markup.match(/data-site-toggle="/g)||[]).length,2);
 assert.equal((markup.match(/class="site-operation-body"/g)||[]).length,2);
 assert.equal((markup.match(/data-site-bulk="/g)||[]).length,2);
 assert.equal((markup.match(/data-site-action="hire"/g)||[]).length,2);
 assert.ok(markup.includes('Minimize locations'));
 assert.ok(markup.includes('Expand locations'));
});
