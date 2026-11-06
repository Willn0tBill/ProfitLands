import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import core from '../cloudflare/src/world-core.mjs';
import enterprise from '../cloudflare/src/world-enterprise.mjs';
import {dispatch} from '../cloudflare/src/index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

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
