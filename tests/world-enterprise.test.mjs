import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import core from '../cloudflare/src/world-core.mjs';
import enterprise from '../cloudflare/src/world-enterprise.mjs';
import {dispatch} from '../cloudflare/src/index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const cjsCore=createRequire(import.meta.url)('../functions/world-core.js');

const t=Date.UTC(2026,10,6,18,0,0);
function player(cash=5000000){
 const p=core.fresh('alice','Player',t);
 core.credit(p,cash);
 const bought=core.buyBusiness(p,'coffee',t);
 assert.equal(bought.ok,true);
 return bought.player;
}
function mutate(player,op,args,at=t){
 const result=enterprise.apply(player,op,args,at);
 assert.equal(result.ok,true,op+': '+result.error);
 return result.player;
}
function database(){
 const rows=new Map();
 return {
  read(id){const row=rows.get(id);return row?JSON.parse(row.payload):null},
  set(id,state){const row=rows.get(id);rows.set(id,{version:(row?.version||0)+1,payload:JSON.stringify(state)})},
  prepare(sql){
   let args=[];
   return{
    bind(...v){args=v;return this},
    async first(){const row=rows.get(args[0]);return row?{...row}:null},
    async run(){
     if(sql.startsWith('INSERT OR IGNORE')){
      if(!rows.has(args[0]))rows.set(args[0],{version:0,payload:args[1]});
      return {meta:{changes:1}};
     }
     if(sql.startsWith('UPDATE world_state')){
      const row=rows.get(args[1]);
      if(!row||row.version!==args[2])return {meta:{changes:0}};
      rows.set(args[1],{version:row.version+1,payload:args[0]});
      return {meta:{changes:1}};
     }
     throw Error('Unexpected query '+sql);
    }
   }
  }
 };
}
test('legacy online businesses gain additive enterprise defaults without losing cash',()=>{
 const p=player(),before=p.cash;
 const info=enterprise.summary(p,t);
 assert.equal(info.country,'us');
 assert.equal(p.cash,before);
 assert.equal(p.businesses[0].sites.length,1);
 assert.equal(core.worth(p),before+core.valueOf(p.businesses[0]));
 assert.equal(info.quotes.length,4);
});
test('staff, management, marketing, efficiency and branch expansion affect real server income',()=>{
 let p=player(),income=core.perSecond(p);
 p=mutate(p,'hireStaff',{index:0,quantity:10});
 assert.equal(p.businesses[0].workers,10);
 assert.ok(core.perSecond(p)>income);
 const pre=p.cash;
 p=mutate(p,'appointManager',{index:0});
 assert.equal(p.businesses[0].manager,true);
 assert.ok(p.cash<pre);
 p=mutate(p,'runMarketing',{index:0});
 p=mutate(p,'upgradeEfficiency',{index:0});
 income=core.perSecond(p);
 p=mutate(p,'openBranch',{index:0});
 assert.equal(p.businesses[0].sites.length,2);
 assert.ok(core.perSecond(p)>income);
 const beforeValue=core.worth(p);
 p=mutate(p,'upgradeBranch',{index:0,site:1});
 assert.equal(p.businesses[0].sites[1].level,2);
 assert.ok(core.worth(p)>beforeValue-2000);
});
test('business spending cannot be forged with caller provided cash',()=>{
 const p=player(0);
 const result=enterprise.apply(p,'hireStaff',{index:0,quantity:500,cash:999999999},t);
 assert.equal(result.ok,false);
 assert.equal(result.error,'invalid_staff_action');
 assert.equal(p.businesses[0].workers,undefined);
 const wrong=enterprise.apply(p,'openBranch',{index:1000,cash:999999999},t);
 assert.equal(wrong.ok,false);
});
test('inventory is purchased and sold only once as server time advances',()=>{
 let p=player(0);
 p=mutate(p,'restockBranch',{index:0,site:0,quantity:100},t);
 assert.equal(p.businesses[0].sites[0].stock,100);
 const after=core.settle(p,t+60000);
 assert.equal(after.businesses[0].sites[0].stock,99);
 assert.ok(after.cash>p.cash);
 const again=core.settle(after,t+60000);
 assert.equal(again.businesses[0].sites[0].stock,99);
});
test('future inventory cannot be sold immediately after restocking an empty old site',()=>{
 let p=player(0);
 p=mutate(p,'restockBranch',{index:0,site:0,quantity:10},t);
 p=core.settle(p,t+3600000);
 assert.equal(p.businesses[0].sites[0].stock,0);
 p=mutate(p,'restockBranch',{index:0,site:0,quantity:10},t+7200000);
 const immediate=core.settle(p,t+7200000);
 assert.equal(immediate.businesses[0].sites[0].stock,10);
});
test('automatic restocking requires research and actual money',()=>{
 let p=player();
 assert.equal(enterprise.apply(p,'setAutoRestock',{index:0,site:0,enabled:true},t).error,'research_required');
 p=mutate(p,'buyResearch',{researchId:'automation'},t);
 p=mutate(p,'setAutoRestock',{index:0,site:0,enabled:true},t);
 const before=p.cash;
 p=core.settle(p,t+60000);
 assert.equal(p.businesses[0].sites[0].stock,100);
 assert.ok(p.cash<before+core.perSecond(p)*60);
 const repeat=core.settle(p,t+60000);
 assert.equal(repeat.businesses[0].sites[0].stock,100);
});
test('warehouse and delivery systems require paid assets and move existing stock',()=>{
 let p=player();
 assert.equal(enterprise.apply(p,'warehouseOrder',{quantity:100},t).error,'warehouse_capacity');
 p=mutate(p,'buyWarehouse',{},t);
 p=mutate(p,'buyTruck',{},t);
 p=mutate(p,'warehouseOrder',{quantity:100},t);
 assert.equal(p.enterprise.warehouseStock,100);
 p=mutate(p,'deliverWarehouseStock',{index:0,site:0,quantity:30},t);
 assert.equal(p.enterprise.warehouseStock,70);
 assert.equal(p.businesses[0].sites[0].stock,30);
 assert.equal(enterprise.apply(p,'deliverWarehouseStock',{index:0,site:0,quantity:1000},t).ok,false);
});
test('automated routes move only real warehouse stock each full minute',()=>{
 let p=player();
 p=mutate(p,'buyWarehouse',{},t);
 p=mutate(p,'buyTruck',{},t);
 p=mutate(p,'buyResearch',{researchId:'logistics'},t);
 p=mutate(p,'warehouseOrder',{quantity:100},t);
 p=mutate(p,'setSupplyRoute',{index:0,site:0,quantity:15},t);
 const a=core.settle(p,t+60000);
 assert.equal(a.businesses[0].sites[0].stock,15);
 assert.equal(a.enterprise.warehouseStock,85);
 const b=core.settle(a,t+60000);
 assert.equal(b.enterprise.warehouseStock,85);
});
test('stocks use server quotes, bounded share counts, and a sale spread',()=>{
 let p=player();
 const initial=p.cash,price=enterprise.stockPriceCents('nova',t);
 p=mutate(p,'buyShares',{stockId:'nova',quantity:10},t);
 assert.equal(p.enterprise.stocks.nova,10);
 assert.equal(p.cash,initial-Math.ceil(price*10/100));
 const before=p.cash;
 p=mutate(p,'sellShares',{stockId:'nova',quantity:2},t);
 assert.equal(p.enterprise.stocks.nova,8);
 assert.equal(p.cash,before+Math.floor(2*price*.98/100));
 assert.equal(enterprise.apply(p,'sellShares',{stockId:'nova',quantity:100},t).ok,false);
});
test('one loan at a time, explicit repayment and real negative net-worth liability',()=>{
 let p=player(0);
 const worthBefore=core.worth(p);
 p=mutate(p,'borrowLoan',{amount:5000},t);
 assert.equal(p.enterprise.loanDebt,5500);
 assert.ok(core.worth(p)<worthBefore);
 assert.equal(enterprise.apply(p,'borrowLoan',{amount:50000},t).error,'loan_outstanding');
 p=mutate(p,'repayLoan',{amount:5000},t);
 assert.equal(p.enterprise.loanDebt,500);
 p=mutate(p,'repayLoan',{amount:500},t);
 assert.equal(p.enterprise.loanDebt,0);
});
test('property and research must be purchased to affect returns',()=>{
 let p=player();
 const rate=core.perSecond(p);
 p=mutate(p,'buyProperty',{amount:1000000},t);
 assert.equal(p.enterprise.properties[0],1000000);
 assert.ok(core.perSecond(p)>rate);
 assert.equal(enterprise.apply(p,'buyProperty',{amount:400},t).error,'invalid_property');
 assert.equal(enterprise.apply(p,'buyResearch',{researchId:'not-real'},t).error,'research_unavailable');
});
test('contracts cannot be claimed more than once per UTC day',()=>{
 let p=player();
 assert.equal(enterprise.apply(p,'claimContract',{},t).error,'contract_requirements_not_met');
 p=mutate(p,'hireStaff',{index:0,quantity:1},t);
 p=mutate(p,'claimContract',{},t);
 assert.equal(p.enterprise.contractsCompleted,1);
 assert.equal(enterprise.apply(p,'claimContract',{},t).error,'contract_already_claimed');
 assert.equal(enterprise.apply(p,'claimContract',{},t+86400000).error,'contract_requirements_not_met');
 p=mutate(p,'hireStaff',{index:0,quantity:1},t+86400000);
 p=mutate(p,'claimContract',{},t+86400000);
 assert.equal(p.enterprise.contractsCompleted,2);
});
test('valid country choices are restricted after opening a business',()=>{
 let p=core.fresh('alice','Player',t);
 p=mutate(p,'setCountry',{country:'jp'},t);
 assert.equal(p.enterprise.country,'jp');
 core.credit(p,10000);
 p=core.buyBusiness(p,'coffee',t).player;
 assert.equal(enterprise.apply(p,'setCountry',{country:'ca'},t).error,'country_locked');
});
test('D1 operations are region-isolated and identical request IDs cannot double-charge',async()=>{
 const db=database(),rid='f'.repeat(32);
 for(const world of ['world1','world-europe']){
  await dispatch('register','player',{},db,world);
 }
 const first=await dispatch('enterpriseAction','player',
  {operation:'borrowLoan',amount:5000,requestId:rid},db,'world1');
 assert.equal(first.ok,true);
 assert.equal(first.replayed,false);
 const duplicate=await dispatch('enterpriseAction','player',
  {operation:'borrowLoan',amount:5000,requestId:rid},db,'world1');
 assert.equal(duplicate.replayed,true);
 assert.equal(db.read('world1').players.player.enterprise.loanDebt,5500);
 assert.equal(db.read('world-europe').players.player.cash,1500);
 await assert.rejects(dispatch('enterpriseAction','player',
  {operation:'buyProperty',amount:10000,requestId:rid},db,'world1'),/another action/);
});
test('server rejects invalid enterprise actions without altering world balances',async()=>{
 const db=database(),rid='a'.repeat(32);
 await dispatch('register','player',{},db,'world1');
 const before=db.read('world1');
 await assert.rejects(dispatch('enterpriseAction','player',
  {operation:'hireStaff',index:1,quantity:1000,cash:9000000,requestId:rid},db,'world1'),/blocked/);
 await assert.rejects(dispatch('enterpriseAction','player',
  {operation:'injectCash',cash:9000000,requestId:rid},db,'world1'),/Unknown enterprise operation/);
 assert.equal(db.read('world1').players.player.cash,before.players.player.cash);
});

test('player company listings are private to a region, fairly priced, and atomic to acquire',async()=>{
 const db=database();
 for(const who of ['seller','buyer']){
  await dispatch('register',who,{},db,'world1');
  await dispatch('register',who,{},db,'world-europe');
 }
 const ownerBuy=await dispatch('buyBusiness','seller',
  {businessId:'coffee',requestId:'1'.repeat(32)},db,'world1');
 assert.equal(ownerBuy.player.businesses.length,1);
 const available=await dispatch('enterpriseAction','seller',
  {operation:'listCompany',index:0,price:500,requestId:'2'.repeat(32)},db,'world1');
 assert.equal(available.player.businesses[0].listing.price,500);
 assert.equal((await dispatch('getListings','buyer',{},db,'world1')).length,1);
 assert.equal((await dispatch('getListings','buyer',{},db,'world-europe')).length,0);
 const bought=await dispatch('buyListedCompany','buyer',{
  sellerUid:'seller',index:0,maxPrice:500,requestId:'3'.repeat(32)},db,'world1');
 assert.equal(bought.ok,true);
 assert.equal(bought.cost,500);
 assert.equal(db.read('world1').players.seller.businesses.length,0);
 assert.equal(db.read('world1').players.seller.cash,1500);
 assert.equal(db.read('world1').players.buyer.businesses.length,1);
 assert.equal(db.read('world1').players.buyer.cash,1000);
 const buyerContract=await dispatch('enterpriseAction','buyer',
  {operation:'claimContract',requestId:'b'.repeat(32)},db,'world1');
 assert.equal(buyerContract.reward,250);
 assert.equal((await dispatch('getListings','buyer',{},db,'world1')).length,0);
 const replay=await dispatch('buyListedCompany','buyer',{
  sellerUid:'seller',index:0,maxPrice:500,requestId:'3'.repeat(32)},db,'world1');
 assert.equal(replay.replayed,true);
 assert.equal(db.read('world1').players.buyer.businesses.length,1);
});
test('unlisted companies, self purchases, higher asking prices and cross-world purchases fail',async()=>{
 const db=database();
 for(const who of ['seller','buyer'])await dispatch('register',who,{},db,'world1');
 await dispatch('buyBusiness','seller',{businessId:'coffee',requestId:'4'.repeat(32)},db,'world1');
 await assert.rejects(dispatch('buyListedCompany','buyer',{
  sellerUid:'seller',index:0,maxPrice:600,requestId:'5'.repeat(32)},db,'world1'),/no longer available/);
 await assert.rejects(dispatch('buyListedCompany','seller',{
  sellerUid:'seller',index:0,maxPrice:600,requestId:'6'.repeat(32)},db,'world1'),/valid regional/);
 await assert.rejects(dispatch('enterpriseAction','seller',{
  operation:'listCompany',index:0,price:20,requestId:'7'.repeat(32)},db,'world1'),/out_of_range/);
 await dispatch('enterpriseAction','seller',{
  operation:'listCompany',index:0,price:900,requestId:'8'.repeat(32)},db,'world1');
 await assert.rejects(dispatch('buyListedCompany','buyer',{
  sellerUid:'seller',index:0,maxPrice:500,requestId:'9'.repeat(32)},db,'world1'),/price changed/);
 assert.equal(db.read('world1').players.seller.businesses.length,1);
 assert.equal(db.read('world1').players.buyer.businesses.length,0);
});
test('online achievement ranks are derived from trusted server events',async()=>{
 const db=database();
 await dispatch('register','player',{},db,'world1');
 await dispatch('buyBusiness','player',{businessId:'coffee',requestId:'a'.repeat(32)},db,'world1');
 const hired=await dispatch('enterpriseAction','player',{
  operation:'hireStaff',index:0,quantity:1,requestId:'b'.repeat(32)},db,'world1');
 assert.ok(hired.player.achievements.earned>0);
 assert.equal(hired.player.achievements.total,131072);
 assert.ok(hired.player.achievements.sectors.find(x=>x.id==='coffee').ranks.hired>=1);
 const noForgery=await dispatch('me','player',{},db,'world1');
 assert.equal(noForgery.player.achievements.earned,hired.player.achievements.earned);
});

test('server-approved purchases unlock daily contracts only once and request replay does not mint cash',async()=>{
 const db=database();
 await dispatch('register','contractplayer',{},db,'world1');
 const before=db.read('world1').players.contractplayer.cash;
 await dispatch('buyBusiness','contractplayer',
  {businessId:'coffee',requestId:'1'.repeat(32)},db,'world1');
 const claim=await dispatch('enterpriseAction','contractplayer',
  {operation:'claimContract',requestId:'2'.repeat(32)},db,'world1');
 assert.equal(claim.reward,250);
 const replay=await dispatch('enterpriseAction','contractplayer',
  {operation:'claimContract',requestId:'2'.repeat(32)},db,'world1');
 assert.equal(replay.replayed,true);
 assert.equal(db.read('world1').players.contractplayer.cash,before-500+250);
 await assert.rejects(dispatch('enterpriseAction','contractplayer',
  {operation:'claimContract',requestId:'3'.repeat(32)},db,'world1'),/contract_already_claimed/);
});

test('free configuration changes do not unlock a daily monetary reward',()=>{
 const p=core.fresh('testplayer','Player',t);
 const updated=enterprise.apply(p,'setCountry',{country:'ca'},t);
 assert.equal(updated.ok,true);
 assert.equal(enterprise.apply(updated.player,'claimContract',{},t).error,
  'contract_requirements_not_met');
});

test('two supply routes use paid trucks and conserve warehouse goods over reconnects',()=>{
 let p=player();
 p=mutate(p,'buyWarehouse',{},t);
 p=mutate(p,'buyTruck',{},t);
 p=mutate(p,'buyResearch',{researchId:'logistics'},t);
 p=mutate(p,'openBranch',{index:0},t);
 p=mutate(p,'warehouseOrder',{quantity:200},t);
 p=mutate(p,'setSupplyRoute',{index:0,site:0,quantity:15},t);
 assert.equal(enterprise.apply(p,'setSupplyRoute',{index:0,site:1,quantity:10},t).error,'truck_capacity');
 p=mutate(p,'buyTruck',{},t);
 const before=p;
 p=mutate(p,'setSupplyRoute',{index:0,site:1,quantity:10},t);
 assert.equal(before.enterprise.routes.length,1,'a clone must not modify previously saved player data');
 assert.equal(p.enterprise.routes.length,2);
 const after=core.settle(p,t+120000);
 assert.equal(after.businesses[0].sites[0].stock,30);
 assert.equal(after.businesses[0].sites[1].stock,20);
 assert.equal(after.enterprise.warehouseStock,150);
 const repeated=core.settle(after,t+120000);
 assert.equal(repeated.enterprise.warehouseStock,150);
 const cleared=mutate(repeated,'clearSupplyRoute',{index:0,site:0},t+120000);
 assert.equal(cleared.enterprise.routes.length,1);
 const remaining=core.settle(cleared,t+180000);
 assert.equal(remaining.businesses[0].sites[0].stock,29);
 assert.equal(remaining.businesses[0].sites[1].stock,29);
 assert.equal(remaining.enterprise.warehouseStock,140);
});
test('legacy single-route save migrates without dropping delivery',()=>{
 let p=player();
 p=mutate(p,'buyWarehouse',{},t);
 p=mutate(p,'buyTruck',{},t);
 p=mutate(p,'buyResearch',{researchId:'logistics'},t);
 p=mutate(p,'warehouseOrder',{quantity:50},t);
 p.enterprise.route={index:0,site:0,quantity:10};
 p.enterprise.lastInventoryAt=t;
 delete p.enterprise.routes;
 const migrated=enterprise.summary(p,t);
 assert.equal(migrated.routes.length,1);
 assert.equal(p.enterprise.route,undefined);
 const settled=core.settle(p,t+60000);
 assert.equal(settled.enterprise.warehouseStock,40);
 assert.equal(settled.businesses[0].sites[0].stock,10);
});
test('selling a business removes orphan supply routes and shifts surviving indices',async()=>{
 const db=database();
 for(const uid of ['seller','buyer'])await dispatch('register',uid,{},db,'world1');
 for(let i=0;i<2;i++)await dispatch('buyBusiness','seller',{
  businessId:'coffee',requestId:String(i+1).repeat(32)},db,'world1');
 const snapshot=db.read('world1');
 const seller=snapshot.players.seller;
 enterprise.ensure(seller);
 Object.assign(seller.enterprise,{warehouse:1,warehouseStock:100,trucks:2,
  research:['logistics'],routes:[{index:0,site:0,quantity:10},{index:1,site:0,quantity:20}],
  lastInventoryAt:Date.now()});
 snapshot.players.seller=seller;
 db.set('world1',snapshot);
 await dispatch('enterpriseAction','seller',{
  operation:'listCompany',index:0,price:500,requestId:'3'.repeat(32)},db,'world1');
 await dispatch('buyListedCompany','buyer',{
  sellerUid:'seller',index:0,maxPrice:500,requestId:'4'.repeat(32)},db,'world1');
 const final=db.read('world1').players.seller;
 assert.equal(final.businesses.length,1);
 assert.deepEqual(final.enterprise.routes,[{index:0,site:0,quantity:20}]);
 const delivery=core.settle(final,final.lastSettledAt+60000);
 assert.equal(delivery.enterprise.warehouseStock,80);
 assert.equal(delivery.businesses[0].sites[0].stock,20);
});

test('online stock holdings are marked to current server quotes and settle only once',()=>{
 const at=t;
 const base=core.fresh('market-user','Market Tester',at);
 core.credit(base,100000);
 const bought=enterprise.apply(base,'buyShares',{stockId:'nova',quantity:100},at);
 assert.equal(bought.ok,true);
 const p=bought.player;
 assert.equal(core.stockPriceCents('nova',at),enterprise.stockPriceCents('nova',at));
 const later=at+900000;
 const change=core.worth(p,later)-core.worth(p,at);
 assert.notEqual(change,0);
 assert.equal(enterprise.assetValue(p,later)-enterprise.assetValue(p,at),change);
 const settled=core.settle(p,later);
 assert.equal(settled.netWorth,core.worth(p,at)+change);
 assert.equal(settled.dayGain,p.dayGain+change);
 assert.equal(settled.weekGain,p.weekGain+change);
 const repeated=core.settle(settled,later);
 assert.equal(repeated.dayGain,settled.dayGain);
 assert.equal(repeated.weekGain,settled.weekGain);
 assert.equal(repeated.netWorth,settled.netWorth);
});
test('frequent quote polling cannot create extra market gains or losses',()=>{
 const p=core.fresh('quote-user','Market Tester',t);
 core.credit(p,100000);
 const bought=enterprise.apply(p,'buyShares',{stockId:'harbor',quantity:100},t).player;
 const bulk=core.settle(bought,t+3600000);
 let streamed=bought;
 for(let now=t+60000;now<=t+3600000;now+=60000)streamed=core.settle(streamed,now);
 assert.equal(streamed.netWorth,bulk.netWorth);
 assert.equal(streamed.dayGain,bulk.dayGain);
 assert.equal(streamed.weekGain,bulk.weekGain);
});

test('stock price movement at UTC Monday midnight belongs only to new week and day',()=>{
 const sunday=Date.UTC(2026,10,8,23,45,0);
 const p=core.fresh('midnight-user','Market Tester',sunday);
 core.credit(p,100000);
 const bought=enterprise.apply(p,'buyShares',{stockId:'skyline',quantity:100},sunday).player;
 const monday=sunday+900000;
 const delta=core.worth(bought,monday)-core.worth(bought,sunday);
 assert.notEqual(delta,0);
 const next=core.settle(bought,monday);
 assert.equal(next.dayKey,'2026-11-09');
 assert.equal(next.weekKey,'2026-11-09');
 assert.equal(next.dayGain,delta);
 assert.equal(next.weekGain,delta);
});

test('Functions and Cloudflare use matching online economy logic with isolated saved states',()=>{
 const p=player();
 enterprise.ensure(p);
 p.enterprise.stocks.nova=20;
 p.enterprise.badgeCounters={coffee:{earnings:25,cycles:2}};
 p.enterprise.warehouse=1;
 p.enterprise.warehouseStock=60;
 p.enterprise.trucks=1;
 p.enterprise.research=['logistics'];
 p.enterprise.routes=[{index:0,site:0,quantity:8}];
 p.enterprise.lastInventoryAt=t;
 const frozen=structuredClone(p);
 for(const at of [t+60000,t+900000,t+3600000]){
  assert.equal(core.stockPriceCents('nova',at),cjsCore.stockPriceCents('nova',at));
  assert.equal(core.worth(p,at),cjsCore.worth(p,at));
  assert.deepEqual(core.settle(p,at),cjsCore.settle(p,at));
 }
 assert.deepEqual(p,frozen,'read-only settlements must not mutate cached player snapshots');
});

test('all seven classic corporation tiers have their singleplayer prices and baselines',()=>{
 const expected=[
  ['local',1000000,850000,12000],['regional',10000000,8000000,90000],
  ['national',100000000,80000000,800000],['global',1000000000,800000000,8000000],
  ['conglomerate',10000000000,8000000000,70000000],
  ['mega',100000000000,80000000000,600000000],
  ['empire',1000000000000,850000000000,5000000000]
 ];
 assert.deepEqual(core.MAJOR_CORPORATIONS.map(c=>[c.id,c.req,c.price,c.rev-c.expense]),expected);
 assert.deepEqual(cjsCore.MAJOR_CORPORATIONS,core.MAJOR_CORPORATIONS);
});
test('major corporation purchases require actual server worth and funds, and increase income',()=>{
 const at=t,p=core.fresh('corp','Corporation Tester',at);
 assert.equal(enterprise.apply(p,'buyMajorCorporation',{corporationId:'local',cash:999999999},at).error,
  'corporation_worth_required');
 core.credit(p,1000000);
 const previousWorth=core.worth(p),previousIncome=core.perSecond(p);
 const bought=enterprise.apply(p,'buyMajorCorporation',{corporationId:'local',cost:0},at);
 assert.equal(bought.ok,true);
 assert.equal(bought.cost,850000);
 assert.equal(bought.player.cash,p.cash-850000);
 assert.equal(bought.player.enterprise.majorCompanies.length,1);
 assert.equal(core.worth(bought.player),previousWorth);
 assert.equal(core.perSecond(bought.player)-previousIncome,200);
 assert.equal(enterprise.apply(bought.player,'buyMajorCorporation',{corporationId:'local'},at).error,
  'corporation_already_owned');
 const later=core.settle(bought.player,at+60000);
 assert.equal(later.cash,bought.player.cash+12000);
 assert.equal(enterprise.apply(p,'buyMajorCorporation',{corporationId:'bogus'},at).error,'unknown_corporation');
 assert.equal(p.enterprise,undefined,'no failed purchase mutates original player state');
});
test('corporation buying is idempotent and region isolated in the authoritative worker',async()=>{
 const db=database(),who='corporation-account';
 await dispatch('register',who,{},db,'world1');
 await dispatch('register',who,{},db,'world-asia');
 const state=db.read('world1'),p=state.players[who];
 core.credit(p,2000000);
 state.players[who]=p;
 db.set('world1',state);
 const requestId='f'.repeat(32);
 const bought=await dispatch('enterpriseAction',who,
  {operation:'buyMajorCorporation',corporationId:'local',cash:100000000000,requestId},
  db,'world1');
 assert.equal(bought.ok,true);
 assert.equal(bought.player.enterprise.majorCompanies.length,1);
 const repeated=await dispatch('enterpriseAction',who,
  {operation:'buyMajorCorporation',corporationId:'local',cash:100000000000,requestId},
  db,'world1');
 assert.equal(repeated.replayed,true);
 assert.equal(db.read('world1').players[who].enterprise.majorCompanies.length,1);
 assert.equal(db.read('world-asia').players[who].cash,1500);
 await assert.rejects(dispatch('enterpriseAction',who,
  {operation:'buyMajorCorporation',corporationId:'local',requestId:'e'.repeat(32)},
  db,'world-asia'),/corporation_worth_required/);
});
test('corporation holdings are cloned across reconnect and CJS/ESM return matching income',()=>{
 const p=core.fresh('corpclone','Tester',t);
 core.credit(p,2000000);
 const bought=enterprise.apply(p,'buyMajorCorporation',{corporationId:'local'},t).player;
 const first=core.settle(bought,t+60000),second=cjsCore.settle(bought,t+60000);
 assert.deepEqual(first,second);
 first.enterprise.majorCompanies.push({type:'regional'});
 assert.equal(bought.enterprise.majorCompanies.length,1);
 assert.equal(core.worth(bought,t),cjsCore.worth(bought,t));
});

test('full singleplayer country catalog is generated into both online runtimes',()=>{
 assert.equal(core.COUNTRIES.length,35);
 assert.deepEqual(core.COUNTRIES,cjsCore.COUNTRIES);
 const regions=new Set(core.COUNTRIES.map(c=>c.region));
 assert.ok(regions.has('Africa')&&regions.has('Asia')&&regions.has('Europe'));
 for(const code of ['us','cl','nl','ie','ae','ng','nz','vn','id','ke']){
  assert.ok(core.COUNTRIES.find(c=>c.id===code),code);
 }
 const p=core.fresh('country','Country Test',t);
 const catalog=enterprise.summary(p,t).countryCatalog;
 assert.equal(catalog.length,35);
 assert.equal(catalog.find(x=>x.id==='ae').name,'United Arab Emirates');
 assert.equal(enterprise.apply(p,'setCountry',{country:'xx'},t).error,'country_locked');
 for(const code of ['ae','nz','cl','ng']){
  const result=enterprise.apply(p,'setCountry',{country:code},t);
  assert.equal(result.ok,true,code);
  assert.equal(result.player.enterprise.country,code);
 }
});
test('country revenue and cost factors affect online businesses using singleplayer baselines',()=>{
 for(const def of core.BUSINESS_TYPES){
  const input=core.BUSINESS_ECONOMICS[def.id];
  assert.equal(input.revenue-input.expense,def.baseProfit);
  assert.equal(core.countryMargin('us',def.id,input.revenue,input.expense),def.baseProfit);
 }
 const make=code=>{
  let p=core.fresh('testcountry','Tester',t);
  p=enterprise.apply(p,'setCountry',{country:code},t).player;
  core.credit(p,5000000);
  return core.buyBusiness(p,'software',t).player;
 };
 const us=make('us'),ae=make('ae'),ng=make('ng');
 assert.equal(core.perSecond(us),Math.round(Math.floor(26733/60)*
  (core.worldEvent(t,'world1').effects.software||1)));
 assert.notEqual(core.perSecond(ae),core.perSecond(us));
 assert.notEqual(core.perSecond(ng),core.perSecond(us));
 assert.equal(core.perSecond(ae),cjsCore.perSecond(ae));
 assert.equal(core.perSecond(ng),cjsCore.perSecond(ng));
 assert.equal(enterprise.apply(ng,'setCountry',{country:'us'},t).error,'country_locked');
});

test('online annual corporate taxes accrue only real operating profit and settle once',()=>{
 const p=player(0);
 enterprise.summary(p,t);
 assert.equal(p.enterprise.fiscal.year,1);
 assert.equal(p.enterprise.fiscal.nextTaxAt,t+365*86400000);
 assert.equal(p.enterprise.fiscal.taxDue,0);
 const later=t+365*86400000;
 const taxed=core.settle(p,later);
 assert.equal(taxed.enterprise.fiscal.year,2);
 assert.equal(taxed.enterprise.fiscal.nextTaxAt,later+365*86400000);
 assert.equal(taxed.enterprise.fiscal.lastBill,Math.floor(21600*.255));
 assert.equal(taxed.enterprise.fiscal.taxDue,Math.floor(21600*.255));
 assert.equal(taxed.enterprise.fiscal.taxableProfit,0);
 const repeated=core.settle(taxed,later);
 assert.equal(repeated.enterprise.fiscal.taxDue,taxed.enterprise.fiscal.taxDue);
 assert.equal(repeated.enterprise.fiscal.year,2);
 const payment=enterprise.apply(taxed,'payTax',{amount:5000},later);
 assert.equal(payment.ok,true);
 assert.equal(payment.cost,5000);
 assert.equal(payment.player.enterprise.fiscal.taxDue,Math.floor(21600*.255)-5000);
 assert.equal(core.worth(payment.player),core.worth(taxed));
 const final=enterprise.apply(payment.player,'payTax',{amount:5000},later);
 assert.equal(final.ok,true);
 assert.equal(final.player.enterprise.fiscal.taxDue,0);
 assert.equal(enterprise.apply(final.player,'payTax',{amount:5000},later).error,'no_tax_due');
 assert.equal(p.enterprise.fiscal.year,1,'older snapshot cannot mutate');
});
test('taxes do not apply to borrowed principal, asset purchases or share trading',()=>{
 let p=player();
 const before=enterprise.summary(p,t).fiscal.taxableProfit;
 p=mutate(p,'borrowLoan',{amount:50000},t);
 assert.equal(p.enterprise.fiscal.taxableProfit,before);
 p=mutate(p,'buyProperty',{amount:10000},t);
 assert.equal(p.enterprise.fiscal.taxableProfit,before);
 p=mutate(p,'buyShares',{stockId:'nova',quantity:2},t);
 assert.equal(p.enterprise.fiscal.taxableProfit,before);
 p=mutate(p,'restockBranch',{index:0,site:0,quantity:10},t);
 assert.ok(p.enterprise.fiscal.taxableProfit<before);
});
test('tax liability cannot be forged, paid twice or bypassed by switching countries',()=>{
 let p=player(0);
 enterprise.summary(p,t);
 p.enterprise.fiscal.taxDue=2000;
 assert.equal(enterprise.apply(p,'setCountry',{country:'ae'},t).error,'country_locked');
 assert.equal(enterprise.apply(p,'payTax',{amount:99999, cash:99999999},t).error,'insufficient_cash');
 core.credit(p,1000);
 const paid=mutate(p,'payTax',{amount:99999},t);
 assert.equal(paid.enterprise.fiscal.taxDue,0);
 assert.equal(paid.enterprise.fiscal.totalTaxPaid,2000);
 assert.equal(enterprise.apply(paid,'payTax',{amount:99999},t).error,'no_tax_due');
});

test('receipts persist compact metadata rather than duplicating full player snapshots',async()=>{
 const db=database(),who='receipt-user';
 await dispatch('register',who,{},db,'world1');
 const requestId='a'.repeat(32);
 const bought=await dispatch('buyBusiness',who,{businessId:'coffee',requestId},db,'world1');
 const first=db.read('world1');
 const receipt=first.receipts[who+':'+requestId];
 assert.equal(receipt.result.player,undefined,'receipt must not copy account assets');
 assert.equal(receipt.result.cost,500);
 assert.ok(JSON.stringify(receipt).length<220);
 const replay=await dispatch('buyBusiness',who,{businessId:'coffee',requestId},db,'world1');
 assert.equal(replay.replayed,true);
 assert.equal(replay.player.cash,bought.player.cash);
 assert.equal(replay.player.worldId,'world1');
 await dispatch('enterpriseAction',who,{
  operation:'hireStaff',index:0,quantity:1,requestId:'b'.repeat(32)},db,'world1');
 const fresh=await dispatch('buyBusiness',who,{businessId:'coffee',requestId},db,'world1');
 assert.equal(fresh.replayed,true);
 assert.equal(fresh.player.businesses[0].workers,1,
  'replay should show current account state, not stale cached business data');
 assert.equal(db.read('world1').players[who].businesses.length,1);
});
test('100 harmless world operations retain affordable receipt storage',async()=>{
 const db=database(),who='receipt-stress';
 await dispatch('register',who,{},db,'world-europe');
 for(let i=0;i<100;i++){
  const requestId=String(i+1).padStart(32,'0');
  await dispatch('enterpriseAction',who,
   {operation:'setCountry',country:'us',requestId},db,'world-europe');
 }
 const state=db.read('world-europe');
 const receipts=Object.values(state.receipts);
 assert.equal(receipts.length,100);
 assert.ok(receipts.every(x=>!x.result.player));
 assert.ok(JSON.stringify(state).length<35000,'receipts must not grow with full player payloads');
});

test('multiplayer supports 80 server-owned companies, not the old 40-company gate',()=>{
 let p=core.fresh('larger-empire','Company Tester',t);
 core.credit(p,1000000);
 assert.equal(core.MAX_BUSINESSES,80);
 for(let i=0;i<80;i++){
  const result=core.buyBusiness(p,'coffee',t);
  assert.equal(result.ok,true,'Company '+i);
  p=result.player;
 }
 assert.equal(p.businesses.length,80);
 assert.equal(core.buyBusiness(p,'coffee',t).error,'business_limit');
});
test('regional business branches expand to 16 with a server-enforced cap',()=>{
 let p=player(1000000);
 enterprise.ensure(p);
 assert.equal(enterprise.summary(p,t).siteCap,16);
 for(let i=1;i<16;i++)p=mutate(p,'openBranch',{index:0},t);
 assert.equal(p.businesses[0].sites.length,16);
 assert.equal(enterprise.apply(p,'openBranch',{index:0},t).error,'branch_limit');
});
test('regional world accepts more than 64 independent accounts',async()=>{
 const db=database();
 for(let i=0;i<70;i++){
  const uid='capacity-'+i;
  const res=await dispatch('register',uid,{},db,'world-europe');
  assert.equal(res.created,true);
 }
 assert.equal(Object.keys(db.read('world-europe').players).length,70);
 const health=await dispatch('health',null,{},db,'world-europe');
 assert.equal(health.maxPlayers,128);
});

test('online city contracts require a new paid action after acceptance',()=>{
 let p=player();
 const day=t;
 const available=enterprise.summary(p,day).cityContracts.offers;
 assert.ok(available.some(x=>x.id==='promote'));
 let accepted=enterprise.apply(p,'acceptCityContract',{contractId:'promote'},day);
 assert.equal(accepted.ok,true);
 p=accepted.player;
 assert.equal(enterprise.apply(p,'claimCityContract',{},day).error,'city_contract_incomplete');
 assert.equal(enterprise.recordCityAction(p,'setPrice',day),false,
  'free settings cannot count as completed city work');
 assert.equal(enterprise.summary(p,day).cityContracts.active.progress,0);
 const action=enterprise.apply(p,'runMarketing',{index:0},day);
 assert.equal(action.ok,true);
 assert.equal(enterprise.recordCityAction(action.player,'runMarketing',day),true);
 assert.equal(enterprise.recordCityAction(action.player,'runMarketing',day),false);
 const before=action.player.cash;
 const rewarded=enterprise.apply(action.player,'claimCityContract',{},day);
 assert.equal(rewarded.ok,true);
 assert.equal(rewarded.reward,55);
 assert.equal(rewarded.player.cash,before+55);
 assert.equal(enterprise.summary(rewarded.player,day).cityContracts.completed,1);
 assert.equal(enterprise.apply(rewarded.player,'claimCityContract',{},day).error,'city_contract_incomplete');
 assert.equal(enterprise.apply(rewarded.player,'acceptCityContract',{contractId:'open'},day).error,
  'city_contract_already_accepted');
 const nextDay=day+86400000;
 assert.ok(enterprise.summary(rewarded.player,nextDay).cityContracts.offers.length>0);
});
test('city contracts do not count purchases made before accepting the work order',async()=>{
 const db=database(),uid='city-a';
 await dispatch('register',uid,{},db,'world1');
 const buy=await dispatch('buyBusiness',uid,{businessId:'coffee',requestId:'1'.repeat(32)},db,'world1');
 const offered=await dispatch('enterpriseAction',uid,{
  operation:'acceptCityContract',contractId:'open',requestId:'2'.repeat(32)},db,'world1');
 assert.equal(offered.player.enterprise.cityContracts.active.progress,0);
 await assert.rejects(dispatch('enterpriseAction',uid,{
  operation:'claimCityContract',requestId:'3'.repeat(32)},db,'world1'),/city_contract_incomplete/);
 const next=await dispatch('buyBusiness',uid,{
  businessId:'coffee',requestId:'4'.repeat(32)},db,'world1');
 assert.equal(next.player.enterprise.cityContracts.active.progress,1);
 const rewarded=await dispatch('enterpriseAction',uid,{
  operation:'claimCityContract',requestId:'5'.repeat(32)},db,'world1');
 assert.equal(rewarded.reward,75);
 assert.equal(rewarded.player.businesses.length,2);
 const cash=rewarded.player.cash;
 const replay=await dispatch('enterpriseAction',uid,{
  operation:'claimCityContract',requestId:'5'.repeat(32)},db,'world1');
 assert.equal(replay.replayed,true);
 assert.equal(replay.player.cash,cash);
 assert.equal(db.read('world1').players[uid].cash,cash);
 assert.equal(db.read('world1').players[uid].enterprise.cityCompleted,1);
});
test('city contracts survive cloning and do not transfer on company acquisition',()=>{
 let p=player();
 let accepted=enterprise.apply(p,'acceptCityContract',{contractId:'upgrade'},t).player;
 let copied=core.settle(accepted,t);
 copied.enterprise.cityContract.progress=1;
 assert.equal(accepted.enterprise.cityContract.progress,0,'city contract must be deep cloned');
 assert.equal(copied.enterprise.cityContract.progress,1);
});

test('server-derived regional events change the intended sectors and never trust client event data',()=>{
 const steady=Date.UTC(2026,10,4,12),shipping=Date.UTC(2026,10,7,12);
 assert.equal(core.worldEvent(steady,'world1').id,'stable_market');
 assert.equal(core.worldEvent(shipping,'world1').id,'shipping_delay');
 assert.notEqual(core.worldEvent(shipping,'world1').id,core.worldEvent(shipping,'world-europe').id);
 assert.equal(core.worldEvent(shipping,'world1').day,'2026-11-07');
 assert.equal(core.worldEvent(shipping,'world1').endsAt,Date.UTC(2026,10,8));
 const p=core.fresh('events','Economic Events',steady);
 p.businesses=[{type:'factory',level:8}];
 const baseline=core.perSecond(p,steady);
 const disrupted=core.perSecond(p,shipping);
 assert.ok(disrupted<baseline,'shipping disruption must reduce factory profit');
 assert.equal(disrupted,cjsCore.perSecond(p,shipping),'Firebase and Cloudflare core must match');
 p.enterprise={worldEvent:{id:'consumer_boom',effects:{factory:1000000}}};
 assert.equal(core.perSecond(p,shipping),disrupted,'client-stored event objects cannot forge earnings');
});
test('regional events settle accurately across midnight and cannot be farmed by refreshing',()=>{
 const start=Date.UTC(2026,10,4,23,55);
 const end=Date.UTC(2026,10,5,0,15);
 const midnight=Date.UTC(2026,10,5);
 const original=core.fresh('day-events','Daily Events',start);
 original.businesses=[{type:'restaurant',level:16}];
 const once=core.settle(original,end);
 const split=core.settle(core.settle(original,midnight),end);
 assert.equal(once.cash,split.cash,'a mid-day refresh cannot increase market-event earnings');
 assert.equal(once.dayGain,split.dayGain,'daily rankings must honor the midnight boundary');
 assert.equal(core.settle(once,end).cash,once.cash,'repeated polling cannot pay an interval twice');
 assert.deepEqual(original.businesses,[{type:'restaurant',level:16}]);
});

test('automatic loan recovery repays real earned cash without minting or changing net worth',()=>{
 const p=player(100000);
 const loan=enterprise.apply(p,'borrowLoan',{amount:5000},t);
 assert.equal(loan.ok,true);
 assert.equal(loan.player.enterprise.loanDueAt,t+30*86400000);
 assert.equal(loan.player.enterprise.loanDebt,5500);
 const auto=enterprise.apply(loan.player,'setAutoDebtRepayment',{enabled:true},t);
 assert.equal(auto.ok,true);
 assert.equal(auto.player.enterprise.repaymentAuto,true);
 const plain={...auto.player,enterprise:{...auto.player.enterprise,repaymentAuto:false}};
 const when=t+120000;
 const without=core.settle(plain,when);
 const withPlan=core.settle(auto.player,when);
 const repayment=without.cash-withPlan.cash;
 assert.ok(repayment>0);
 assert.equal(without.enterprise.loanDebt-withPlan.enterprise.loanDebt,repayment);
 assert.equal(core.worth(withPlan,when),core.worth(without,when));
 assert.equal(withPlan.dayGain,without.dayGain,'loan transfers must not artificially lower rankings');
 assert.equal(core.settle(withPlan,when).cash,withPlan.cash,'polling cannot take the payment twice');
 assert.deepEqual(core.settle(auto.player,when),cjsCore.settle(auto.player,when));
});
test('new loans become overdue after 30 real days, while legacy balances are grandfathered',()=>{
 const p=player(100000),loan=enterprise.apply(p,'borrowLoan',{amount:5000},t);
 const due=loan.player.enterprise.loanDueAt;
 const old={...loan.player,enterprise:{...loan.player.enterprise}};
 delete old.enterprise.loanDueAt;
 const before=core.settle({...loan.player,lastSettledAt:due-60000},due-1000);
 const after=core.settle({...loan.player,lastSettledAt:due-60000},due+60000);
 assert.equal(before.enterprise.loanDebt,5500,'not overdue before the deadline');
 assert.ok(after.enterprise.loanDebt<5500,'overdue loan takes up to 40% of earned income');
 const oldAfter=core.settle({...old,lastSettledAt:due-60000},due+60000);
 assert.equal(oldAfter.enterprise.loanDebt,5500,'legacy loans with no due date remain unchanged');
 assert.equal(enterprise.summary(after,due+60000).loanStatus,'Overdue');
 assert.equal(enterprise.summary(oldAfter,due+60000).loanStatus,'Legacy loan');
});
test('auto repayment controls require an actual outstanding loan and cannot be forged',async()=>{
 const db=database(),who='loan-recovery';
 await dispatch('register',who,{},db,'world1');
 await assert.rejects(dispatch('enterpriseAction',who,{
  operation:'setAutoDebtRepayment',enabled:true,requestId:'1'.repeat(32)},db,'world1'),
 /no_loan/);
 const borrowed=await dispatch('enterpriseAction',who,{
  operation:'borrowLoan',amount:5000,requestId:'2'.repeat(32)},db,'world1');
 assert.equal(borrowed.player.enterprise.loanDebt,5500);
 const enabled=await dispatch('enterpriseAction',who,{
  operation:'setAutoDebtRepayment',enabled:true,requestId:'3'.repeat(32)},db,'world1');
 assert.equal(enabled.player.enterprise.repaymentAuto,true);
 const replay=await dispatch('enterpriseAction',who,{
  operation:'setAutoDebtRepayment',enabled:true,requestId:'3'.repeat(32)},db,'world1');
 assert.equal(replay.replayed,true);
 assert.equal(replay.player.enterprise.loanDebt,5500);
});
