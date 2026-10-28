/* Run with: node --test tests/economy-balance.test.cjs
   No third-party packages or backend required. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const modes={fast:{daySeconds:300,actions:4},standard:{daySeconds:900,actions:6},long:{daySeconds:3600,actions:10},persistent:{daySeconds:86400,actions:12}};
const types=[
  ['coffee',500,115,48],['restaurant',2000,390,190],['gamestore',5000,760,420],
  ['hotel',25000,3300,1900],['dealership',100000,12500,7900],['factory',500000,62000,41000],
  ['software',2500000,330000,170000],['logistics',10000000,1250000,770000]
].map(([id,cost,baseRevenue,baseExpense])=>({id,name:id,cost,baseRevenue,baseExpense}));
function harness(){
  const state={started:true,mode:'standard',day:1,actions:6,cash:1000,businesses:[],news:[],stocks:{},property:0};
  let now=1000000,visible=true;
  const status={textContent:''};
  const game={classList:{contains(){return true}}};
  const document={
    readyState:'loading',
    get visibilityState(){return visible?'visible':'hidden'},
    getElementById(id){return id==='gameScreen'?game:id==='actionsLeft'||id==='actionRegenStatus'?status:null},
    addEventListener(){}
  };
  const window={netWorth:()=>state.cash,ProfitLandsRealtime:{rate:()=>0,formatRate:n=>'$'+n.toFixed(2)}};
  const ctx={state,BUSINESS_TYPES:types,MODES:modes,document,window,console,innerHeight:700,money:n=>'$'+Math.round(n),Date:{now(){return now}}};
  vm.createContext(ctx);
  for(const f of ['growth-system.js','balance-system.js']){
    const src=fs.readFileSync(path.join(root,f),'utf8');
    new vm.Script(src,{filename:f}).runInContext(ctx);
  }
  return{state,ctx,window,document,now:v=>now=v,visible:v=>visible=v,types};
}
test('all four world modes maintain the same earnings per active minute',()=>{
  const x=harness().window.ProfitLandsBalance;
  const projected=Object.keys(modes).map(mode=>x.evaluateMode(mode,320,30));
  for(const result of projected){
    assert.equal(result.baseIncome,9600);
    assert.equal(result.startingActions,modes[result.mode].actions);
    assert.ok(result.estimatedReplenishments>0);
    assert.ok(result.regenSeconds>0);
  }
  assert.deepEqual(projected.map(p=>p.marketCycles),[6,2,0,0]);
});
test('actions regenerate once and never exceed mode-specific caps',()=>{
  const h=harness(),bal=h.window.ProfitLandsBalance;
  for(const mode of Object.keys(modes)){
    h.state.mode=mode;h.state.actions=0;h.state.actionRegenAt=1000000;
    const t=bal.interval(mode)*1000;
    assert.equal(bal.tick(1000000+t-1),0,mode+' early refill');
    assert.equal(bal.tick(1000000+t),1,mode+' timed refill');
    assert.equal(h.state.actions,1,mode+' action count');
    assert.equal(bal.tick(1000000+t+1),0,mode+' no double award');
    h.state.actions=modes[mode].actions;
    assert.equal(bal.tick(1000000+t*4),0,mode+' cap');
  }
});
test('hidden tabs do not accumulate bonus actions',()=>{
  const h=harness(),bal=h.window.ProfitLandsBalance;
  h.state.actions=0;h.state.actionRegenAt=1000000;
  h.visible(false);
  assert.equal(bal.tick(2000000),0);
  h.visible(true);
  assert.equal(bal.tick(2000001),0);
  assert.equal(h.state.actions,0);
});
test('employees add productivity while salaries remain an ongoing expense',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  for(const t of types){
    const b={type:t.id,level:1,locations:[{id:'downtown'}],workers:0,manager:false};
    const base=g.adjustProfit(b);
    b.workers=1;
    const employee=g.adjustProfit(b);
    assert.ok(employee>base,t.id+' employee should earn more than wages at entry level');
    b.manager=true;
    assert.ok(g.adjustProfit(b)>employee,t.id+' manager should improve operations after salary');
    assert.ok(g.staffCost(b,'worker')>0);
    assert.ok(g.staffCost(b,'manager')>g.staffCost(b,'worker'));
  }
});
test('initiative bonus lasts ten minutes and expires consistently for all modes',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  const b={type:'coffee',level:1,locations:[{}],workers:0,manager:false};
  const baseline=g.adjustProfit(b);
  b.initiativeUntilTime=1000000+10*60000;
  for(const mode of Object.keys(modes)){
    h.state.mode=mode;
    h.now(1000000+9*60000);
    assert.ok(g.adjustProfit(b)>baseline,mode+' active bonus');
    h.now(1000000+10*60000);
    assert.equal(g.adjustProfit(b),baseline,mode+' expiry');
  }
});
test('milestones reward exactly once, and history is bounded',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  h.state.businesses=[{type:'coffee',level:1,locations:[{}],workers:1}];
  g.awards();const first=h.state.cash;
  g.awards();assert.equal(h.state.cash,first);
  assert.ok(h.state.growth.milestones.includes('first'));
  assert.ok(h.state.growth.milestones.includes('staff'));
  h.state.growth.history=Array.from({length:160},(_,i)=>({t:i*5000,cash:i,netWorth:i*2,flow:i/10}));
  assert.equal(g.ensure().history.length,120);
  const old=JSON.parse(JSON.stringify(h.state.growth));
  g.reset();
  assert.equal(h.state.growth.history.length,0);
  assert.equal(h.state.growth.milestones.length,0);
  assert.ok(old.milestones.length>0);
});
test('game HTML references growth and balance modules and retains save-compatible keys',()=>{
  const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
  for(const name of ['growth-system.js','balance-system.js','economy-system.js','app.js'])assert.ok(html.includes(name));
  for(const id of ['growthPanel','growthChart','growthHireWorker','growthHireManager','growthRunDecision','growthMilestones'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(app.includes("'profitlands-v2'"));
  assert.ok(app.includes("'profitlands-v2-backup'"));
  assert.ok(economy.includes('ProfitLandsGrowth?.adjustProfit'));
  assert.ok(economy.includes('ProfitLandsBalance?.tick'));
});

function bootAppWithStorage(storage){
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{
      id,textContent:'',innerHTML:'',style:{},disabled:false,
      classList:{add(){},remove(){},toggle(){},contains(){return false}},
      addEventListener(){},remove(){},onclick:null
    });
    return elements.get(id);
  };
  const document={
    getElementById:get,querySelectorAll(){return[]},querySelector(){return null},
    addEventListener(){},readyState:'complete'
  };
  const window={addEventListener(){}};
  const ctx={window,document,localStorage:storage,console,Date,Math,
    setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},
    confirm(){return true}
  };
  vm.createContext(ctx);
  new vm.Script(fs.readFileSync(path.join(root,'app.js'),'utf8'),{filename:'app.js'}).runInContext(ctx);
  return {window,get};
}
test('valid save creates a separate fallback and corrupt primary recovers previous progress',()=>{
  const keys=new Map();
  const storage={
    getItem(k){return keys.get(k)||null},
    setItem(k,v){keys.set(k,v)},
    removeItem(k){keys.delete(k)}
  };
  const stocks=Object.fromEntries(['nova','harbor','atlas','skyline'].map(k=>[k,{shares:0}]));
  const starting={mode:'standard',playType:'single',day:8,cash:5600,actions:4,
    stocks,businesses:[],property:0,news:[],timeLeft:600,started:false};
  storage.setItem('profitlands-v2',JSON.stringify(starting));
  const first=bootAppWithStorage(storage);
  assert.equal(first.window.state.cash,5600);
  first.window.state.cash=8900;
  first.window.save();
  assert.equal(JSON.parse(storage.getItem('profitlands-v2')).cash,8900);
  assert.equal(JSON.parse(storage.getItem('profitlands-v2-backup')).cash,5600);
  storage.setItem('profitlands-v2','not-json');
  const recovered=bootAppWithStorage(storage);
  assert.equal(recovered.window.state.cash,5600);
  assert.ok(recovered.window.state.news.some(x=>x.includes('RECOVERY')));
});

test('manager popularity improvements do not depend on market-cycle length',()=>{
  for(const mode of Object.keys(modes)){
    const h=harness(),g=h.window.ProfitLandsGrowth;
    h.state.mode=mode;h.state.businesses=[{type:'coffee',level:1,locations:[{basePopularity:50}],popularity:50,manager:true}];
    g.managerTick(1000000);
    for(let elapsed=5000;elapsed<=60000;elapsed+=5000)g.managerTick(1000000+elapsed);
    assert.ok(Math.abs(h.state.businesses[0].popularity-50.4)<1e-5,mode+' manager gain');
    assert.ok(Math.abs(h.state.businesses[0].locations[0].basePopularity-50.4)<1e-5,mode+' location gain');
  }
});

test('company staffing grows with upgrades and additional locations',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  const b={type:'coffee',level:1,workers:0,locations:[{id:'downtown'}]};
  assert.equal(g.companyEmployeeCap(b),6,'small business should begin with six seats');
  b.level=3;
  assert.equal(g.companyEmployeeCap(b),18,'business upgrades create additional jobs');
  b.locations.push({id:'suburbs'});
  assert.equal(g.companyEmployeeCap(b),30,'second location adds twelve positions');
  b.locations.push({id:'tourist'});
  assert.equal(g.companyEmployeeCap(b),42,'third location increases capacity again');
});
test('empire net worth unlocks total workforce tiers progressively',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  const expectations=[
    [1000,12],[10000,25],[100000,60],[1000000,150],
    [10000000,400],[100000000,1000],[1000000000,2500],
    [1000000000000,10000]
  ];
  for(const [worth,capacity] of expectations){
    h.state.cash=worth;
    assert.equal(g.workforceTier().cap,capacity,'worth '+worth);
  }
  h.state.cash=9999;
  assert.equal(g.workforceTier().cap,12,'tier must not unlock early');
  assert.equal(g.workforceTier().next.netWorth,10000);
});
test('hiring obeys both company capacity and total empire capacity',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  h.state.cash=1000;
  const first={type:'coffee',level:3,workers:5,locations:[{id:'downtown'}]};
  const second={type:'restaurant',level:3,workers:5,locations:[{id:'downtown'}]};
  h.state.businesses=[first,second];
  assert.equal(g.totalEmployees(),10);
  assert.equal(g.hiringRoom(first),2,'global startup capacity limits hiring despite larger facility');
  h.state.cash=100000;
  assert.equal(g.hiringRoom(first),13,'with more empire capital company limit now binds');
  first.workers=18;
  assert.equal(g.hiringRoom(first),0,'full company cannot hire more');
  // If value drops, no one gets silently fired, but recruitment stops.
  h.state.cash=1000;
  assert.equal(first.workers,18);
  assert.equal(g.hiringRoom(second),0,'over-capacity empire cannot hire');
});
test('bulk hiring prices rise with each worker and staff profit has diminishing returns',()=>{
  const h=harness(),g=h.window.ProfitLandsGrowth;
  const b={type:'factory',level:9,workers:0,locations:[{id:'industrial'}]};
  const one=g.staffCost(b,'worker',1);
  const five=g.staffCost(b,'worker',5);
  assert.ok(five>one*5,'subsequent recruits have greater hiring cost');
  b.workers=20;
  assert.ok(g.staffCost(b,'worker',5)>five,'larger teams cost more to hire');
  assert.equal(g.staffCost(b,'worker',26),Infinity,'batches have a safe limit');
  b.workers=1;const oneWorkerProfit=g.adjustProfit(b);
  b.workers=2;const twoWorkerProfit=g.adjustProfit(b);
  b.workers=100;const hundredProfit=g.adjustProfit(b);
  assert.ok(oneWorkerProfit>0,'one worker should be useful');
  assert.ok(twoWorkerProfit>oneWorkerProfit,'second worker should improve gross operations');
  assert.ok(hundredProfit<oneWorkerProfit*100,'large staffs should not be a linear money exploit');
});

test('wealth milestones advance past one trillion without ending the game',()=>{
  const window={},document={getElementById(){return null}};
  const ctx={window,document,Math,Number};
  vm.createContext(ctx);
  new vm.Script(fs.readFileSync(path.join(root,'progression.js'),'utf8'),{filename:'progression.js'}).runInContext(ctx);
  const api=window.ProfitLandsProgression;
  const expected=[
    [1000,10000],[9999,10000],[10000,100000],
    [1000000,10000000],[100000000000,1000000000000],
    [1000000000000,10000000000000],
    [10000000000000,100000000000000],
    [100000000000000,1000000000000000],
    [1000000000000000,10000000000000000],
    [1e21,1e22],[1e30,1e31]
  ];
  for(const [wealth,next] of expected){
    const milestone=api.milestone(wealth);
    assert.equal(milestone.target,next,'next goal for '+wealth);
    assert.ok(milestone.percent>=0&&milestone.percent<100,'current stage percentage '+wealth);
    assert.equal(milestone.endless,true,'progress does not stop at '+wealth);
  }
  assert.equal(api.milestone(9.5e12).percent>90,true);
  assert.equal(api.milestone(1e12).targetLabel,'$10.00T');
  assert.equal(api.milestone(1e15).targetLabel,'$10.00Qa');
});
test('large values format clearly, including after $1T and $1Qa',()=>{
  const window={},document={getElementById(){return null}},ctx={window,document,Math,Number};
  vm.createContext(ctx);
  new vm.Script(fs.readFileSync(path.join(root,'progression.js'),'utf8')).runInContext(ctx);
  const api=window.ProfitLandsProgression;
  assert.equal(api.format(1000),'$1,000');
  assert.equal(api.format(1e12),'$1.00T');
  assert.equal(api.format(1e15),'$1.00Qa');
  assert.equal(api.format(1e18),'$1.00Qi');
  assert.equal(api.format(1e36),'$1.00e36');
  assert.equal(api.format(-1e15),'-$1.00Qa');
  assert.ok(Number.isFinite(api.milestone(1e305).percent));
});
test('endless progress is wired into both full and realtime dashboards',()=>{
  const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
  assert.ok(html.indexOf('progression.js')<html.indexOf('app.js'),'module must load first');
  assert.ok(app.includes('ProfitLandsProgression?.render('),'app renders the next milestone from exact large-number net worth');
  assert.ok(economy.includes('ProfitLandsProgression?.render(calcNetWorth())'));
  assert.ok(!app.includes('const GOAL='));
  assert.ok(!economy.includes('net/GOAL'));
  assert.ok(html.includes('Next wealth milestone'));
});

function loadHugeMoney(){
  const window={};
  const context={window,Number,Math,console};
  vm.createContext(context);
  new vm.Script(fs.readFileSync(path.join(root,'huge-money.js'),'utf8'),{filename:'huge-money.js'}).runInContext(context);
  return{window,api:window.ProfitLandsMoney,context};
}
test('huge-number cash ledger migrates existing saves and supports spending and deposits',()=>{
  const{api}=loadHugeMoney(),state={cash:1000};
  api.attach(state);
  assert.equal(state.cashHuge,'1e3');
  assert.equal(api.canAfford(1001),false);
  assert.equal(api.spend(225),true);
  assert.equal(state.cash,775);
  api.gain(25);
  assert.equal(state.cash,800);
  assert.equal(api.format(api.balance()),'$800');
  assert.equal(api.spend(801),false);
});
test('huge-number ledger supports 1e1000, 1e2000 and exponent one million',()=>{
  const{api}=loadHugeMoney(),state={cash:1000};
  api.attach(state);
  api.set('1e1000');
  assert.equal(state.cashHuge,'1e1000');
  assert.ok(Number.isFinite(state.cash),'numeric compatibility mirror must remain finite');
  assert.equal(api.format(api.balance()),'$1e1000');
  assert.equal(api.canAfford('1e1001'),false);
  assert.equal(api.canAfford('5e999'),true);
  assert.equal(api.spend('5e999'),true);
  assert.equal(state.cashHuge,'5e999');
  api.gain('5e999');
  assert.equal(state.cashHuge,'1e1000');
  assert.equal(api.raw(api.mul('1e1000','1e1000')),'1e2000');
  assert.equal(api.raw(api.parse('1e1000000')),'1e1000000');
});
test('canonical huge balances survive JSON snapshots and Cloud-style restore',()=>{
  const{api}=loadHugeMoney(),initial={cash:1000};
  api.attach(initial);
  api.set('7.25e1000');
  const saved=JSON.parse(JSON.stringify(initial));
  assert.equal(saved.cashHuge,'7.25e1000');
  const restored={...saved};
  api.attach(restored);
  assert.equal(api.raw(api.balance()),'7.25e1000');
  assert.equal(api.format(api.balance()),'$7.25e1000');
  assert.equal(api.raw(api.sub(api.balance(),'2.25e1000')),'5e1000');
});
test('arbitrary-exponent wealth checkpoints continue beyond numeric Number.MAX_VALUE',()=>{
  const {api,window,context}=loadHugeMoney();
  context.document={getElementById(){return null}};
  new vm.Script(fs.readFileSync(path.join(root,'progression.js'),'utf8'),{filename:'progression.js'}).runInContext(context);
  const milestone=window.ProfitLandsProgression.milestone('1e1000');
  assert.equal(milestone.targetRaw,'1e1001');
  assert.equal(milestone.targetLabel,'$1e1001');
  assert.equal(milestone.endless,true);
  assert.equal(window.ProfitLandsProgression.milestone('7e1000').percent>60,true);
  assert.equal(window.ProfitLandsProgression.milestone('1e1000000').targetRaw,'1.000e1000001'.replace('1.000','1'));
});
test('gameplay scripts keep canonical huge balances on major mutation paths',()=>{
  const files=['app.js','economy-system.js','enhancements.js','growth-system.js','trade-ui.js','firebase-auth.js'];
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(source.includes('ProfitLandsMoney'),file+' is wired into huge money');
  }
  const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
  assert.ok(html.indexOf('huge-money.js')<html.indexOf('app.js'),'huge money loads before game state');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.ok(app.includes('cashHuge'),'save migration support');
  const market=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
  assert.ok(market.includes('ProfitLandsMoney.gain(realized)'),'realtime earnings must hit canonical cash');
});
