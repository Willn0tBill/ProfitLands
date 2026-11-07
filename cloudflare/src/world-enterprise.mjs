/* ProfitLands online enterprise systems.
 * The server is authoritative for all costs, ownership and mutations.
 * This code extends an existing player's ledger without importing local saves.
 */
import core from './world-core.mjs';
import cityContracts from './world-city-contracts.mjs';
import bankruptcy from './world-bankruptcy.mjs';
import ascension from './world-ascension.mjs';

const MAX_COMPANIES=core.MAX_BUSINESSES;
const MAX_SITES_PER_COMPANY=16;
const MAX_WORKERS_PER_COMPANY=100;
const STOCKS=Object.freeze(core.SHARE_CATALOG.map(s=>({...s,price:s.baseCents})));
const RESEARCH=Object.freeze([
 {id:'workforce',name:'Workforce Training',cost:10000},
 {id:'logistics',name:'Distribution Networks',cost:50000},
 {id:'automation',name:'Automated Operations',cost:250000},
 {id:'finance',name:'Financial Analytics',cost:100000},
 {id:'sustainability',name:'Sustainable Growth',cost:500000}
]);
const COUNTRY_IDS=new Set(core.COUNTRIES.map(x=>x.id));
const DEFAULTS=()=>({
 country:'us',stocks:{},majorCompanies:[],loanDebt:0,loanPrincipal:0,
 loanIssuedAt:0,loanDueAt:0,repaymentAuto:false,
 bankruptcyCount:0,lastBankruptcyAt:0,prestigeRank:0,prestigeTrophies:{},
 properties:[],warehouse:0,warehouseStock:0,trucks:0,research:[],
 cityContract:null,lastCityRewardAt:0,cityCompleted:0,
 lastContractDay:'',contractsCompleted:0,routes:[],metrics:{purchases:0,hires:0,supplyOrders:0,trades:0,branches:0}
});
const error=(code)=>({ok:false,error:code});
const positiveInt=(n,max)=>Number.isSafeInteger(n)&&n>=1&&n<=max;
const nonnegInt=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const def=id=>core.BUSINESS_TYPES.find(x=>x.id===id)||null;
const stock=id=>STOCKS.find(x=>x.id===id)||null;
function ensure(p){
 if(!p.enterprise||typeof p.enterprise!=='object')p.enterprise=DEFAULTS();
 const s=p.enterprise;
 core.ensureFiscal(p);
 if(!s.stocks||typeof s.stocks!=='object')s.stocks={};
 if(!Array.isArray(s.properties))s.properties=[];
 if(!Array.isArray(s.research))s.research=[];
 if(!Array.isArray(s.majorCompanies))s.majorCompanies=[];
 // Old saves held one route; retain it during the additive multi-route upgrade.
 if(!Array.isArray(s.routes))s.routes=s.route?[s.route]:[];
 delete s.route;
 if(!s.metrics||typeof s.metrics!=='object')s.metrics=DEFAULTS().metrics;
 for(const key of Object.keys(DEFAULTS().metrics)){
  if(!nonnegInt(s.metrics[key],1000000000))s.metrics[key]=0;
 }
 if(!COUNTRY_IDS.has(s.country))s.country='us';
 for(const b of p.businesses||[]){
  if(!Array.isArray(b.sites))b.sites=[{level:1,stock:0,price:100,autoRestock:false}];
  if(!nonnegInt(b.workers,MAX_WORKERS_PER_COMPANY))b.workers=0;
  if(!nonnegInt(b.marketing,30))b.marketing=0;
  if(!nonnegInt(b.efficiency,30))b.efficiency=0;
  b.manager=b.manager===true;
 }
 return s;
}
function removeCompanyRoutes(p,index){
 const e=ensure(p);
 e.routes=e.routes.filter(r=>r&&Number.isSafeInteger(r.index)&&
  Number.isSafeInteger(r.site)&&r.index!==index)
  .map(r=>({...r,index:r.index>index?r.index-1:r.index}));
}
function company(p,index){
 if(!nonnegInt(index,1000)||!p.businesses?.[index])return null;
 const b=p.businesses[index];
 const t=def(b.type);
 return t?{b,t}:null;
}
function stockPriceCents(id,now=Date.now()){
 return stock(id)?core.stockPriceCents(id,now):0;
}
function assetValue(p,now=Number.isSafeInteger(p.lastSettledAt)?p.lastSettledAt:Date.now()){
 const s=p.enterprise;
 if(!s)return 0;
 let total=0;
 for(const entry of STOCKS){
  const shares=Number(s.stocks?.[entry.id]||0);
  if(nonnegInt(shares,1000000))total+=Math.floor(shares*stockPriceCents(entry.id,now)/100);
 }
 for(const price of s.properties||[])if(Number.isSafeInteger(price)&&price>0)total+=price;
 for(const holding of s.majorCompanies||[]){
  const corp=core.MAJOR_CORPORATIONS.find(x=>x.id===holding?.type);
  if(corp)total+=corp.price;
 }
 total+=Math.max(0,Number(s.warehouse||0))*10000;
 total+=Math.max(0,Number(s.trucks||0))*5000;
 return Math.max(-core.MAX_CASH,Math.min(core.MAX_CASH,
  total-Number(s.loanDebt||0)-Number(s.fiscal?.taxDue||0)));
}
function extraBusinessValue(b){
 const t=def(b.type);
 if(!t)return 0;
 const sites=Array.isArray(b.sites)?Math.max(1,b.sites.length):1;
 const levels=(b.sites||[]).reduce((n,site)=>n+Math.max(0,Number(site.level||1)-1),0);
 return Math.round(t.cost*Math.max(0,sites-1)*1.5+levels*t.cost*.12);
}
function incomeMultiplier(b,p){
 const sites=Array.isArray(b.sites)?Math.max(1,b.sites.length):1;
 const workers=Math.max(0,Math.min(100,Number(b.workers||0)));
 const marketing=Math.max(0,Math.min(30,Number(b.marketing||0)));
 const efficiency=Math.max(0,Math.min(30,Number(b.efficiency||0)));
 const training=p.enterprise?.research?.includes('workforce')?1.1:1;
 const siteBonus=Array.isArray(b.sites)?
  b.sites.reduce((sum,site)=>sum+
   Math.max(0,Math.min(29,Number(site.level||1)-1))*.22,0)/sites:0;
 return Math.min(24,(1+(sites-1)*.65)*(1+siteBonus)*
  (1+workers*.018)*training*(b.manager?1.18:1)*
  (1+marketing*.015)*(1+efficiency*.014));
}
function propertyPerSecond(p){
 const props=p.enterprise?.properties||[];
 return Math.max(0,Math.min(1000000,props.reduce((n,x)=>
  n+(Number.isFinite(x)?Math.floor(x/180000):0),0)));
}
function summary(p,now=Date.now()){
 const s=ensure(p);
 return {...s,stocks:Object.fromEntries(STOCKS.map(x=>[x.id,Number(s.stocks[x.id]||0)])),
  quotes:STOCKS.map(x=>{
   const current=stockPriceCents(x.id,now);
   const old=stockPriceCents(x.id,Math.max(0,now-900000));
   return {id:x.id,name:x.name,ticker:x.ticker,priceCents:current,
    previousCents:old,changePercent:old?Math.round((current/old-1)*10000)/100:0,
    ipoThreshold:x.ipoThreshold,sector:x.sector,volatility:x.volatility};
  }),
  researchCatalog:RESEARCH,majorCatalog:core.MAJOR_CORPORATIONS.map(x=>({...x,profitPerMinute:x.rev-x.expense,
   currentProfitPerMinute:core.corporationPerSecond(x.id,p,now)*60,
   volatile:x.id!=='local'})),
  countryCatalog:core.COUNTRIES.map(({id,name,region,taxRate,loanRate,inflationPct})=>({id,name,region,taxRate,loanRate,inflationPct})),
  fiscalRate:core.COUNTRIES.find(c=>c.id===s.country)?.taxRate??.255,
  loanStatus:s.loanDebt>0?(s.loanDueAt>0?(now>=s.loanDueAt?'Overdue':'Due'):'Legacy loan'):'Clear',
  bankruptcy:bankruptcy.assessment(p,now),
  prestige:ascension.status(p,now),
  cityContracts:cityContracts.summary(p,now),
  cityCatalog:core.CITY_CATALOG.filter(c=>c.region===(p.worldId||core.WORLD_ID)),
  worldEvent:core.worldEvent(now,p.worldId||core.WORLD_ID),
  companyCap:MAX_COMPANIES,siteCap:MAX_SITES_PER_COMPANY};
}
function trade(p,t,qty,mode,now){
 if(!t||!positiveInt(qty,1000000))return error('invalid_stock_trade');
 const s=ensure(p),before=Number(s.stocks[t.id]||0),price=stockPriceCents(t.id,now);
 if(mode==='buy'){
  // New public offerings are unlocked only by current server-estimated worth.
  if(t.ipoThreshold>0&&core.worth(p,now)<t.ipoThreshold)
   return error('ipo_worth_required');
  if(before+qty>1000000)return error('stock_holding_limit');
  const total=Math.ceil(qty*price/100);
  if(!Number.isSafeInteger(total)||!spend(p,total))return error('insufficient_cash');
  s.stocks[t.id]=before+qty;
  s.metrics.trades++;
  return {ok:true,player:p,cost:total,quote:price,shares:qty};
 }
 if(before<qty)return error('insufficient_shares');
 const proceeds=Math.floor(qty*price*.98/100);
 s.stocks[t.id]=before-qty;
 core.credit(p,proceeds);recordDailyAction(p);s.metrics.trades++;
 return {ok:true,player:p,cost:0,proceeds,quote:price,shares:qty};
}
function recordDailyAction(p){
 const e=ensure(p);
 e.lastQualifyingActionDay=new Date(p.lastSettledAt).toISOString().slice(0,10);
}
function spend(p,cost){
 if(!positiveInt(cost,core.MAX_CASH)||!core.debit(p,cost))return false;
 recordDailyAction(p);
 return true;
}
function apply(player,operation,args={},now=Date.now()){
 const p=core.settle(player,now);
 const e=ensure(p);
 const index=args.index;
 const chosen=company(p,index);
 const b=chosen?.b,t=chosen?.t;
 const qty=args.quantity;
 if(operation==='fileBankruptcy')return bankruptcy.file(p,now);
 if(operation==='ascendEmpire')return ascension.ascend(p,now);
 if(operation==='acceptCityContract')return cityContracts.accept(p,args.contractId,now);
 if(operation==='claimCityContract')return cityContracts.claim(p,now);
 if(operation==='buyMajorCorporation'){
  const corp=core.MAJOR_CORPORATIONS.find(x=>x.id===args.corporationId);
  if(!corp)return error('unknown_corporation');
  if(e.majorCompanies.some(x=>x.type===corp.id))return error('corporation_already_owned');
  if(core.worth(p,now)<corp.req)return error('corporation_worth_required');
  if(!spend(p,corp.price))return error('insufficient_cash');
  e.majorCompanies.push({type:corp.id});
  return {ok:true,player:p,cost:corp.price};
 }
 if(operation==='listCompany'){
  if(!chosen||!positiveInt(args.price,core.MAX_CASH))return error('invalid_listing');
  const value=core.valueOf(b)+extraBusinessValue(b);
  const floor=Math.max(100,Math.floor(value*.5));
  const ceiling=Math.max(floor,Math.min(core.MAX_CASH,Math.ceil(value*2)));
  if(args.price<floor||args.price>ceiling)return error('listing_price_out_of_range');
  b.listing={price:args.price,createdAt:now,expiresAt:now+7*86400000};
  return {ok:true,player:p,cost:0};
 }
 if(operation==='cancelCompanyListing'){
  if(!chosen||!b.listing)return error('listing_unavailable');
  delete b.listing;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='hireStaff'){
  if(!chosen||!positiveInt(qty,20)||b.workers+qty>MAX_WORKERS_PER_COMPANY)return error('invalid_staff_action');
  const cost=Math.max(100,Math.ceil(t.cost*.04))*qty;
  if(!spend(p,cost))return error('insufficient_cash');
  b.workers+=qty;e.metrics.hires+=qty;
  return {ok:true,player:p,cost};
 }
 if(operation==='appointManager'){
  if(!chosen||b.manager)return error('invalid_manager_action');
  const cost=Math.max(1000,Math.ceil(t.cost*1.5));
  if(!spend(p,cost))return error('insufficient_cash');
  b.manager=true;return {ok:true,player:p,cost};
 }
 if(operation==='runMarketing'||operation==='upgradeEfficiency'){
  if(!chosen)return error('unknown_business');
  const field=operation==='runMarketing'?'marketing':'efficiency';
  if(b[field]>=30)return error('max_upgrade');
  const cost=Math.max(100,Math.ceil(t.cost*(field==='marketing'?.20:.3)*(1+b[field])));
  if(!spend(p,cost))return error('insufficient_cash');
  b[field]++;return {ok:true,player:p,cost};
 }
 if(operation==='openBranch'){
  if(!chosen||b.sites.length>=MAX_SITES_PER_COMPANY)return error('branch_limit');
  const city=core.CITY_CATALOG.find(x=>x.id===args.cityId&&
   x.region===(p.worldId||core.WORLD_ID));
  if(args.cityId!==undefined&&!city)return error('invalid_city');
  const cost=Math.max(500,Math.ceil(t.cost*(2+b.sites.length)*(city?.rent||1)));
  if(!spend(p,cost))return error('insufficient_cash');
  b.sites.push({level:1,stock:0,price:100,autoRestock:false,...(city?{cityId:city.id}:{})});
  e.metrics.branches++;return {ok:true,player:p,cost};
 }
 if(operation==='relocateBranch'){
  if(!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||!b.sites[args.site])
   return error('unknown_branch');
  const city=core.CITY_CATALOG.find(x=>x.id===args.cityId&&
   x.region===(p.worldId||core.WORLD_ID));
  if(!city)return error('invalid_city');
  const site=b.sites[args.site];
  if(site.cityId===city.id)return error('already_in_city');
  // Transferring an existing branch is expensive enough to prevent free
  // daily demand arbitrage. Existing inventory and progress are preserved.
  const cost=Math.max(750,Math.ceil(t.cost*1.5*city.rent));
  if(!spend(p,cost))return error('insufficient_cash');
  site.cityId=city.id;
  return {ok:true,player:p,cost};
 }
 if(operation==='upgradeBranch'){
  if(!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||!b.sites[args.site])return error('unknown_branch');
  const site=b.sites[args.site];
  if(!positiveInt(site.level,30)||site.level>=30)return error('max_upgrade');
  const cost=Math.max(100,Math.ceil(t.cost*.35*site.level));
  if(!spend(p,cost))return error('insufficient_cash');
  site.level++;return {ok:true,player:p,cost};
 }
 if(operation==='restockBranch'){
  if(!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||!b.sites[args.site]||
   !positiveInt(qty,5000)||b.sites[args.site].stock+qty>5000)return error('invalid_stock_order');
  const cost=Math.max(1,Math.ceil(t.cost*.0005))*qty;
  if(!spend(p,cost))return error('insufficient_cash');
  b.sites[args.site].stock+=qty;e.metrics.supplyOrders+=qty;
  core.recordOperatingProfit(p,-cost);
  e.lastInventoryAt=now;
  return {ok:true,player:p,cost};
 }
 if(operation==='setAutoRestock'){
  if(!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||!b.sites[args.site]||
   typeof args.enabled!=='boolean')return error('invalid_automation');
  if(args.enabled&&!e.research.includes('automation'))return error('research_required');
  b.sites[args.site].autoRestock=args.enabled;
  e.lastInventoryAt=now;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='setPrice'){
  if(!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||!b.sites[args.site]||
   !positiveInt(args.percent,200)||args.percent<50)return error('invalid_price');
  b.sites[args.site].price=args.percent;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='warehouseOrder'){
  if(!positiveInt(e.warehouse,20)||!positiveInt(qty,1000)||
   e.warehouseStock+qty>e.warehouse*1000)return error('warehouse_capacity');
  const cost=qty*3;
  if(!spend(p,cost))return error('insufficient_cash');
  e.warehouseStock+=qty;e.metrics.supplyOrders+=qty;
  core.recordOperatingProfit(p,-cost);
  return {ok:true,player:p,cost};
 }
 if(operation==='deliverWarehouseStock'){
  if(!positiveInt(e.trucks,100)||!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||
   !b.sites[args.site]||!positiveInt(qty,1000)||e.warehouseStock<qty||
   b.sites[args.site].stock+qty>5000)return error('delivery_unavailable');
  e.warehouseStock-=qty;b.sites[args.site].stock+=qty;e.lastInventoryAt=now;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='setSupplyRoute'){
  if(!positiveInt(e.trucks,100)||!chosen||!nonnegInt(args.site,MAX_SITES_PER_COMPANY-1)||
   !b.sites[args.site]||!positiveInt(qty,100)||!e.research.includes('logistics'))
   return error('route_unavailable');
  const existing=e.routes.findIndex(r=>r.index===index&&r.site===args.site);
  if(existing<0&&e.routes.length>=e.trucks)return error('truck_capacity');
  const route={index,site:args.site,quantity:qty};
  if(existing>=0)e.routes[existing]=route;
  else e.routes.push(route);
  if(!Number.isFinite(e.lastInventoryAt))e.lastInventoryAt=now;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='clearSupplyRoute'){
  if(args.index!==undefined||args.site!==undefined){
   if(!nonnegInt(args.index,MAX_COMPANIES-1)||
      !nonnegInt(args.site,MAX_SITES_PER_COMPANY-1))return error('invalid_route');
   e.routes=e.routes.filter(r=>r.index!==args.index||r.site!==args.site);
  }else e.routes=[];
  return {ok:true,player:p,cost:0};
 }
 if(operation==='buyWarehouse'){
  if(!nonnegInt(e.warehouse,20)||e.warehouse>=20)return error('warehouse_limit');
  const cost=10000*(e.warehouse+1);
  if(!spend(p,cost))return error('insufficient_cash');
  e.warehouse++;return {ok:true,player:p,cost};
 }
 if(operation==='buyTruck'){
  if(!nonnegInt(e.trucks,100)||e.trucks>=100)return error('truck_limit');
  const cost=5000*(e.trucks+1);
  if(!spend(p,cost))return error('insufficient_cash');
  e.trucks++;return {ok:true,player:p,cost};
 }
 if(operation==='buyResearch'){
  const item=RESEARCH.find(x=>x.id===args.researchId);
  if(!item||e.research.includes(item.id))return error('research_unavailable');
  if(!spend(p,item.cost))return error('insufficient_cash');
  e.research.push(item.id);return {ok:true,player:p,cost:item.cost};
 }
 if(operation==='buyShares'||operation==='sellShares'){
  return trade(p,stock(args.stockId),qty,operation==='buyShares'?'buy':'sell',now);
 }
 if(operation==='payTax'){
  const due=Number(e.fiscal?.taxDue||0);
  if(!positiveInt(due,core.MAX_CASH))return error('no_tax_due');
  if(!positiveInt(args.amount,core.MAX_CASH))return error('invalid_tax_payment');
  const payment=Math.min(due,args.amount);
  if(!core.debit(p,payment))return error('insufficient_cash');
  e.fiscal.taxDue-=payment;
  e.fiscal.totalTaxPaid=Math.min(core.MAX_CASH,(e.fiscal.totalTaxPaid||0)+payment);
  return {ok:true,player:p,cost:payment};
 }
 if(operation==='setAutoDebtRepayment'){
  if(e.loanDebt<=0||typeof args.enabled!=='boolean')return error('no_loan');
  e.repaymentAuto=args.enabled;
  return {ok:true,player:p,cost:0};
 }
 if(operation==='borrowLoan'){
  if(bankruptcy.assessment(p,now).nextLoanAt>now)return error('bankruptcy_credit_cooldown');
  if(e.loanDebt>0)return error('loan_outstanding');
  if(![5000,50000,500000].includes(args.amount))return error('invalid_loan');
  const outstanding=Math.ceil(args.amount*1.1);
  if(outstanding>core.MAX_CASH-e.loanDebt)return error('loan_limit');
  e.loanDebt=outstanding;e.loanPrincipal=args.amount;
  e.loanIssuedAt=now;e.loanDueAt=now+30*86400000;e.repaymentAuto=false;
  core.credit(p,args.amount);
  return {ok:true,player:p,cost:0,debt:outstanding};
 }
 if(operation==='repayLoan'){
  if(!positiveInt(e.loanDebt,core.MAX_CASH))return error('no_loan');
  const payment=Math.min(e.loanDebt,Number.isSafeInteger(args.amount)?args.amount:0);
  if(!positiveInt(payment,core.MAX_CASH))return error('invalid_repayment');
  if(!spend(p,payment))return error('insufficient_cash');
  e.loanDebt-=payment;
  if(e.loanDebt===0){e.loanPrincipal=0;e.loanDueAt=0;e.repaymentAuto=false}
  return {ok:true,player:p,cost:payment};
 }
 if(operation==='buyProperty'){
  if(![10000,100000,1000000].includes(args.amount)||e.properties.length>=100)
   return error('invalid_property');
  if(!spend(p,args.amount))return error('insufficient_cash');
  e.properties.push(args.amount);return {ok:true,player:p,cost:args.amount};
 }
 if(operation==='setCountry'){
  if(!COUNTRY_IDS.has(args.country)||p.businesses.length>0||e.metrics.trades>0||
    e.loanDebt>0||e.properties.length>0||e.majorCompanies.length>0||
    e.fiscal?.taxDue>0||e.fiscal?.taxableProfit!==0)return error('country_locked');
  e.country=args.country;return {ok:true,player:p,cost:0};
 }
 if(operation==='claimContract'){
  const day=new Date(now).toISOString().slice(0,10);
  if(e.lastContractDay===day)return error('contract_already_claimed');
  if(e.lastQualifyingActionDay!==day)
   return error('contract_requirements_not_met');
  const reward=Math.min(50000,250+e.contractsCompleted*50);
  e.lastContractDay=day;e.contractsCompleted++;
  core.credit(p,reward);return {ok:true,player:p,cost:0,reward};
 }
 return error('unknown_operation');
}
function recordCityAction(p,operation,now){
 ensure(p);
 return cityContracts.record(p,operation,now);
}
export {STOCKS,RESEARCH,MAX_COMPANIES,MAX_SITES_PER_COMPANY,DEFAULTS,ensure,removeCompanyRoutes,summary,stockPriceCents,assetValue,extraBusinessValue,incomeMultiplier,propertyPerSecond,recordDailyAction,recordCityAction,apply};
export default {ensure,removeCompanyRoutes,summary,apply,recordDailyAction,recordCityAction,stockPriceCents,assetValue,extraBusinessValue,incomeMultiplier,propertyPerSecond};
