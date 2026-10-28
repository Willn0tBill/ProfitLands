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
 return{lab:window.ProfitLandsEmpire,window,state,money,cash:()=>cash,saves:()=>saves,types};
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
