/* Built from functions/world-core.js; keep rules and costs synchronized with the original. */
import COUNTRIES from './country-catalog.mjs';
const module={exports:{}};
'use strict';
// Deterministic server-only alpha economy. The browser never supplies earnings, cash or worth.
const WORLD_ID='world1';
const MAX_PLAYERS=64;
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
// Same per-minute revenue/expense baselines as singleplayer app.js.
const BUSINESS_ECONOMICS=Object.freeze({
 coffee:{revenue:114,expense:48},restaurant:{revenue:416,expense:190},
 gamestore:{revenue:702,expense:420},hotel:{revenue:3422,expense:1900},
 dealership:{revenue:12687,expense:7900},factory:{revenue:67207,expense:41000},
 software:{revenue:196733,expense:170000},logistics:{revenue:1283757,expense:770000}
});
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
 {id:'conglomerate',name:'Conglomerate',req:10000000000,price:8000000000,rev:32000000,expense:25000000},
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
  badgeCounters:p.enterprise.badgeCounters?Object.fromEntries(
   Object.entries(p.enterprise.badgeCounters).map(([id,counters])=>[id,{...counters}])):undefined,
  metrics:{...(p.enterprise.metrics||{})}}:undefined
});
const valueOf=business=>{
 const def=byId(business.type);
 if(!def||!Number.isSafeInteger(business.level)||business.level<1||business.level>30)return 0;
 return Math.round(def.cost*(1+(business.level-1)*.15));
};
const SHARE_BASE_CENTS=Object.freeze({nova:4250,harbor:2480,atlas:6720,skyline:3140});
function stockPriceCents(id,at=Date.now()){
 const base=SHARE_BASE_CENTS[id];
 if(!base||!Number.isSafeInteger(at)||at<0)return 0;
 const period=Math.floor(at/900000);
 const seed=id.split('').reduce((acc,c)=>acc+c.charCodeAt(0),0);
 return Math.max(100,Math.round(base*(100+((period*7+seed)%19)-9)/100));
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
 }
 return Math.max(0,Math.min(MAX_CASH,Math.round(value)));
}
function perSecond(p){
 let income=0;
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
  const mult=Math.min(12,(1+(sites-1)*.65)*(1+workers*.018)*training*
   (business.manager?1.18:1)*(1+marketing*.015)*(1+efficiency*.014));
  const economics=BUSINESS_ECONOMICS[def.id];
  const margin=economics?countryMargin(profile.id,def.id,economics.revenue,economics.expense):def.baseProfit;
  const base=Math.floor(margin*(1+(business.level-1)*.22)/60);
  const enhanced=workers>0||sites>1||business.manager||marketing>0||efficiency>0||
   training!==1||profile.id!=='us';
  income+=enhanced?Math.max(0,Math.ceil(base*mult-workers*.005)):base;
 }
 for(const price of e?.properties||[])if(Number.isFinite(price))income+=Math.floor(price/180000);
 for(const holding of e?.majorCompanies||[]){
  const corp=MAJOR_CORPORATIONS.find(x=>x.id===holding?.type);
  if(corp)income+=Math.floor(countryMargin(profile.id,corp.id,corp.rev,corp.expense)/60);
 }
 return Math.max(0,Math.min(250_000_000,income));
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
  const nextQuote=(Math.floor(cursor/900000)+1)*900000;
  const next=Math.min(now,midnight,nextMonday,nextQuote,penaltyBoundary>cursor?penaltyBoundary:Infinity);
  const durationMs=Math.max(0,next-cursor);
  if(durationMs>0){
   const rate=perSecond(p);
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
   if(earned>0)passiveEarned+=credit(p,earned);
  }
  // Earnings before UTC boundaries belong to the old period; a quote change
  // exactly at midnight belongs to the new day (and Monday's new week).
  if(next===midnight||next===nextMonday)periodRoll(p,next);
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
     }
     if(site.autoRestock&&e.research?.includes('automation')&&site.stock<20){
      const quantity=Math.min(100,5000-site.stock);
      const amount=unitCost*quantity;
      if(Number.isSafeInteger(amount)&&debit(p,amount)){
       site.stock+=quantity;
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
 p.lastSettledAt=now;
 p.incomeMilliRemainder=milliRemainder;
 p.incomeSubMilliRemainder=subMilliRemainder;
 p.netWorth=worth(p);
 return p;
}
function buyBusiness(player,businessId,now){
 const p=settle(player,now),def=byId(businessId);
 if(!def)return {ok:false,error:'unknown_business'};
 if(p.businesses.length>=40)return {ok:false,error:'business_limit'};
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
module.exports={WORLD_ID,MAX_PLAYERS,MAX_CASH,MAX_OFFLINE_SECONDS,START_CASH,BUSINESS_TYPES,MAJOR_CORPORATIONS,COUNTRIES,BUSINESS_ECONOMICS,countryMargin,
 byId,dayKey,weekKey,cleanName,valueOf,stockPriceCents,worth,perSecond,fresh,settle,buyBusiness,upgradeBusiness,score,credit,debit};

export default module.exports;
