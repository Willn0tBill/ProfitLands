import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {checkDistributed,isSensitive} from '../cloudflare/src/world-security-rate.mjs';
function mock(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE world_abuse_limits(account_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL CHECK(window_start>=0),
  hits INTEGER NOT NULL CHECK(hits>=1 AND hits<=12))`);
 return {db,prepare(sql){return {bind(...args){return {
  async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}}
 }}}}};
}
test('only sensitive actions consume the shared security budget',()=>{
 assert.equal(isSensitive({action:'me'}),false);
 assert.equal(isSensitive({action:'getChat'}),false);
 assert.equal(isSensitive({action:'enterpriseAction',operation:'hireStaff'}),false);
 assert.equal(isSensitive({action:'enterpriseAction',operation:'buyShares'}),true);
 assert.equal(isSensitive({action:'requestAttack'}),true);
});
test('distributed limiter atomically blocks the thirteenth action and resets next minute',async()=>{
 const m=mock(),payload={action:'enterpriseAction',operation:'buyShares'};
 for(let i=0;i<12;i++) assert.equal((await checkDistributed(m,'u1','world1',payload,120000+i)).ok,true);
 const blocked=await checkDistributed(m,'u1','world1',{action:'requestAttack'},120013);
 assert.equal(blocked.ok,false);assert.equal(blocked.retryAfter,60);
 assert.equal(m.db.prepare('SELECT hits FROM world_abuse_limits WHERE account_key=?').get('world1:u1').hits,12);
 assert.equal((await checkDistributed(m,'u1','world1',payload,180000)).ok,true);
 assert.equal(m.db.prepare('SELECT hits FROM world_abuse_limits WHERE account_key=?').get('world1:u1').hits,1);
});
test('security budget isolated by player and region',async()=>{
 const m=mock(),p={action:'buyListedCompany'};
 for(let i=0;i<12;i++)await checkDistributed(m,'u1','world1',p,500000);
 assert.equal((await checkDistributed(m,'u2','world1',p,500000)).ok,true);
 assert.equal((await checkDistributed(m,'u1','world-europe',p,500000)).ok,true);
 assert.equal((await checkDistributed(m,'u1','world1',{action:'me'},500000)).ok,true);
 assert.equal((await checkDistributed(m,'u1','world1',p,500000)).ok,false);
});
