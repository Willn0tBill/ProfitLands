import test from 'node:test';
import assert from 'node:assert/strict';
import {secureMarketPlan,secureQuote,PERIOD_MS} from '../cloudflare/src/world-secure-market.mjs';
import core from '../cloudflare/src/world-core.mjs';
import enterprise from '../cloudflare/src/world-enterprise.mjs';

const secret=Buffer.alloc(32,0x5a).toString('base64');
const other=Buffer.alloc(32,0x6b).toString('base64');
const at=Date.UTC(2026,10,7,0,15);
async function quotesFor(secretValue,region){
 const plan=await secureMarketPlan(secretValue,region,at);
 const snapshot=new Map();
 for(const period of plan.keys()){
  const timestamp=period*PERIOD_MS,prices={};
  for(const asset of core.SHARE_CATALOG){
   const effect=core.worldEvent(timestamp,region).effects[asset.sector]||1;
   prices[asset.id]=secureQuote(plan,asset.id,timestamp,core.SHARE_CATALOG,effect-1);
  }
  snapshot.set(period,prices);
 }
 return snapshot;
}
test('market key is required to be a private 32-byte secret',async()=>{
 await assert.rejects(secureMarketPlan('abc','world1',at),/world_market_secret_malformed/);
 await assert.rejects(secureMarketPlan(secret,'not-a-world',at),/world_market_invalid_context/);
});
test('HMAC quotes match across isolates, differ across regions/secrets and are bounded',async()=>{
 const [first,again,differentWorld,differentSecret]=await Promise.all([
  quotesFor(secret,'world1'),quotesFor(secret,'world1'),
  quotesFor(secret,'world-asia'),quotesFor(other,'world1')
 ]);
 assert.deepEqual([...first],[...again]);
 const tick=Math.floor(at/PERIOD_MS);
 assert.notDeepEqual(first.get(tick),differentWorld.get(tick));
 assert.notDeepEqual(first.get(tick),differentSecret.get(tick));
 assert.notDeepEqual(first.get(tick),first.get(tick-1));
 for(const asset of core.SHARE_CATALOG){
  const price=first.get(tick)[asset.id];
  assert.ok(price>=Math.round(asset.baseCents*.65)&&price<=Math.round(asset.baseCents*1.35));
 }
});
test('private quote context stays off serialized player and survives the economy clone',async()=>{
 const quotes=await quotesFor(secret,'world1');
 const p=core.fresh('test-user','Player',at);
 p.cash=1500;
 core.setMarketContext(p,{quotes});
 const cents=quotes.get(Math.floor(at/PERIOD_MS)).harbor;
 assert.equal(core.priceForPlayer(p,'harbor',at),cents);
 assert.equal(JSON.stringify(p).includes('quotes'),false);
 const action=enterprise.apply(p,'buyShares',{stockId:'harbor',quantity:1},at);
 assert.equal(action.ok,true);
 assert.equal(action.cost,Math.ceil(cents/100));
 assert.equal(core.priceForPlayer(action.player,'harbor',at),cents);
 assert.equal(action.player.enterprise.stocks.harbor,1);
 assert.equal(JSON.stringify(action.player).includes('quotes'),false);
 assert.equal(enterprise.summary(action.player,at).quotes.find(x=>x.id==='harbor').priceCents,cents);
});
