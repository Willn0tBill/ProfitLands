/* Confidential, cross-isolate-consistent market quotes.
 * A Cloudflare secret is HMAC'ed with each region/tick, not sent to clients.
 * All Worker isolates derive identical historical/current prices for the same
 * region and secret; no writes or extra D1 queries are needed for quotes.
 */
const PERIOD_MS=15*60*1000;
const LOOKBACK_MS=6*60*60*1000;
const ASSETS=8;
function keyBytes(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9+/_=-]{43,128}$/.test(value))
  throw Error('world_market_secret_malformed');
 let binary;
 try{binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'))}
 catch{throw Error('world_market_secret_malformed')}
 if(binary.length<32||binary.length>64)throw Error('world_market_secret_malformed');
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
const CACHE_LIMIT=6;
const plans=new Map();
let activeSecret=null;
async function secureMarketPlan(secret,worldId,at=Date.now()){
 if(!Number.isSafeInteger(at)||at<0||typeof worldId!=='string'||!/^world(?:1|-europe|-asia)$/.test(worldId))
  throw Error('world_market_invalid_context');
 const first=Math.floor(Math.max(0,at-LOOKBACK_MS)/PERIOD_MS);
 const last=Math.floor(at/PERIOD_MS);
 if(activeSecret!==secret){keyBytes(secret);plans.clear();activeSecret=secret}
 const key=worldId+':'+first+':'+last;
 if(plans.has(key))return plans.get(key);
 // Cache the Promise so concurrent requests share the same HMAC work.
 // This avoids 25 HMAC operations on every authenticated player poll.
 const computation=(async()=>{
  const imported=await crypto.subtle.importKey('raw',keyBytes(secret),
   {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const entries=await Promise.all(Array.from({length:last-first+1},async(_,index)=>{
   const period=first+index;
   const signature=new Uint8Array(await crypto.subtle.sign('HMAC',imported,
    new TextEncoder().encode('ProfitLands:quotes:v1:'+worldId+':'+period)));
   const draws=Array.from({length:ASSETS},(_,i)=>
    ((signature[i*4]*16777216+signature[i*4+1]*65536+
      signature[i*4+2]*256+signature[i*4+3])/4294967296)*2-1);
   return [period,draws];
  }));
  return new Map(entries);
 })();
 plans.set(key,computation);
 if(plans.size>CACHE_LIMIT)plans.delete(plans.keys().next().value);
 try{return await computation}catch(e){plans.delete(key);throw e}
}
function secureQuote(plan,id,at,catalog,news=0){
 const entry=catalog.findIndex(x=>x.id===id);
 if(entry<0||entry>=ASSETS||!Number.isSafeInteger(at)||at<0)return 0;
 const draws=plan?.get(Math.floor(at/PERIOD_MS));
 if(!draws)return null;
 const asset=catalog[entry];
 const multiplier=Math.max(.65,Math.min(1.35,
  1+draws[entry]*asset.volatility*1.35+news*.2));
 return Math.max(100,Math.round(asset.baseCents*multiplier));
}
export {secureMarketPlan,secureQuote,PERIOD_MS};
