import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClientPayload} from '../cloudflare/src/world-anticheat.mjs';

test('legitimate world and enterprise requests pass request-shape guard',()=>{
 assert.equal(validateClientPayload({action:'enterpriseAction',worldId:'world1',
  requestId:'0123456789abcdef0123456789abcdef',operation:'buyShares',
  stockId:'harbor',quantity:2}),true);
 assert.equal(validateClientPayload({action:'sendChat',text:'Hello world'}),true);
 assert.equal(validateClientPayload({action:'health'}),true);
});
test('forged client economic state and prototype pollution keys are refused',()=>{
 for(const key of ['cash','balance','wallet','netWorth','player','players',
  'incomePerSecond','lastSettledAt','receipts','state','dayGain','weekGain',
  'lastActivityAt','lastGameplayAt','parkedAt','activity','afk']){
  assert.equal(validateClientPayload({action:'me',[key]:123}),false,key);
 }
 assert.equal(validateClientPayload(JSON.parse('{"action":"me","__proto__":{"admin":true}}')),false);
 assert.equal(validateClientPayload({action:'me',details:{constructor:{prototype:{admin:true}}}}),false);
});
test('pathological nested and oversized request shapes are refused',()=>{
 assert.equal(validateClientPayload(null),false);
 assert.equal(validateClientPayload([]),false);
 assert.equal(validateClientPayload({action:'me',details:{a:{b:{c:{d:{e:{f:1}}}}}}}),false);
 assert.equal(validateClientPayload({action:'me',items:Array(33).fill(1)}),false);
 assert.equal(validateClientPayload({action:'me',text:'x'.repeat(4097)}),false);
 assert.equal(validateClientPayload({action:'me',value:Infinity}),false);
});
