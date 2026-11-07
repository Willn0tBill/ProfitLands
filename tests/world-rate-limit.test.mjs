import test from 'node:test';
import assert from 'node:assert/strict';
import {allow,checkIp,checkUid,resetForTests} from '../cloudflare/src/world-rate-limit.mjs';
import worldApi from '../cloudflare/src/index.mjs';
const at=1_700_000_000_000;
test('fixed-window per-IP shield rate limits bursts and resets after one minute',()=>{
 resetForTests();
 const req=new Request('https://example.test/api',{headers:{'CF-Connecting-IP':'203.0.113.99'}});
 for(let i=0;i<180;i++)assert.equal(checkIp(req,'me',at).ok,true);
 const blocked=checkIp(req,'me',at);
 assert.equal(blocked.ok,false);
 assert.equal(blocked.retryAfter,60);
 assert.equal(checkIp(req,'me',at+60000).ok,true);
 const other=new Request('https://example.test/api',{headers:{'CF-Connecting-IP':'203.0.113.100'}});
 assert.equal(checkIp(other,'me',at).ok,true);
});
test('individual authenticated users have separate read and write budgets',()=>{
 resetForTests();
 for(let i=0;i<100;i++)assert.equal(checkUid('first','me',at).ok,true);
 assert.equal(checkUid('first','me',at).ok,false);
 assert.equal(checkUid('second','me',at).ok,true);
 for(let i=0;i<40;i++)assert.equal(checkUid('first','buyBusiness',at).ok,true);
 assert.equal(checkUid('first','buyBusiness',at).ok,false);
 assert.equal(checkUid('first','me',at+60000).ok,true);
});
test('health endpoint returns retry-after on IP flood without consuming D1 queries',async()=>{
 resetForTests();
 const db={calls:0,prepare(){this.calls++;return {bind(){return this},first:async()=>({version:0})}}};
 const env={DB:db,WORLD_STORAGE_V2:'enabled'};
 const base='https://profitlands-world1.winotbill.workers.dev/health';
 for(let i=0;i<60;i++){
  const req=new Request(base,{headers:{'CF-Connecting-IP':'198.51.100.22'}});
  const res=await worldApi.fetch(req,env);
  assert.equal(res.status,200);
 }
 const calls=db.calls;
 const res=await worldApi.fetch(new Request(base,{
  headers:{'CF-Connecting-IP':'198.51.100.22'}}),env);
 assert.equal(res.status,429);
 assert.equal(res.headers.get('Retry-After'),'60');
 assert.equal((await res.json()).error.code,'resource-exhausted');
 assert.equal(db.calls,calls,'rejected request cannot read or write D1');
 const unknown=await worldApi.fetch(new Request(base),env);
 assert.equal(unknown.status,200,'tests and trusted internal requests without CF IP remain available');
});
test('limiter has bounded memory and refuses runaway keys without growing unbounded',()=>{
 resetForTests();
 for(let i=0;i<5000;i++)assert.equal(allow('key'+i,3,at).ok,true);
 assert.equal(allow('key4999',3,at).ok,true);
});
