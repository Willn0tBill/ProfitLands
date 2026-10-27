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
