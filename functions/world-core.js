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
const clone=p=>({...p,businesses:(p.businesses||[]).map(b=>({...b}))});
const valueOf=business=>{
 const def=byId(business.type);
 if(!def||!Number.isSafeInteger(business.level)||business.level<1||business.level>30)return 0;
 return Math.round(def.cost*(1+(business.level-1)*.15));
};
function worth(p){
 return Math.min(MAX_CASH,Number(p.cash||0)+(p.businesses||[]).reduce((total,b)=>total+valueOf(b),0));
}
function perSecond(p){
 let income=0;
 for(const business of p.businesses||[]){
  const def=byId(business.type);
  if(!def||!Number.isSafeInteger(business.level)||business.level<1||business.level>30)continue;
  income+=Math.floor(def.baseProfit*(1+(business.level-1)*.22)/60);
 }
 return Math.max(0,Math.min(50_000_000,income));
}
function fresh(uid,displayName,now){
 if(!uid||!time(now))throw Error('invalid_new_player');
 return {uid,worldId:WORLD_ID,displayName:cleanName(displayName),cash:START_CASH,
  businesses:[],pvpEnabled:false,clanId:null,
  createdAtSeconds:Math.floor(now/1000),lastSettledAt:now,
  dayKey:dayKey(now),weekKey:weekKey(now),dayGain:0,weekGain:0,
  nextAttackAt:0,protectedUntil:0,nextVulnerableAt:0,
  activePenalty:0,activePenaltyUntil:0,lastPvPSwitchAt:0,
  chatLastAt:0};
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
 let cursor=from,secondsAccounted=0;
 while(cursor<now){
  periodRoll(p,cursor);
  const d=new Date(cursor),midnight=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1);
  const nextMonday=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+((8-d.getUTCDay())%7||7));
  const penaltyBoundary=Number(p.activePenaltyUntil||0)*1000;
  const next=Math.min(now,midnight,nextMonday,penaltyBoundary>cursor?penaltyBoundary:Infinity);
  const seconds=Math.max(0,Math.floor((next-cursor)/1000));
  if(seconds>0){
   const rate=perSecond(p);
   const penalty=Number(p.activePenaltyUntil||0)*1000>cursor?Math.max(0,Math.min(.30,Number(p.activePenalty)||0)):0;
   credit(p,Math.floor(rate*(1-penalty)*seconds));
   secondsAccounted+=seconds;
  }
  cursor=next;
 }
 periodRoll(p,now);
 p.lastSettledAt=now;
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
module.exports={WORLD_ID,MAX_PLAYERS,MAX_CASH,MAX_OFFLINE_SECONDS,START_CASH,BUSINESS_TYPES,
 byId,dayKey,weekKey,cleanName,worth,perSecond,fresh,settle,buyBusiness,upgradeBusiness,score,credit,debit};
