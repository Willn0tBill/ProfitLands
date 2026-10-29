const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
function harness(level=92){
 const type={id:'coffee',name:'Coffee Shop',cost:500};
 const downtown={id:'downtown',name:'Downtown',level,rent:1.2,marketing:0,efficiency:0,workers:10,manager:true};
 const tourist={id:'tourist',name:'Tourist District',level:40,rent:1.8,marketing:0,efficiency:0,workers:2,manager:false};
 const b={name:'Coffee Shop #1',type:'coffee',locationManagementVersion:1,locations:[downtown,tourist]};
 const s={started:true,actions:60,cash:1e9,news:[],businesses:[b]};
 let saveCount=0,renderCount=0,toastCount=0;
 const body={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const document={readyState:'loading',visibilityState:'visible',getElementById:id=>id==='advancementsContent'?body:id==='gameScreen'?{classList:{contains:x=>x==='active'}}:null,
 addEventListener(){}};
 const money={canAfford:n=>s.cash>=n,spend:n=>{if(s.cash<n)return false;s.cash-=n;return true},format:n=>'$'+Math.round(n).toLocaleString()};
 const ops={room:l=>Math.max(0,20-l.workers),price:(b,l,kind,qty=1)=>kind==='hire'?Math.round(qty*100):1500,open(){}};
 const window={state:s,BUSINESS_TYPES:[type],ProfitLandsMoney:money,ProfitLandsLocationOps:ops,
 ProfitLandsGrowth:{render(){}},save(){saveCount++},render(){renderCount++},toast(){toastCount++},
 setInterval(){},ProfitLandsWorkspace:{show(){}}};
 const ctx=vm.createContext({window,document,console,Date,Number,Math});
 new vm.Script(fs.readFileSync(path.join(root,'business-advancements.js'),'utf8')).runInContext(ctx);
 return{api:window.ProfitLandsAdvancements,s,b,downtown,tourist,body,
 saves:()=>saveCount,renders:()=>renderCount,toasts:()=>toastCount};
}
test('advancement tree has fourteen ordered milestones with no end-game level cap',()=>{
 const a=harness().api.CATALOG;
 assert.equal(a.length,14);
 assert.deepEqual(Array.from(a.map(x=>x.level)),[10,25,50,100,150,250,350,500,750,1000,1500,2500,5000,10000]);
 assert.equal(a[3].name,'Advanced Equipment');
 assert.equal(a[5].name,'Regional Headquarters');
 assert.equal(a[7].name,'Automated Operations');
 assert.equal(a[11].name,'Prestige Network');
});
test('level 92 unlocks lower-tier upgrades but not Level 100 in advance',()=>{
 const h=harness(),a=h.api;
 assert.equal(a.purchase(0,0,'workstations'),true);
 assert.equal(a.purchase(0,0,'academy'),true);
 assert.equal(a.purchase(0,0,'suppliers'),true);
 assert.equal(a.purchase(0,0,'equipment'),false);
 assert.equal(h.downtown.advancements.length,3);
 assert.equal(h.tourist.advancements,undefined,'other locations are untouched');
 assert.equal(h.s.actions,57);
 assert.equal(h.saves(),3);
});
test('purchase price depends on local rent, is paid once and consumes exactly one action',()=>{
 const h=harness(200),api=h.api,item=api.CATALOG.find(x=>x.id==='equipment');
 assert.ok(api.cost(h.b,h.tourist,item)>api.cost(h.b,h.downtown,item));
 const start=h.s.cash,actions=h.s.actions;
 const fee=api.cost(h.b,h.downtown,item);
 assert.equal(api.purchase(0,0,item.id),true);
 assert.equal(h.s.cash,start-fee);
 assert.equal(h.s.actions,actions-1);
 assert.equal(api.purchase(0,0,item.id),false,'cannot purchase an upgrade twice');
 assert.equal(h.s.cash,start-fee);
});
test('upgrades remain local with bounded cumulative effects',()=>{
 const h=harness(10000),api=h.api;
 for(const item of api.CATALOG)assert.equal(api.purchase(0,0,item.id),true,item.id);
 const m=api.modifiers(h.downtown),other=api.modifiers(h.tourist);
 assert.ok(Math.abs(m.revenue-1.42)<1e-9);
 assert.ok(Math.abs(m.expenses-.91)<1e-9);
 assert.ok(Math.abs(m.payroll-.94)<1e-9);
 assert.ok(Math.abs(m.stock-.95)<1e-9);
 assert.equal(m.automation,true);
 assert.equal(other.revenue,1);
 assert.equal(other.payroll,1);
 assert.ok(m.revenue<=1.5);
});
test('automatic operations require both Level 500 unlock purchase and a manager',()=>{
 const h=harness(500),a=h.api;
 assert.equal(a.setAutomation(0,0,'hire',true),false);
 assert.equal(a.purchase(0,0,'automation'),true);
 assert.equal(a.setAutomation(0,0,'hire',true),true);
 assert.equal(h.downtown.advancementAuto.hire,true);
 h.downtown.manager=false;
 assert.equal(a.setAutomation(0,0,'upgrade',true),false);
});
test('auto-hiring and upgrades spend currency, protect reserve and do not run while hidden',()=>{
 const h=harness(500),a=h.api;
 a.purchase(0,0,'automation');a.setAutomation(0,0,'hire',true);
 const initial=h.s.cash,actions=h.s.actions;
 assert.equal(a.tick(1_000_000),1);
 assert.equal(h.downtown.workers,15);
 assert.equal(h.s.cash,initial-500);
 assert.equal(h.s.actions,actions-1);
 assert.equal(a.tick(1_030_000),0,'at most one operation per location per minute');
 a.setAutomation(0,0,'hire',false);a.setAutomation(0,0,'upgrade',true);
 assert.equal(a.tick(1_061_000),1);
 assert.equal(h.downtown.level,501);
 assert.ok(h.s.cash<initial-500);
});
test('automation never spends from a low-cash empire and keeps five-times reserve',()=>{
 const h=harness(500),a=h.api;
 a.purchase(0,0,'automation');a.setAutomation(0,0,'upgrade',true);
 h.s.cash=5000;
 assert.equal(a.tick(1_000_000),0);
 assert.equal(h.downtown.level,500);
 assert.equal(h.s.cash,5000);
});
test('advancements survive JSON save roundtrips and old sites need no migration',()=>{
 const h=harness(100),a=h.api;
 assert.equal(a.modifiers(h.downtown).revenue,1);
 a.purchase(0,0,'equipment');
 const data=JSON.parse(JSON.stringify(h.s));
 assert.equal(data.businesses[0].locations[0].advancements[0],'equipment');
 assert.equal(a.modifiers(data.businesses[0].locations[0]).revenue,1.04);
 assert.equal(a.modifiers(data.businesses[0].locations[1]).revenue,1);
});
test('advancement screen lists locked, available, and purchased items with progress',()=>{
 const h=harness(92),a=h.api;
 a.render();
 assert.ok(h.body.innerHTML.includes('Next milestone: Advanced Equipment'));
 assert.ok(h.body.innerHTML.includes('14'));
 assert.ok(h.body.innerHTML.includes('LOCKED'));
 assert.ok(h.body.innerHTML.includes('AVAILABLE'));
 a.purchase(0,0,'workstations');
 assert.ok(h.body.innerHTML.includes('PURCHASED'));
 assert.ok(h.body.innerHTML.includes('Auto-upgrade this location'));
});
test('workspace, economy, inventory and staffing are integrated with new upgrade engine',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const locations=fs.readFileSync(path.join(root,'location-operations.js'),'utf8');
 const lab=fs.readFileSync(path.join(root,'empire-lab.js'),'utf8');
 assert.ok(html.includes('id="advancesPanel"'));
 assert.ok(html.includes('business-advancements.css'));
 assert.ok(html.indexOf('business-advancements.js')>html.indexOf('workspace.js'));
 assert.ok(workspace.includes("id:'advances'"));
 assert.ok(economy.includes('ProfitLandsAdvancements?.modifiers'));
 assert.ok(locations.includes("data-site-advances"));
 assert.ok(locations.includes("?.payroll"));
 assert.ok(lab.includes("?.stock"));
});
