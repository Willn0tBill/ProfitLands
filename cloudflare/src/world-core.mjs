/* Built from functions/world-core.js; keep rules and costs synchronized with the original. */
import COUNTRIES from './country-catalog.mjs';
const module={exports:{}};
'use strict';
// Deterministic server-only alpha economy. The browser never supplies earnings, cash or worth.
const WORLD_ID='world1';
const MAX_PLAYERS=64;
const MAX_BUSINESSES=80;
const MAX_CASH=1_000_000_000_000;
const MAX_OFFLINE_SECONDS=6*3600;
const START_CASH=1500;
const BUSINESS_TYPES=Object.freeze([
 {id:'coffee',name:'Coffee Shop',cost:500,baseProfit:66},
 {id:'restaurant',name:'Restaurant',cost:2000,baseProfit:226},
 {id:'gamestore',name:'Game Store',cost:5000,baseProfit:282},
 {id:'hotel',name:'Hotel',cost:25000,baseProfit:1522},
 {id:'dealership',name:'Car Dealership',cost:100000,baseProfit:4787},
 {id:'factory',name:'Factory',cost:500000,baseProfit:26207},
 {id:'software',name:'Software Company',cost:2500000,baseProfit:26733},
 {id:'logistics',name:'Logistics Company',cost:10000000,baseProfit:513757}
]);
const byId=id=>BUSINESS_TYPES.find(b=>b.id===id)||null;
// The daily regional economy is derived solely from trusted UTC time/region.
// No client-supplied randomness, multiplier, or event progress is accepted.
// Scenario #1 is the legacy baseline, preserving already-earned historical
// settlements; all players in the same region see the same event on each day.
const WORLD_EVENTS=Object.freeze([
 {id:'travel_boom',title:'Travel Demand Jumps',detail:'Hotel and transport demand is stronger today.',effects:{hotel:1.12,logistics:1.05}},
 {id:'stable_market',title:'Stable Trading Day',detail:'Business demand is steady across the region.',effects:{}},
 {id:'consumer_boom',title:'Consumer Spending Surges',detail:'Shoppers and diners are spending more today.',effects:{coffee:1.08,restaurant:1.08,gamestore:1.08}},
 {id:'technology_boom',title:'Technology Sector Rallies',detail:'Software companies are seeing stronger demand.',effects:{software:1.12}},
 {id:'shipping_delay',title:'Supply Routes Disrupted',detail:'Manufacturing and logistics face a temporary slowdown.',effects:{factory:.93,logistics:.91}},
 {id:'consumer_slowdown',title:'Consumer Spending Slows',detail:'Retail demand is slightly softer today.',effects:{coffee:.95,restaurant:.95,gamestore:.95,dealership:.96}},
 // Rotating server-owned economic and natural events from the singleplayer
 // catalog. Sector impacts are modest and checked on each UTC settlement.
 {id:'rent_crisis',title:'Commercial Rents Rise',detail:'Rising commercial rents squeeze hospitality and storefront margins.',effects:{coffee:.94,restaurant:.93,hotel:.95,gamestore:.97}},
 {id:'rent_relief',title:'Commercial Rent Pressure Eases',detail:'Easier rents help smaller storefront businesses operate.',effects:{coffee:1.06,restaurant:1.05,hotel:1.03}},
 {id:'wage_surge',title:'Labor Costs Increase',detail:'Staffing costs squeeze labor-heavy businesses.',effects:{restaurant:.94,hotel:.95,factory:.96,logistics:.95}},
 {id:'supply_shortage',title:'Key Materials Become Scarce',detail:'Industrial supply shortages slow production and transport.',effects:{factory:.86,dealership:.91,logistics:.90}},
 {id:'market_panic',title:'Markets Turn Cautious',detail:'Lower consumer confidence slows discretionary spending.',effects:{dealership:.89,gamestore:.93,software:.94}},
 {id:'investor_confidence',title:'Investor Confidence Improves',detail:'Investment confidence lifts technology and industrial demand.',effects:{software:1.07,factory:1.05,dealership:1.04}},
 {id:'credit_tight',title:'Lenders Tighten Credit',detail:'More restrictive lending slows capital-intensive expansion.',effects:{dealership:.93,hotel:.95,factory:.96}},
 {id:'stimulus',title:'Economic Support Announced',detail:'Broad economic support increases consumer demand.',effects:{coffee:1.05,restaurant:1.07,gamestore:1.05,hotel:1.03}},
 {id:'wildfire',title:'Wildfires Disrupt Western Regions',detail:'Local transport disruption reduces tourism and logistics throughput.',effects:{logistics:.88,hotel:.90,restaurant:.96}},
 {id:'flood',title:'Flooding Disrupts Waterfront Markets',detail:'Flooding interrupts shipments and tourism.',effects:{logistics:.91,hotel:.94,factory:.95}},
 {id:'storm',title:'Severe Storms Disrupt Commerce',detail:'Severe weather delays transportation and local spending.',effects:{logistics:.93,hotel:.95,restaurant:.95}},
 {id:'drought',title:'Drought Raises Production Costs',detail:'Food and manufacturing supply costs rise.',effects:{coffee:.94,restaurant:.94,factory:.95}},
 {id:'revitalization',title:'New Commercial District Opens',detail:'New districts create demand for local shops and hospitality.',effects:{coffee:1.07,restaurant:1.06,hotel:1.05}},
 {id:'shipping',title:'Shipping Routes Disrupted',detail:'Transport delays raise costs for factories and distributors.',effects:{factory:.94,logistics:.89}},
 {id:'tech_boom',title:'Technology Sector Rallies',detail:'New technology projects increase software demand.',effects:{software:1.14}},
 {id:'travel_expansion',title:'Tourism Expansion',detail:'Additional travel bookings lift hospitality demand.',effects:{hotel:1.13,logistics:1.03}},
 {id:'regional_spending',title:'Neighborhood Shopping Boom',detail:'Local shops see a burst of consumer spending.',effects:{coffee:1.07,restaurant:1.05,gamestore:1.09}},
 {id:'factory_investment',title:'Industrial Investment Grows',detail:'New equipment purchases support manufacturing and transportation.',effects:{factory:1.09,logistics:1.05}}
]);
function worldEvent(at=Date.now(),worldId=WORLD_ID){
 const time=Number.isSafeInteger(at)&&at>=0?at:Date.now();
 const day=Math.floor(time/86400000);
 const regionOffset=worldId==='world-europe'?2:worldId==='world-asia'?4:0;
 // Six-day blocks rotate between four sets of events, so the current
 // week retains its existing event schedule while broader news cycles in.
 const block=Math.floor(day/6)%4;
 const event=WORLD_EVENTS[block*6+(day+regionOffset)%6];
 return {id:event.id,title:event.title,detail:event.detail,effects:event.effects,
  day:dayKey(time),endsAt:(day+1)*86400000};
}
// Same per-minute revenue/expense baselines as singleplayer app.js.
const BUSINESS_ECONOMICS=Object.freeze({
 coffee:{revenue:114,expense:48},restaurant:{revenue:416,expense:190},
 gamestore:{revenue:702,expense:420},hotel:{revenue:3422,expense:1900},
 dealership:{revenue:12687,expense:7900},factory:{revenue:67207,expense:41000},
 software:{revenue:196733,expense:170000},logistics:{revenue:1283757,expense:770000}
});
// Simulated regional city economy; real city names but gameplay-model inputs,
// not claims of up-to-date rents. Existing no-city sites keep the old baseline.
const CITY_CATALOG=Object.freeze([
 {id:'new-york',name:'New York',region:'world1',demand:1.14,rent:1.27,industries:{software:1.13,hotel:1.10}},
 {id:'los-angeles',name:'Los Angeles',region:'world1',demand:1.12,rent:1.18,industries:{hotel:1.13,gamestore:1.11}},
 {id:'chicago',name:'Chicago',region:'world1',demand:1.03,rent:1.02,industries:{logistics:1.13,factory:1.08}},
 {id:'houston',name:'Houston',region:'world1',demand:1.02,rent:.90,industries:{factory:1.12,dealership:1.08}},
 {id:'miami',name:'Miami',region:'world1',demand:1.06,rent:1.12,industries:{hotel:1.17,restaurant:1.09}},
 {id:'seattle',name:'Seattle',region:'world1',demand:1.09,rent:1.16,industries:{software:1.18,coffee:1.10}},
 {id:'london',name:'London',region:'world-europe',demand:1.13,rent:1.25,industries:{software:1.12,hotel:1.12}},
 {id:'paris',name:'Paris',region:'world-europe',demand:1.10,rent:1.20,industries:{hotel:1.19,restaurant:1.11}},
 {id:'berlin',name:'Berlin',region:'world-europe',demand:1.06,rent:1.03,industries:{software:1.14,factory:1.07}},
 {id:'amsterdam',name:'Amsterdam',region:'world-europe',demand:1.06,rent:1.14,industries:{logistics:1.17,hotel:1.07}},
 {id:'madrid',name:'Madrid',region:'world-europe',demand:1.02,rent:.92,industries:{hotel:1.12,restaurant:1.10}},
 {id:'warsaw',name:'Warsaw',region:'world-europe',demand:1.04,rent:.84,industries:{factory:1.15,logistics:1.08}},
 {id:'tokyo',name:'Tokyo',region:'world-asia',demand:1.16,rent:1.20,industries:{gamestore:1.17,software:1.12}},
 {id:'seoul',name:'Seoul',region:'world-asia',demand:1.12,rent:1.13,industries:{software:1.18,gamestore:1.13}},
 {id:'singapore',name:'Singapore',region:'world-asia',demand:1.14,rent:1.24,industries:{logistics:1.18,software:1.12}},
 {id:'shanghai',name:'Shanghai',region:'world-asia',demand:1.08,rent:1.08,industries:{factory:1.15,logistics:1.13}},
 {id:'mumbai',name:'Mumbai',region:'world-asia',demand:1.03,rent:.79,industries:{software:1.15,restaurant:1.11}},
 {id:'bangkok',name:'Bangkok',region:'world-asia',demand:1.06,rent:.85,industries:{hotel:1.17,restaurant:1.10}}
].map(c=>Object.freeze({...c,industries:Object.freeze(c.industries)})));
function cityFactor(cityId,sector,worldId='world1'){
 if(!cityId)return 1;
 const city=CITY_CATALOG.find(x=>x.id===cityId&&x.region===worldId);
 const economics=BUSINESS_ECONOMICS[sector];
 if(!city||!economics)return 1;
 const margin=economics.revenue-economics.expense;
 if(margin<=0)return 1;
 const local=economics.revenue*city.demand*(city.industries[sector]||1)-
  economics.expense*city.rent;
 return Math.max(.4,Math.min(1.5,local/margin));
}
const US_COUNTRY=COUNTRIES.find(c=>c.id==='us');
function countryMargin(countryId,sector,revenue,expense){
 const p=COUNTRIES.find(c=>c.id===countryId)||US_COUNTRY;
 const u=US_COUNTRY;
 const revenueFactor=(p.demand/u.demand)*(p.revenue/u.revenue)*
  ((p.industry?.[sector]||1)/(u.industry?.[sector]||1));
 const costFactor=(p.rent*.55+p.wage*.45)/(u.rent*.55+u.wage*.45);
 return Math.max(0,Math.round(revenue*revenueFactor-expense*costFactor));
}

// Mirrors the seven singleplayer corporation tiers and their baseline operating margins.
// Server price and prerequisites are authoritative; no browser balance is accepted.
const MAJOR_CORPORATIONS=Object.freeze([
 {id:'local',name:'Local Corporation',req:1000000,price:850000,rev:30000,expense:18000},
 {id:'regional',name:'Regional Corporation',req:10000000,price:8000000,rev:280000,expense:190000},
 {id:'national',name:'National Corporation',req:100000000,price:80000000,rev:2800000,expense:2000000},
 {id:'global',name:'Global Corporation',req:1000000000,price:800000000,rev:30000000,expense:22000000},
 {id:'conglomerate',name:'Conglomerate',req:10000000000,price:8000000000,rev:320000000,expense:250000000},
 {id:'mega',name:'Mega Corporation',req:100000000000,price:80000000000,rev:3500000000,expense:2900000000},
 {id:'empire',name:'Global Empire',req:1000000000000,price:850000000000,rev:40000000000,expense:35000000000}
]);
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_CASH;
const time=t=>Number.isSafeInteger(t)&&t>=0;
const dayKey=now=>new Date(now).toISOString().slice(0,10);
const weekKey=now=>{
 const date=new Date(now);
 const day=date.getUTCDay();
 const monday=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-(day+6)%7);
 return dayKey(monday);
};
const cleanName=value=>{
 const text=String(value||'').trim().replace(/\s+/g,' ').slice(0,24);
 if(!/^[\p{L}\p{N} ._'-]{2,24}$/u.test(text))return 'Tycoon';
 if(/\b(fuck|shit|bitch|cunt|nigger|faggot)\b/i.test(text))return 'Tycoon';
 return text;
};
const clone=p=>({...p,
 businesses:(p.businesses||[]).map(b=>({...b,
  sites:Array.isArray(b.sites)?b.sites.map(site=>({...site})):undefined})),
 enterprise:p.enterprise?{...p.enterprise,stocks:{...(p.enterprise.stocks||{})},
  properties:[...(p.enterprise.properties||[])],research:[...(p.enterprise.research||[])],
  majorCompanies:Array.isArray(p.enterprise.majorCompanies)?p.enterprise.majorCompanies.map(c=>({...c})):undefined,
  routes:Array.isArray(p.enterprise.routes)?p.enterprise.routes.map(r=>({...r})):undefined,
  route:p.enterprise.route?{...p.enterprise.route}:undefined,
  fiscal:p.enterprise.fiscal?{...p.enterprise.fiscal}:undefined,
  cityContract:p.enterprise.cityContract?{...p.enterprise.cityContract}:undefined,
  badgeCounters:p.enterprise.badgeCounters?Object.fromEntries(
   Object.entries(p.enterprise.badgeCounters).map(([id,counters])=>[id,{...counters}])):undefined,
  metrics:{...(p.enterprise.metrics||{})}}:undefined
});
const valueOf=business=>{
 const def=byId(business.type);
 if(!def||!Number.isSafeInteger(business.level)||business.level<1||business.level>30)return 0;
 return Math.round(def.cost*(1+(business.level-1)*.15));
};
// Four legacy tickers retain their baseline values. Four newer simulated
// public offerings unlock through earned net worth, not a client-supplied flag.
const SHARE_CATALOG=Object.freeze([
 {id:'nova',name:'NovaTech',ticker:'NVT',baseCents:4250,sector:'software',volatility:.035,ipoThreshold:0},
 {id:'harbor',name:'Harbor Foods',ticker:'HFD',baseCents:2480,sector:'restaurant',volatility:.025,ipoThreshold:0},
 {id:'atlas',name:'Atlas Energy',ticker:'ATE',baseCents:6720,sector:'factory',volatility:.03,ipoThreshold:0},
 {id:'skyline',name:'Skyline Motors',ticker:'SKM',baseCents:3140,sector:'dealership',volatility:.04,ipoThreshold:0},
 {id:'aerovent',name:'AeroVent Logistics',ticker:'AVL',baseCents:8400,sector:'logistics',volatility:.045,ipoThreshold:50000},
 {id:'verdant',name:'Verdant Power',ticker:'VRD',baseCents:13500,sector:'factory',volatility:.055,ipoThreshold:150000},
 {id:'pulse',name:'Pulse Hospitality',ticker:'PLS',baseCents:5600,sector:'hotel',volatility:.06,ipoThreshold:500000},
 {id:'quantum',name:'Quantum Cloud',ticker:'QCL',baseCents:22000,sector:'software',volatility:.075,ipoThreshold:2000000}
].map(s=>Object.freeze(s)));
const SHARE_BASE_CENTS=Object.freeze(Object.fromEntries(
 SHARE_CATALOG.map(s=>[s.id,s.baseCents])));
function stockPriceCents(id,at=Date.now()){
 const info=SHARE_CATALOG.find(s=>s.id===id);
 if(!info||!Number.isSafeInteger(at)||at<0)return 0;
 const period=Math.floor(at/900000);
 const seed=id.split('').reduce((acc,c)=>acc+c.charCodeAt(0),0);
 const legacy=((period*7+seed)%19-9)/100;
 // Quote movement is deterministic and region-news-sensitive. Quotes cannot
 // be forged through the browser, and repeated polling returns the same price.
 const wave=Math.sin((period+seed)*.137)*info.volatility;
 const news=(worldEvent(at).effects[info.sector]||1)-1;
 const multiplier=Math.max(.65,Math.min(1.35,1+legacy+wave+news*.25));
 return Math.max(100,Math.round(info.baseCents*multiplier));
}
function worth(p,at=Number.isSafeInteger(p.lastSettledAt)?p.lastSettledAt:Date.now()){
 let value=Number(p.cash||0);
 for(const b of p.businesses||[]){
  value+=valueOf(b);
  const def=byId(b.type);
  if(def&&Array.isArray(b.sites)){
   value+=Math.max(0,b.sites.length-1)*Math.round(def.cost*1.5);
   for(const site of b.sites)value+=Math.max(0,Number(site.level||1)-1)*Math.round(def.cost*.12);
  }
 }
 const e=p.enterprise;
 if(e){
  for(const id of Object.keys(SHARE_BASE_CENTS)){
   const count=Number(e.stocks?.[id]||0);
   if(Number.isSafeInteger(count)&&count>=0&&count<=1000000)
    value+=Math.floor(count*stockPriceCents(id,at)/100);
  }
  for(const price of e.properties||[])if(Number.isSafeInteger(price)&&price>0)value+=price;
  for(const holding of e.majorCompanies||[]){
   const corp=MAJOR_CORPORATIONS.find(x=>x.id===holding?.type);
   if(corp)value+=corp.price;
  }
  value+=Math.max(0,Number(e.warehouse||0))*10000;
  value+=Math.max(0,Number(e.trucks||0))*5000;
  value-=Math.max(0,Number(e.loanDebt||0));
  value-=Math.max(0,Number(e.fiscal?.taxDue||0));
 }
 return Math.max(0,Math.min(MAX_CASH,Math.round(value)));
}
function corporationPerSecond(type,p,at=Date.now()){
 const corp=MAJOR_CORPORATIONS.find(c=>c.id===type);
 if(!corp)return 0;
 const country=p.enterprise?.country||'us';
 const base=countryMargin(country,corp.id,corp.rev,corp.expense);
 // Preserve the original local-corporation rate for existing saves.
 if(type==='local')return Math.floor(base/60);
 const sectors={regional:'factory',national:'logistics',global:'software',
  conglomerate:'dealership',mega:'software',empire:'logistics'};
 const tier=MAJOR_CORPORATIONS.findIndex(c=>c.id===type);
 const risk=Math.min(.11,.02+tier*.011);
 const day=Math.floor(at/86400000);
 const cycle=Math.sin((day+tier*17)*.71)*risk;
 const sectorEffect=worldEvent(at,p.worldId||WORLD_ID).effects[sectors[type]]||1;
 const adjusted=base*(1+cycle+(sectorEffect-1)*.30);
 return Math.max(0,Math.floor(adjusted/60));
}
function perSecond(p,at=Number.isSafeInteger(p.lastSettledAt)?p.lastSettledAt:Date.now()){
 let income=0;
 const event=worldEvent(at,p.worldId||WORLD_ID);
 const e=p.enterprise;
 const profile=COUNTRIES.find(x=>x.id===e?.country)||US_COUNTRY;
 for(const business of p.businesses||[]){
  const def=byId(business.type);
  if(!def||!Number.isSafeInteger(business.level)||business.level<1||business.level>30)continue;
  const sites=Array.isArray(business.sites)?Math.max(1,business.sites.length):1;
  const workers=Math.max(0,Math.min(100,Number(business.workers||0)));
  const marketing=Math.max(0,Math.min(30,Number(business.marketing||0)));
  const efficiency=Math.max(0,Math.min(30,Number(business.efficiency||0)));
  const training=e?.research?.includes('workforce')?1.1:1;
  // Company-level upgrades and branch-level upgrades are independent.
  // Upgraded sites must actually raise passive revenue rather than only
  // changing their resale value. Preserve legacy single-site income.
  const siteCityFactor=Array.isArray(business.sites)?
   business.sites.reduce((sum,site)=>sum+cityFactor(site.cityId,def.id,p.worldId||WORLD_ID),0)/sites:1;
  const siteLevelBonus=Array.isArray(business.sites)?
   business.sites.reduce((sum,site)=>sum+
    Math.max(0,Math.min(29,Number(site.level||1)-1))*.22,0)/sites:0;
  const mult=Math.min(24,(1+(sites-1)*.65)*(1+siteLevelBonus)*siteCityFactor*
   (1+workers*.018)*training*(business.manager?1.18:1)*
   (1+marketing*.015)*(1+efficiency*.014));
  const economics=BUSINESS_ECONOMICS[def.id];
  const margin=economics?countryMargin(profile.id,def.id,economics.revenue,economics.expense):def.baseProfit;
  const base=Math.floor(margin*(1+(business.level-1)*.22)/60);
  const enhanced=workers>0||sites>1||siteCityFactor!==1||siteLevelBonus>0||business.manager||marketing>0||efficiency>0||
   training!==1||profile.id!=='us';
  const rawIncome=enhanced?Math.max(0,Math.ceil(base*mult-workers*.005)):base;
  const effect=event.effects[def.id]||1;
  income+=effect===1?rawIncome:Math.max(0,Math.round(rawIncome*effect));
 }
 for(const price of e?.properties||[])if(Number.isFinite(price))income+=Math.floor(price/180000);
 for(const holding of e?.majorCompanies||[]){
  income+=corporationPerSecond(holding?.type,p,at);
 }
 const prestige=Number.isSafeInteger(e?.prestigeRank)&&e.prestigeRank>0?
  Math.min(3,Math.log2(e.prestigeRank+1)*.18):0;
 return Math.max(0,Math.min(250_000_000,(prestige>0?Math.ceil(income*(1+prestige)):income)));
}
const FISCAL_YEAR_MS=365*86400000;
function ensureFiscal(p){
 const e=p.enterprise;
 if(!e)return null;
 if(!e.fiscal||!Number.isSafeInteger(e.fiscal.nextTaxAt)){
  const start=Math.max(0,Number(p.createdAtSeconds)||Math.floor(Date.now()/1000))*1000;
  e.fiscal={year:1,nextTaxAt:start+FISCAL_YEAR_MS,
   taxableProfit:0,taxDue:0,lastBill:0,totalTaxPaid:0};
 }
 return e.fiscal;
}
function recordOperatingProfit(p,change){
 if(!Number.isSafeInteger(change)||!change)return;
 const f=ensureFiscal(p);
 if(!f)return;
 f.taxableProfit=Math.max(-MAX_CASH,Math.min(MAX_CASH,(Number(f.taxableProfit)||0)+change));
}
function closeFiscalYear(p,at){
 const f=ensureFiscal(p);
 if(!f)return;
 let cycles=0;
 while(f.nextTaxAt<=at&&cycles++<200){
  const rate=COUNTRIES.find(c=>c.id===p.enterprise.country)?.taxRate??US_COUNTRY.taxRate;
  const bill=Math.max(0,Math.min(MAX_CASH,Math.floor(Math.max(0,f.taxableProfit||0)*rate)));
  const before=worth(p,at);
  f.taxDue=Math.min(MAX_CASH,(Number(f.taxDue)||0)+bill);
  const delta=worth(p,at)-before;
  p.dayGain+=delta;p.weekGain+=delta;
  f.lastBill=bill;
  f.taxableProfit=0;
  f.year++;
  f.nextTaxAt+=FISCAL_YEAR_MS;
 }
}
function addBadgeCounter(p,sector,metric,value){
 if(!p.enterprise||!byId(sector)||!Number.isFinite(value)||value<=0)return;
 if(!p.enterprise.badgeCounters)p.enterprise.badgeCounters={};
 const counters=p.enterprise.badgeCounters[sector]||{};
 counters[metric]=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Number(counters[metric]||0))+value);
 p.enterprise.badgeCounters[sector]=counters;
}
function fresh(uid,displayName,now){
 if(!uid||!time(now))throw Error('invalid_new_player');
 return {uid,worldId:WORLD_ID,displayName:cleanName(displayName),cash:START_CASH,
  businesses:[],pvpEnabled:false,clanId:null,
  createdAtSeconds:Math.floor(now/1000),lastSettledAt:now,
  dayKey:dayKey(now),weekKey:weekKey(now),dayGain:0,weekGain:0,
  nextAttackAt:0,protectedUntil:0,nextVulnerableAt:0,
  activePenalty:0,activePenaltyUntil:0,lastPvPSwitchAt:0,
  chatLastAt:0,incomeMilliRemainder:0,incomeSubMilliRemainder:0};
}
function periodRoll(p,at){
 const nextDay=dayKey(at),nextWeek=weekKey(at);
 if(p.dayKey!==nextDay){p.dayKey=nextDay;p.dayGain=0}
 if(p.weekKey!==nextWeek){p.weekKey=nextWeek;p.weekGain=0}
}
function repayOperatingIncome(p,earned,at){
 const e=p.enterprise;
 if(!e||!Number.isSafeInteger(e.loanDebt)||e.loanDebt<=0||earned<=0)return 0;
 const overdue=Number.isSafeInteger(e.loanDueAt)&&e.loanDueAt>0&&at>=e.loanDueAt;
 if(!overdue&&e.repaymentAuto!==true)return 0;
 const payment=Math.min(e.loanDebt,p.cash,
  Math.floor(earned*(overdue?.4:.15)));
 if(payment<=0)return 0;
 const before=worth(p,at);
 p.cash-=payment;
 e.loanDebt-=payment;
 if(e.loanDebt===0){e.loanPrincipal=0;e.loanDueAt=0;e.repaymentAuto=false}
 const change=worth(p,at)-before;
 p.dayGain+=change;p.weekGain+=change;
 return payment;
}
function credit(p,amount){
 const before=worth(p);
 const add=Math.max(0,Math.min(MAX_CASH-p.cash,Math.floor(amount)));
 p.cash+=add;
 const gain=worth(p)-before;
 p.dayGain+=gain;p.weekGain+=gain;
 return gain;
}
function debit(p,amount){
 if(!number(amount)||p.cash<amount)return false;
 const before=worth(p);
 p.cash-=amount;
 const change=worth(p)-before;
 p.dayGain+=change;p.weekGain+=change;
 return true;
}
function settle(player,now){
 if(!player||!time(now)||!number(player.cash))throw Error('invalid_player_state');
 const p=clone(player),start=Math.min(now,Math.max(0,Number(p.lastSettledAt)||now));
 const from=Math.max(start,now-MAX_OFFLINE_SECONDS*1000);
 ensureFiscal(p);
 closeFiscalYear(p,from);
 // UTC boundaries are split before reward allocation.
 let cursor=from;
 // Preserve sub-dollar earnings between polls. Polling every 500ms must not
 // erase income, especially when PvP multipliers reduce earnings below $1/s.
 let milliRemainder=Number.isSafeInteger(p.incomeMilliRemainder)&&p.incomeMilliRemainder>=0&&p.incomeMilliRemainder<1000
  ?p.incomeMilliRemainder:0;
 // Keep hundredths of a millidollar too. Repeated 1ms polls must not erase
 // 12%, 20% or 30% PvP-discounted earnings.
 let passiveEarned=0;
 let subMilliRemainder=Number.isSafeInteger(p.incomeSubMilliRemainder)&&p.incomeSubMilliRemainder>=0&&p.incomeSubMilliRemainder<100
  ?p.incomeSubMilliRemainder:0;
 while(cursor<now){
  periodRoll(p,cursor);
  const d=new Date(cursor),midnight=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1);
  const nextMonday=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+((8-d.getUTCDay())%7||7));
  const penaltyBoundary=Number(p.activePenaltyUntil||0)*1000;
  const loanBoundary=Number(p.enterprise?.loanDueAt||0);
  const nextQuote=(Math.floor(cursor/900000)+1)*900000;
  const due=p.enterprise?.fiscal?.nextTaxAt;
  const next=Math.min(now,midnight,nextMonday,nextQuote,
   due>cursor?due:Infinity,penaltyBoundary>cursor?penaltyBoundary:Infinity,
   loanBoundary>cursor?loanBoundary:Infinity);
  const durationMs=Math.max(0,next-cursor);
  if(durationMs>0){
   const rate=perSecond(p,cursor);
   const penalty=Number(p.activePenaltyUntil||0)*1000>cursor
    ?Math.max(0,Math.min(30,Math.round(Number(p.activePenalty||0)*100))):0;
   // Thousandths of a dollar avoid round-down losses on repeated settlements.
   // Avoid multiplying a six-hour accrual by a percentage before division:
   // that intermediate can exceed Number.MAX_SAFE_INTEGER for large empires.
   const grossMilli=durationMs*rate;
   const quotient=Math.floor(grossMilli/100),remainder=grossMilli%100;
   const subMilliEarned=subMilliRemainder+remainder*(100-penalty);
   const milliEarned=quotient*(100-penalty)+Math.floor(subMilliEarned/100);
   subMilliRemainder=subMilliEarned%100;
   const totalMilli=milliRemainder+milliEarned;
   const earned=Math.floor(totalMilli/1000);
   milliRemainder=totalMilli%1000;
   if(earned>0){
    const actual=credit(p,earned);
    passiveEarned+=actual;recordOperatingProfit(p,actual);
    repayOperatingIncome(p,actual,next);
   }
  }
  // Earnings before UTC boundaries belong to the old period; a quote change
  // exactly at midnight belongs to the new day (and Monday's new week).
  if(next===midnight||next===nextMonday)periodRoll(p,next);
  closeFiscalYear(p,next);
  // Mark-to-market P&L belongs to server-owned holdings and is credited once.
  const quoteChange=worth(p,next)-worth(p,cursor);
  if(quoteChange){p.dayGain+=quoteChange;p.weekGain+=quoteChange;}
  cursor=next;
 }
 if(passiveEarned>0&&p.enterprise){
  const weights=new Map();
  for(const b of p.businesses||[]){const def=byId(b.type);
   if(def)weights.set(b.type,(weights.get(b.type)||0)+def.baseProfit*(1+(b.level-1)*.22));}
  const total=[...weights.values()].reduce((sum,n)=>sum+n,0);
  if(total>0)for(const [sector,weight] of weights)addBadgeCounter(p,sector,'earnings',passiveEarned*weight/total);
 }
 // Each branch sells a bounded amount of already-purchased inventory per minute.
 // This part is also deterministic across refreshes and reconnects.
 const e=p.enterprise;
 if(e&&(e.route||(Array.isArray(e.routes)&&e.routes.length)||p.businesses?.some(b=>Array.isArray(b.sites)&&b.sites.some(s=>Number(s.stock)>0||s.autoRestock)))){
  const prior=Number(e.lastInventoryAt);
  const last=Number.isFinite(prior)&&prior>=0&&prior<=now?prior:now;
  const minutes=Math.min(360,Math.floor((now-last)/60000));
  e.lastInventoryAt=last+minutes*60000;
  if(minutes>0){
   for(const b of p.businesses){
    const catalog=byId(b.type);
    if(!catalog||!Array.isArray(b.sites))continue;
    for(const site of b.sites){
     const unitCost=Math.max(1,Math.ceil(catalog.cost*.0005));
     const units=Math.min(Math.max(0,Number(site.stock||0)),minutes*Math.max(1,Math.min(5,Number(site.level||1))));
     if(units>0){
      site.stock-=units;
      const priceFactor=Math.max(.5,Math.min(2,Number(site.price||100)/100));
      const revenue=units*Math.max(2,Math.round(unitCost*1.5*priceFactor));
      const actual=credit(p,Math.min(MAX_CASH,revenue));
      addBadgeCounter(p,b.type,'sales',units);
      addBadgeCounter(p,b.type,'earnings',actual);
      recordOperatingProfit(p,actual);
      repayOperatingIncome(p,actual,now);
     }
     if(site.autoRestock&&e.research?.includes('automation')&&site.stock<20){
      const quantity=Math.min(100,5000-site.stock);
      const amount=unitCost*quantity;
      if(Number.isSafeInteger(amount)&&debit(p,amount)){
       site.stock+=quantity;
       recordOperatingProfit(p,-amount);
       if(e.metrics)e.metrics.supplyOrders=(Number(e.metrics.supplyOrders)||0)+quantity;
      }
     }
    }
   }
   // Legacy single routes remain valid; new players can operate one route per truck.
   const routes=Array.isArray(e.routes)?e.routes:(e.route?[e.route]:[]);
   if(e.trucks>0&&e.research?.includes('logistics')){
    for(const route of routes.slice(0,Math.min(100,e.trucks))){
     if(!route||!Number.isSafeInteger(route.index)||route.index<0||
      !Number.isSafeInteger(route.site)||route.site<0||
      !Number.isSafeInteger(route.quantity)||route.quantity<1||route.quantity>100)continue;
     const target=p.businesses?.[route.index]?.sites?.[route.site];
     if(!target)continue;
     const stock=Math.max(0,Number(e.warehouseStock||0));
     const room=Math.max(0,5000-Number(target.stock||0));
     const deliver=Math.min(stock,Math.min(minutes,30)*route.quantity,room);
     if(Number.isSafeInteger(deliver)&&deliver>0){target.stock+=deliver;e.warehouseStock-=deliver}
    }
   }
  }
 }
 if(e){
  const cycleAt=Number.isFinite(Number(e.lastBadgeCycleAt))?Number(e.lastBadgeCycleAt):
   Math.max(0,Number(p.createdAtSeconds||0)*1000);
  const cycles=Math.min(360,Math.max(0,Math.floor((now-cycleAt)/60000)));
  if(cycles>0){
   for(const sector of new Set((p.businesses||[]).map(b=>b.type)))addBadgeCounter(p,sector,'cycles',cycles);
   e.lastBadgeCycleAt=cycleAt+cycles*60000;
  }
 }
 periodRoll(p,now);
 closeFiscalYear(p,now);
 p.lastSettledAt=now;
 p.incomeMilliRemainder=milliRemainder;
 p.incomeSubMilliRemainder=subMilliRemainder;
 p.netWorth=worth(p);
 return p;
}
function buyBusiness(player,businessId,now){
 const p=settle(player,now),def=byId(businessId);
 if(!def)return {ok:false,error:'unknown_business'};
 if(p.businesses.length>=MAX_BUSINESSES)return {ok:false,error:'business_limit'};
 if(!debit(p,def.cost))return {ok:false,error:'insufficient_cash'};
 const before=worth(p);
 p.businesses.push({type:def.id,level:1});
 p.netWorth=worth(p);
 const delta=p.netWorth-before;
 p.dayGain+=delta;p.weekGain+=delta;
 return {ok:true,player:p,cost:def.cost};
}
function upgradeBusiness(player,index,now){
 const p=settle(player,now);
 if(!Number.isInteger(index)||index<0||index>=p.businesses.length)return {ok:false,error:'unknown_business'};
 const business=p.businesses[index],def=byId(business.type);
 if(!def||business.level>=30)return {ok:false,error:'max_upgrade'};
 const cost=Math.ceil(def.cost*(1+business.level*.75));
 if(!debit(p,cost))return {ok:false,error:'insufficient_cash'};
 const before=worth(p);
 business.level++;
 p.netWorth=worth(p);
 const delta=p.netWorth-before;
 p.dayGain+=delta;p.weekGain+=delta;
 return {ok:true,player:p,cost};
}
function score(player,period,now){
 const p=settle(player,now);
 return period==='day'?p.dayGain:period==='week'?p.weekGain:p.netWorth;
}
module.exports={WORLD_ID,MAX_PLAYERS,MAX_BUSINESSES,MAX_CASH,MAX_OFFLINE_SECONDS,START_CASH,BUSINESS_TYPES,MAJOR_CORPORATIONS,COUNTRIES,BUSINESS_ECONOMICS,countryMargin,
 ensureFiscal,recordOperatingProfit,closeFiscalYear,
 byId,dayKey,weekKey,cleanName,valueOf,worldEvent,CITY_CATALOG,cityFactor,SHARE_CATALOG,stockPriceCents,corporationPerSecond,worth,perSecond,fresh,settle,buyBusiness,upgradeBusiness,score,credit,debit};

export default module.exports;
