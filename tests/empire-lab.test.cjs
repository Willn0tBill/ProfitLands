const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const types=[
{id:'coffee',cost:500,name:'Coffee Shop',baseRevenue:115,baseExpense:48},
{id:'restaurant',cost:2000,name:'Restaurant',baseRevenue:390,baseExpense:190},
{id:'logistics',cost:10000,name:'Logistics',baseRevenue:1250,baseExpense:770},
{id:'software',cost:2500000,name:'Software',baseRevenue:330000,baseExpense:170000},
{id:'hotel',cost:25000,name:'Hotel',baseRevenue:3300,baseExpense:1900}
];
function mock(){
 let cash=1000000,saves=0;
 const business=(id,type='coffee')=>({name:'Company '+id,type,level:1,popularity:60,
  financialBalance:0,chainCount:0,locations:[{id:'downtown',name:'Downtown',level:1,
  rent:1.2,demand:1.2,basePopularity:60,workers:4,manager:true,marketing:0,efficiency:0}]});
 const state={cash,started:true,actions:100,news:[],businesses:[business(1),business(2,'restaurant')]};
 const money={canAfford:amount=>cash>=amount,
  spend:amount=>{if(cash<amount)return false;cash-=amount;state.cash=cash;return true},
  gain:amount=>{cash+=amount;state.cash=cash}};
 const game={classList:{contains:id=>id==='active'}};
 const document={readyState:'loading',visibilityState:'visible',addEventListener(){},
  getElementById(id){return id==='gameScreen'?game:null}};
 const window={state,BUSINESS_TYPES:types,ProfitLandsMoney:money,
  ProfitLandsLocationOps:{normalizeAll(){}},
  ProfitLandsEconomy:{businessValue:b=>types.find(x=>x.id===b.type)?.cost||500},
  save(){saves++},render(){},toast(){},addEventListener(){}};
 const context={window,document,Date,Math,Number,console};
 vm.createContext(context);
 new vm.Script(fs.readFileSync(path.join(root,'empire-lab.js'),'utf8'),{filename:'empire-lab.js'}).runInContext(context);
 return{lab:window.ProfitLandsEmpire,window,state,document,money,cash:()=>cash,saves:()=>saves,types};
}
test('inventory and per-store pricing alter actual business profit',()=>{
 const m=mock(),lab=m.lab;lab.ensure();const first=lab.allSites()[0];
 assert.equal(lab.delta(first.b,first.l,100,50),0,'opt-in business mechanics');
 assert.equal(lab.act('enable'),true);
 const before=lab.delta(first.b,first.l,100,50);
 assert.equal(lab.act('price',{delta:.05}),true);
 assert.notEqual(lab.delta(first.b,first.l,100,50),before);
 assert.equal(lab.act('buyStock',{qty:20}),true);
 assert.ok(first.l.lab.stock>24);
 first.l.lab.stock=0;
 assert.ok(lab.delta(first.b,first.l,100,50)<before,'stockout decreases profit');
 assert.ok(m.saves()>=3,'actions persist through existing save API');
});
test('staff roles are constrained to hired employees at each location',()=>{
 const m=mock(),lab=m.lab;lab.ensure();const s=lab.allSites()[0];lab.act('enable');
 for(let i=0;i<4;i++)assert.equal(lab.act('role',{role:'sales',delta:1}),true);
 assert.equal(lab.act('role',{role:'production',delta:1}),false);
 assert.equal(lab.act('role',{role:'sales',delta:-1}),true);
 assert.equal(lab.act('role',{role:'production',delta:1}),true);
 assert.equal(s.l.lab.roles.sales,3);
 assert.equal(s.l.lab.roles.production,1);
});
test('warehouses, trucks and delivery routes deduct cash and move stock',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 assert.equal(lab.act('buyWarehouse'),true);
 assert.equal(lab.act('route'),false,'fleet required before setting a route');
 assert.equal(lab.act('buyTruck'),true);
 assert.equal(lab.act('route'),true);
 assert.equal(lab.act('warehouseStock',{qty:50}),true);
 const site=lab.allSites()[0],original=site.l.lab.stock,before=m.cash();
 assert.equal(lab.act('dispatch',{qty:10}),true);
 assert.equal(site.l.lab.stock,original+10);
 assert.equal(m.state.empireLab.warehouseStock,40);
 assert.ok(m.cash()<before);
 assert.equal(lab.act('autoRoute'),true);
});
test('regional expansion opens location with own saved region economics',()=>{
 const m=mock(),lab=m.lab;lab.ensure();const original=m.state.businesses[0].locations.length;
 assert.equal(lab.act('unlockRegion',{region:'ny'}),true);
 assert.equal(lab.act('openRegion',{region:'ny'}),true);
 const sites=m.state.businesses[0].locations;
 assert.equal(sites.length,original+1);
 const newest=sites.at(-1);
 assert.equal(newest.lab.region,'ny');
 assert.ok(newest.rent>1);
 assert.ok(newest.demand>1);
});
test('HQ research, automation, and IPO affect the selected business',()=>{
 const m=mock(),lab=m.lab;lab.ensure();const site=lab.allSites()[0];
 assert.equal(lab.act('buyHQ'),true);
 assert.equal(lab.act('research',{research:'automation'}),true);
 assert.equal(lab.act('enable'),true);
 assert.equal(lab.act('autoPrice'),true);
 assert.equal(lab.act('autoRestock'),true);
 const before=lab.delta(site.b,site.l,100,50),cash=m.cash();
 assert.equal(lab.act('ipo'),true);
 assert.ok(m.cash()>cash);
 assert.ok(lab.delta(site.b,site.l,100,50)<before,'dilution reduces future revenue');
 assert.equal(lab.act('ipo'),false,'cannot IPO twice');
});
test('rival acquisition grants a company and removes that AI competitor',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const count=m.state.businesses.length,rivals=m.state.empireLab.rivals.length;
 assert.equal(lab.act('acquire',{rival:'r1'}),true);
 assert.equal(m.state.businesses.length,count+1);
 assert.equal(m.state.empireLab.rivals.length,rivals-1);
 assert.ok(m.state.businesses.some(b=>b.name.includes('Metro Retail Group')));
});
test('mergers combine locations but reject cross-industry companies',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 assert.equal(lab.act('merge',{merge:1}),false,'cannot merge coffee and restaurant');
 const clone={...m.state.businesses[0],name:'Another Coffee Shop',
  locations:[{id:'suburbs',name:'Suburbs',workers:2,level:2,rent:1.1,demand:1.1}]};
 m.state.businesses.push(clone);const before=m.state.businesses[0].locations.length;
 assert.equal(lab.act('merge',{merge:2}),true);
 assert.equal(m.state.businesses.length,2);
 assert.equal(m.state.businesses[0].locations.length,before+1);
});
test('shared market is simulated, trades are saved locally, and no network is required',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 assert.equal(lab.act('marketSell',{qty:5}),true);
 assert.equal(m.state.empireLab.trades.length,1);
 assert.equal(m.state.empireLab.trades[0].simulated,true);
 const saved=JSON.parse(JSON.stringify(m.state.empireLab));
 assert.equal(saved.trades[0].qty,5);
 assert.ok(fs.readFileSync(path.join(root,'play/index.html'),'utf8').includes('offline AI simulation'));
});
test('preview uses game saves and does not clear old save schemas',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.ok(html.includes('empire-lab.js'));
 assert.ok(html.includes('id="empireLab"'));
 assert.ok(economy.includes('ProfitLandsEmpire?.delta'));
 assert.ok(app.includes('state.empireLab=null'));
 assert.ok(app.includes("'profitlands-v2'"),'legacy save schema preserved');
});

test('interactive demo is isolated from real saves, with example companies and capital',()=>{
 const demo=fs.readFileSync(path.join(root,'empire-demo.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'preview/index.html'),'utf8');
 assert.ok(html.includes('empire-demo.js'));
 assert.ok(html.includes('empire-lab.js'));
 assert.ok(html.includes('isolated')||html.includes('Isolated'));
 assert.ok(demo.includes('cash:25000000'));
 assert.ok(demo.includes('window.save=()=>{}'));
 assert.ok(!demo.includes('localStorage.setItem'));
 assert.ok(!demo.includes('firebase.firestore'));
 assert.ok(html.includes('No account login'));
});

test('stale saved ID counter and duplicate location IDs are repaired without losing independent store state',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const original=m.state.businesses[0].locations[0];
 const second=m.state.businesses[1].locations[0];
 const stockBefore=original.lab.stock;
 const preserved=original.labId;
 second.labId=preserved;
 second.lab.stock=42;
 m.state.businesses[1].locations.push({id:'waterfront',name:'Later Site',labId:'site_777',
   workers:0,level:1,lab:{enabled:true,stock:19,price:1,roles:{sales:0,production:0,logistics:0}}});
 m.state.businesses[0].locations.push({id:'suburbs',name:'Unnumbered Site',workers:0,level:1});
 m.state.empireLab.nextId=1;
 lab.ensure();
 const list=lab.allSites(),ids=list.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length,'all locations must have unique labIds');
 assert.equal(original.labId,preserved,'first existing location ID is preserved');
 assert.equal(m.state.businesses[1].locations[1].labId,'site_777','later valid ID remains reserved');
 assert.ok(m.state.empireLab.nextId>777,'allocator is positioned beyond saved IDs');
 assert.equal(second.lab.stock,42,'duplicate ID repair does not erase store inventory');
 assert.equal(original.lab.stock,stockBefore);
 const stockBeforeEdit=second.lab.stock;
 lab.selectSite(second);
 lab.act('buyStock',{qty:20});
 assert.equal(second.lab.stock,stockBeforeEdit+20,'selected branch receives stock');
 assert.equal(original.lab.stock,stockBefore,'other branch is untouched');
});
test('profit calculation for active stores does not renormalize the entire empire per location',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 assert.equal(lab.act('enable'),true);
 const site=lab.allSites()[0];
 let normalizations=0;
 m.window.ProfitLandsLocationOps.normalizeAll=()=>{normalizations++};
 for(let i=0;i<1000;i++)lab.delta(site.b,site.l,115,48);
 assert.equal(normalizations,0,'no repeated full-empire normalize during income calculation');
});
test('Operations site picker limits options in a large empire, retaining selected site',()=>{
 const m=mock(),lab=m.lab,base=m.state.businesses[0];
 base.locations=Array.from({length:10000},(_,i)=>({
   id:'downtown',name:'Branch '+(i+1),level:1,workers:0,manager:false,basePopularity:55
 }));
 let content='';
 const panel={querySelector:()=>null,set innerHTML(v){content=v},get innerHTML(){return content}};
 m.document.querySelectorAll=()=>[];
 const oldGet=m.document.getElementById;
 m.document.getElementById=id=>id==='empireLabContent'?panel:id==='empireLabStats'?{textContent:''}:oldGet(id);
 lab.ensure();
 const last=base.locations.at(-1);
 lab.selectSite(last);
 lab.render();
 assert.match(content,/id="labSiteSearch"/);
 assert.match(content,/id="labSiteCount"/);
 const options=[...content.matchAll(/<option value="(site_\d+)"/g)].map(x=>x[1]);
 assert.ok(options.length<=81,'only a bounded number of DOM options may be rendered');
 assert.ok(options.includes(last.labId),'late selected site must remain in the list');
 assert.ok(content.includes('refine the search'),'large portfolio prompts filtering');
});
test('manage current branch opens its exact location index, not the company first page',()=>{
 const m=mock(),lab=m.lab;
 const locations=m.state.businesses[0].locations;
 locations.push({id:'waterfront',name:'Late Branch',level:1,workers:0,manager:false});
 lab.ensure();
 const focused=locations[1];
 const calls=[];
 m.window.openManage=(i,j)=>calls.push([i,j]);
 lab.selectSite(focused);
 assert.equal(lab.act('manage'),true);
 assert.deepEqual(calls,[[0,1]]);
});

test('a full warehouse cannot charge cash for inventory it cannot store',()=>{
 const m=mock(),lab=m.lab;
 assert.equal(lab.act('buyWarehouse'),true);
 const p=m.state.empireLab;
 p.warehouseStock=p.warehouse*1200;
 const cash=m.cash(),actions=m.state.actions,saves=m.saves();
 assert.equal(lab.act('warehouseStock',{qty:50}),false);
 assert.equal(m.cash(),cash);
 assert.equal(m.state.actions,actions);
 assert.equal(m.saves(),saves);
 assert.equal(p.warehouseStock,1200);
});
test('full store stock and full delivery destination reject payment with no inventory loss',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const location=lab.allSites()[0].l;
 location.lab.stock=999990;
 const cash=m.cash();
 assert.equal(lab.act('buyStock',{qty:20}),false);
 assert.equal(location.lab.stock,999990);
 assert.equal(m.cash(),cash);
 assert.equal(lab.act('buyWarehouse'),true);
 assert.equal(lab.act('buyTruck'),true);
 assert.equal(lab.act('route'),true);
 assert.equal(lab.act('warehouseStock',{qty:50}),true);
 const afterWarehouse=m.cash(),stored=m.state.empireLab.warehouseStock;
 assert.equal(lab.act('dispatch',{qty:20}),false);
 assert.equal(m.cash(),afterWarehouse);
 assert.equal(m.state.empireLab.warehouseStock,stored);
 assert.equal(location.lab.stock,999990);
});
test('acquisitions refuse a 101st business without spending an action or cash',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const template=m.state.businesses[0];
 while(m.state.businesses.length<100)m.state.businesses.push({
  ...template,name:'Other company '+m.state.businesses.length,locations:[{id:'downtown',name:'Site'}]
 });
 const cash=m.cash(),actions=m.state.actions,rivals=m.state.empireLab.rivals.length;
 assert.equal(lab.act('acquire',{rival:'r1'}),false);
 assert.equal(m.cash(),cash);
 assert.equal(m.state.actions,actions);
 assert.equal(m.state.businesses.length,100);
 assert.equal(m.state.empireLab.rivals.length,rivals);
});
test('mergers refuse to create companies that exceed the backup limit',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const source={type:'coffee',name:'Oversized Coffee',level:1,financialBalance:0,
  locations:Array.from({length:50000},(_,i)=>({id:'downtown',name:'Site '+i,level:1,workers:0}))};
 m.state.businesses.push(source);
 const cash=m.cash(),actions=m.state.actions,original=m.state.businesses[0].locations.length;
 assert.equal(lab.act('merge',{merge:2}),false);
 assert.equal(m.cash(),cash);
 assert.equal(m.state.actions,actions);
 assert.equal(m.state.businesses.length,3);
 assert.equal(m.state.businesses[0].locations.length,original);
});
test('regional expansion rejects the backup location cap without charging',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 m.state.empireLab.regions.push('ny');
 const main=m.state.businesses[0];
 main.locations=Array.from({length:50000},(_,i)=>({id:'downtown',name:'Site '+i,level:1,workers:0}));
 const cash=m.cash(),actions=m.state.actions;
 assert.equal(lab.act('openRegion',{region:'ny'}),false);
 assert.equal(m.cash(),cash);
 assert.equal(m.state.actions,actions);
 assert.equal(main.locations.length,50000);
});

test('automated replenishment supplies thousands of stores but retains a bounded audit log',()=>{
 const m=mock(),lab=m.lab;
 m.state.businesses[0].locations=Array.from({length:2000},(_,i)=>({
  id:'downtown',name:'Branch '+i,workers:0,manager:true,level:1,
  lab:{enabled:true,stock:0,price:1,roles:{sales:0,production:0,logistics:0},
   sold:0,autoRestock:true,autoPrice:false,region:'local'}
 }));
 lab.ensure();
 const p=m.state.empireLab,cash=m.cash();
 let normalized=0;
 m.window.ProfitLandsLocationOps.normalizeAll=()=>{normalized++};
 lab.tick(1000);lab.tick(6000);
 assert.equal(normalized,0,'background supply tick must not renormalize 2,000 locations');
 assert.equal(p.log.length,1,'one summary log per tick, not 2,000 entries');
 assert.match(p.log[0],/Auto-restock: 2000 branches supplied/);
 assert.ok(m.state.businesses[0].locations.every(x=>x.lab.stock===20));
 assert.equal(m.cash(),cash-2000*160,'each stock order still pays the normal price');
 assert.equal(m.state.actions,100,'automated orders do not spend player actions');
 for(let step=2;step<=25;step++){
  for(const l of m.state.businesses[0].locations)l.lab.stock=0;
  m.money.gain(2000*160);
  lab.tick(1000+step*5000);
 }
 assert.ok(p.log.length<=18,'automation audit is bounded after many updates');
 assert.ok(p.log.every(x=>x.length<130),'summaries remain compact without branch-level spam');
});
test('automatic delivery does not use absent trucks or move inventory while hidden',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 assert.equal(lab.act('buyWarehouse'),true);
 assert.equal(lab.act('buyTruck'),true);
 assert.equal(lab.act('route'),true);
 assert.equal(lab.act('warehouseStock',{qty:50}),true);
 assert.equal(lab.act('autoRoute'),true);
 const p=m.state.empireLab,site=lab.allSites()[0],before=site.l.lab.stock;
 p.trucks=0;
 const cash=m.cash();
 lab.tick(1000);lab.tick(6000);
 assert.equal(site.l.lab.stock,before,'a supply route without a truck cannot deliver');
 assert.equal(p.warehouseStock,50);
 assert.equal(m.cash(),cash);
 m.document.visibilityState='hidden';
 site.l.lab.stock=0;site.l.lab.autoRestock=true;site.l.lab.enabled=true;
 lab.tick(11000);
 assert.equal(site.l.lab.stock,0,'hidden-tab ticks never automate purchasing');
 assert.equal(m.cash(),cash);
});
test('Operations displays precise stock costs and low-stock automation status',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const l=lab.allSites()[0].l;
 l.lab.enabled=true;l.lab.stock=3;l.lab.autoRestock=true;l.lab.autoPrice=false;
 m.window.ProfitLandsAdvancements={modifiers:()=>({stock:.5})};
 let html='';
 const panel={querySelector:()=>null,set innerHTML(value){html=value},get innerHTML(){return html}};
 m.document.querySelectorAll=()=>[];
 const get=m.document.getElementById;
 m.document.getElementById=id=>id==='empireLabContent'?panel:id==='empireLabStats'?{textContent:''}:get(id);
 lab.render();
 assert.match(html,/lab-supply-health/);
 assert.match(html,/Low stock/);
 assert.match(html,/Auto-restock: On/);
 assert.match(html,/Auto-pricing: Off/);
 assert.match(html,/Buy 20 units · \$80/,'shown cost respects stock-purchase discounts');
 assert.match(fs.readFileSync(path.join(root,'empire-lab.css'),'utf8'),/lab-supply-alert/);
});
test('an unaffordable store order renders disabled and automation requires active simulation',()=>{
 const m=mock(),lab=m.lab;lab.ensure();
 const l=lab.allSites()[0].l;
 l.lab.enabled=false;
 m.window.ProfitLandsMoney.canAfford=()=>false;
 let html='';
 const panel={querySelector:()=>null,set innerHTML(v){html=v},get innerHTML(){return html}};
 m.document.querySelectorAll=()=>[];
 const get=m.document.getElementById;
 m.document.getElementById=id=>id==='empireLabContent'?panel:id==='empireLabStats'?{textContent:''}:get(id);
 lab.render();
 assert.match(html,/Buy 20 units[^<]*<\/button>/);
 assert.match(html,/data-lab-action="buyStock"[^>]*disabled/);
 assert.match(html,/data-lab-action="autoRestock"[^>]*disabled/);
 assert.match(html,/data-lab-action="autoPrice"[^>]*disabled/);
});
