import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import workerApi from '../cloudflare/src/index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {dispatch,migrateExistingRegion} from '../cloudflare/src/index.mjs';
import migrationAdmin from '../cloudflare/src/migration-admin.mjs';
import {readNormalized,migrateLegacy,transactNormalized} from '../cloudflare/src/world-store-v2.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const env={WORLD_STORAGE_V2:'enabled'};
const rid=n=>String(n).padStart(32,'0');
class D1Sqlite{
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');
  this.sqlite.exec(readFileSync(join(root,'cloudflare/schema.sql'),'utf8'));
  this.sqlite.exec(readFileSync(join(root,'cloudflare/schema-v2.sql'),'utf8'));
  this.calls=0;this.batches=0;
 }
 prepare(sql){
  const db=this;
  return {
   bind(...args){this.args=args;return this},
   async first(){db.calls++;return db.sqlite.prepare(sql).get(...(this.args||[]))||null},
   async all(){db.calls++;return {results:db.sqlite.prepare(sql).all(...(this.args||[]))}},
   async run(){db.calls++;const x=db.sqlite.prepare(sql).run(...(this.args||[]));return {meta:{changes:Number(x.changes)}}},
   _run(){return db.sqlite.prepare(sql).run(...(this.args||[]))}
  };
 }
 async batch(stmts){
  this.batches++;
  this.sqlite.exec('BEGIN IMMEDIATE');
  try{
   const out=stmts.map(s=>{const x=s._run();return {meta:{changes:Number(x.changes)}}});
   this.sqlite.exec('COMMIT');return out;
  }catch(e){this.sqlite.exec('ROLLBACK');throw e}
 }
 get(sql,...args){return this.sqlite.prepare(sql).get(...args)}
 rows(sql,...args){return this.sqlite.prepare(sql).all(...args)}
 close(){this.sqlite.close()}
}

test('normalized migration retains legacy cash, companies, regional chat and paid receipts',async()=>{
 const db=new D1Sqlite();
 try{
  const a=await dispatch('register','alice',{},db,'world1');
  const b=await dispatch('register','bob',{},db,'world1');
  assert.equal(a.created,true);assert.equal(b.created,true);
  await dispatch('buyBusiness','alice',{businessId:'coffee',requestId:rid(1)},db,'world1');
  await dispatch('sendChat','alice',{text:'Hello from the Americas!'},db,'world1');
  const legacy=db.get('SELECT version,payload FROM world_state WHERE id=?','world1');
  const result=await migrateExistingRegion(db,'world1');
  assert.equal(result.players,2);
  assert.equal(result.receipts,1);
  assert.deepEqual(db.get('SELECT version,payload FROM world_state WHERE id=?','world1'),legacy,
   'migration must never overwrite or delete the original world row');
  const now=await dispatch('me','alice',{},db,'world1',env);
  assert.equal(now.player.cash,1000);
  assert.equal(now.player.businesses.length,1);
  const replay=await dispatch('buyBusiness','alice',{
   businessId:'coffee',requestId:rid(1)},db,'world1',env);
  assert.equal(replay.replayed,true);
  assert.equal(replay.player.businesses.length,1);
  assert.equal((await dispatch('getPlayers','alice',{},db,'world1',env)).length,1);
  assert.equal((await dispatch('getChat','bob',{},db,'world1',env)).length,1);
  const health=await dispatch('health',null,{},db,'world1',env);
  assert.equal(health.version,6);
  assert.equal(db.rows('SELECT uid FROM world_players WHERE world_id=?','world1').length,2);
  const second=await readNormalized(db,'world1');
  assert.equal(second.state.players.alice.cash,1000);
  await assert.rejects(migrateExistingRegion(db,'world1'),/already_active/);
 }finally{db.close()}
});
test('normalized regional trades commit both players and replay exactly once',async()=>{
 const db=new D1Sqlite();
 try{
  for(const who of ['seller','buyer'])await dispatch('register',who,{},db,'world1');
  await dispatch('buyBusiness','seller',{businessId:'coffee',requestId:rid(2)},db,'world1');
  await migrateExistingRegion(db,'world1');
  const listing=await dispatch('enterpriseAction','seller',{
   operation:'listCompany',index:0,price:500,requestId:rid(3)},db,'world1',env);
  assert.equal(listing.player.businesses[0].listing.price,500);
  const buyer=await dispatch('buyListedCompany','buyer',{
   sellerUid:'seller',index:0,maxPrice:500,requestId:rid(4)},db,'world1',env);
  assert.equal(buyer.ok,true);
  const first=await readNormalized(db,'world1');
  assert.equal(first.state.players.seller.businesses.length,0);
  assert.equal(first.state.players.seller.cash,1500);
  assert.equal(first.state.players.buyer.businesses.length,1);
  assert.equal(first.state.players.buyer.cash,1000);
  const replay=await dispatch('buyListedCompany','buyer',{
   sellerUid:'seller',index:0,maxPrice:500,requestId:rid(4)},db,'world1',env);
  assert.equal(replay.replayed,true);
  const after=await readNormalized(db,'world1');
  assert.equal(after.state.players.buyer.cash,1000);
  assert.equal(after.state.players.seller.cash,1500);
  assert.equal(after.state.players.buyer.businesses.length,1);
  assert.equal(db.rows('SELECT * FROM world_receipts WHERE world_id=?','world1').length,3);
 }finally{db.close()}
});
test('V2 cannot activate without explicit migration: no new blank world is silently created',async()=>{
 const db=new D1Sqlite();
 try{
  await assert.rejects(dispatch('register','alice',{},db,'world1',env),
   /world_v2_not_migrated/);
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1'),undefined);
 }finally{db.close()}
});
test('stale legacy migration is rolled back without activating partial V2',async()=>{
 const db=new D1Sqlite();
 try{
  await dispatch('register','alice',{},db,'world1');
  const stale=db.get('SELECT version,payload FROM world_state WHERE id=?','world1');
  await dispatch('buyBusiness','alice',{businessId:'coffee',requestId:rid(8)},db,'world1');
  await assert.rejects(migrateLegacy(db,'world1',{
   version:stale.version,state:JSON.parse(stale.payload)}),/world_revision_match/);
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1'),undefined);
  const actual=JSON.parse(db.get('SELECT payload FROM world_state WHERE id=?','world1').payload);
  assert.equal(actual.players.alice.businesses.length,1);
  const fresh=await migrateExistingRegion(db,'world1');
  assert.equal(fresh.players,1);
  assert.equal((await readNormalized(db,'world1')).state.players.alice.businesses.length,1);
 }finally{db.close()}
});
test('same-region conflicting writes retry and keep all independently validated purchases',async()=>{
 const db=new D1Sqlite();
 try{
  for(const user of ['one','two'])await dispatch('register',user,{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const operations=[['one',20],['two',21],['one',22],['two',23]];
  const results=await Promise.all(operations.map(([who,n])=>
   dispatch('buyBusiness',who,{businessId:'coffee',requestId:rid(n)},db,'world1',env)));
  assert.equal(results.length,4);
  const state=(await readNormalized(db,'world1')).state;
  assert.equal(state.players.one.businesses.length,2);
  assert.equal(state.players.two.businesses.length,2);
  assert.equal(state.players.one.cash,500);
  assert.equal(state.players.two.cash,500);
  assert.equal(Object.keys(state.receipts).length,4);
 }finally{db.close()}
});
test('one database holds independent V2 regions without mixing receipts or players',async()=>{
 const db=new D1Sqlite();
 try{
  for(const region of ['world1','world-europe']){
   await dispatch('register','alice',{},db,region);
   await migrateExistingRegion(db,region);
  }
  const request={businessId:'coffee',requestId:rid(44)};
  await dispatch('buyBusiness','alice',request,db,'world1',env);
  const europe=await dispatch('me','alice',{},db,'world-europe',env);
  assert.equal(europe.player.cash,1500);
  assert.equal(europe.player.businesses.length,0);
  await dispatch('buyBusiness','alice',request,db,'world-europe',env);
  assert.equal((await readNormalized(db,'world1')).state.players.alice.cash,1000);
  assert.equal((await readNormalized(db,'world-europe')).state.players.alice.cash,1000);
 }finally{db.close()}
});

test('V2 atomic batch failure rolls back both owners, metadata and receipt',async()=>{
 const db=new D1Sqlite();
 try{
  for(const id of ['seller','buyer'])await dispatch('register',id,{},db,'world1');
  await dispatch('buyBusiness','seller',{businessId:'coffee',requestId:rid(51)},db,'world1');
  await migrateExistingRegion(db,'world1');
  await dispatch('enterpriseAction','seller',{
   operation:'listCompany',index:0,price:500,requestId:rid(52)},db,'world1',env);
  const before=await readNormalized(db,'world1');
  db.sqlite.exec(`CREATE TRIGGER block_buyer_update BEFORE UPDATE ON world_players
   WHEN NEW.uid='buyer' BEGIN SELECT RAISE(ABORT,'synthetic_database_failure'); END;`);
  const request={sellerUid:'seller',index:0,maxPrice:500,requestId:rid(53)};
  await assert.rejects(dispatch('buyListedCompany','buyer',request,db,'world1',env),
   /synthetic_database_failure/);
  const afterFailure=await readNormalized(db,'world1');
  assert.deepEqual(afterFailure,before,'the batch must not partially transfer ownership or charge cash');
  assert.equal(afterFailure.state.receipts['buyer:'+rid(53)],undefined);
  db.sqlite.exec('DROP TRIGGER block_buyer_update;');
  const successful=await dispatch('buyListedCompany','buyer',request,db,'world1',env);
  assert.equal(successful.ok,true);
  assert.equal((await readNormalized(db,'world1')).state.players.buyer.businesses.length,1);
 }finally{db.close()}
});
test('single-user transactions fetch only the owner and requested replay receipt',async()=>{
 const db=new D1Sqlite();
 try{
  for(const uid of ['alice','bob','charlie'])await dispatch('register',uid,{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const seen=[];
  const oldPrepare=db.prepare.bind(db);
  db.prepare=sql=>{
   if(/SELECT uid,version,payload FROM world_players|SELECT receipt_key,payload FROM world_receipts/.test(sql))
    seen.push(sql);
   return oldPrepare(sql);
  };
  await dispatch('buyBusiness','alice',{businessId:'coffee',requestId:rid(54)},
   db,'world1',env);
  assert.ok(seen.some(x=>x.includes('uid IN (')&&x.includes('uid')));
  assert.ok(seen.some(x=>x.includes('receipt_key=?')));
  assert.equal(seen.some(x=>x==='SELECT receipt_key,payload FROM world_receipts WHERE world_id=?'),
   false,'economic actions must not retrieve all regional receipts');
  assert.equal((await readNormalized(db,'world1')).state.players.bob.cash,1500);
 }finally{db.close()}
});

test('cutover maintenance blocks all paid writes without denying read-only views',async()=>{
 const db=new D1Sqlite();
 try{
  await dispatch('register','alice',{},db,'world1');
  const readonly={WORLD_MAINTENANCE_READONLY:'true'};
  const before=db.get('SELECT version,payload FROM world_state WHERE id=?','world1');
  const health=await dispatch('health',null,{},db,'world1',readonly);
  assert.equal(health.maintenance,true);
  const me=await dispatch('me','alice',{},db,'world1',readonly);
  assert.equal(me.player.cash,1500);
  await assert.rejects(dispatch('register','bob',{},db,'world1',readonly),
   /read-only maintenance/);
  await assert.rejects(dispatch('buyBusiness','alice',{
   businessId:'coffee',requestId:rid(63)},db,'world1',readonly),
  /read-only maintenance/);
  assert.deepEqual(db.get('SELECT version,payload FROM world_state WHERE id=?','world1'),before,
   'maintenance must not write to legacy saves');
 }finally{db.close()}
});

test('migration-only Worker is inaccessible without explicit secrets and authenticated owner',async()=>{
 const db=new D1Sqlite();
 try{
  const path='https://migration.example/migrate';
  const request=(headers={})=>new Request(path,{
   method:'POST',headers:{'Content-Type':'application/json',...headers},
   body:JSON.stringify({worldId:'world1',confirm:'backup-verified-writes-frozen'})});
  const disabled=await migrationAdmin.fetch(request(),{DB:db});
  assert.equal(disabled.status,503);
  const configured={DB:db,WORLD_MIGRATION_ENABLED:'true',
   WORLD_MAINTENANCE_READONLY:'true',
   WORLD_MIGRATION_SECRET:'the-independent-admin-migration-secret',
   WORLD_MIGRATION_ADMIN_UID:'owner-uid'};
  const wrong=await migrationAdmin.fetch(request({'X-Migration-Key':'wrong'}),configured);
  assert.equal(wrong.status,403);
  const noFirebase=await migrationAdmin.fetch(request({
   'X-Migration-Key':'the-independent-admin-migration-secret'}),configured);
  assert.equal(noFirebase.status,403);
  const wrongPath=await migrationAdmin.fetch(new Request('https://migration.example/'),configured);
  assert.equal(wrongPath.status,404);
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1'),undefined);
 }finally{db.close()}
});

test('independent economic writes avoid regional contention; chat and admissions use regional CAS',async()=>{
 const db=new D1Sqlite();
 try{
  for(const who of ['alice','bob'])await dispatch('register',who,{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const oldVersion=db.get('SELECT version FROM world_meta WHERE world_id=?','world1').version;
  await Promise.all(['alice','bob'].map((who,i)=>
   dispatch('buyBusiness',who,{businessId:'coffee',requestId:rid(71+i)},db,'world1',env)));
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1').version,
   oldVersion,'independent user writes must not update a shared regional lock');
  const versions=db.rows('SELECT uid,version FROM world_players WHERE world_id=?','world1');
  assert.deepEqual(versions.map(x=>[x.uid,x.version]),[['alice',1],['bob',1]]);
  await dispatch('sendChat','alice',{text:'New city development!'},db,'world1',env);
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1').version,
   oldVersion+1,'shared regional chat must remain version-guarded');
  assert.equal((await dispatch('getChat','bob',{},db,'world1',env)).length,1);
  const admitted=await dispatch('register','charlie',{},db,'world1',env);
  assert.equal(admitted.created,true);
  assert.equal(db.get('SELECT version FROM world_meta WHERE world_id=?','world1').version,
   oldVersion+2,'registered-player cap must be protected by a regional revision');
  assert.equal(db.get('SELECT version FROM world_players WHERE world_id=? AND uid=?','world1','charlie').version,0);
 }finally{db.close()}
});

test('normalized accounts preserve city work order progress, regional events and idempotent rewards',async()=>{
 const db=new D1Sqlite();
 try{
  await dispatch('register','work-order',{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const offer=await dispatch('enterpriseAction','work-order',{
   operation:'acceptCityContract',contractId:'open',requestId:'7'.repeat(32)},db,'world1',env);
  assert.equal(offer.player.enterprise.cityContracts.active.progress,0);
  const bought=await dispatch('buyBusiness','work-order',{
   businessId:'coffee',requestId:'8'.repeat(32)},db,'world1',env);
  assert.equal(bought.player.enterprise.cityContracts.active.progress,1);
  const done=await dispatch('enterpriseAction','work-order',{
   operation:'claimCityContract',requestId:'9'.repeat(32)},db,'world1',env);
  assert.equal(done.reward,75);
  const reconnected=await dispatch('me','work-order',{},db,'world1',env);
  assert.equal(reconnected.player.enterprise.cityContracts.active.status,'claimed');
  assert.equal(typeof reconnected.player.enterprise.worldEvent.id,'string');
  const replay=await dispatch('enterpriseAction','work-order',{
   operation:'claimCityContract',requestId:'9'.repeat(32)},db,'world1',env);
  assert.equal(replay.replayed,true);
  assert.equal(replay.player.cash,done.player.cash);
  assert.equal((await readNormalized(db,'world1')).state.players['work-order'].enterprise.cityCompleted,1);
 }finally{db.close()}
});

test('normalized account stores loan due dates and safe opt-in recovery across reconnects',async()=>{
 const db=new D1Sqlite();
 try{
  await dispatch('register','borrower',{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const loan=await dispatch('enterpriseAction','borrower',{
   operation:'borrowLoan',amount:5000,requestId:'1'.repeat(32)},db,'world1',env);
  assert.equal(loan.player.enterprise.loanDebt,5500);
  assert.ok(loan.player.enterprise.loanDueAt>Date.now());
  const enable=await dispatch('enterpriseAction','borrower',{
   operation:'setAutoDebtRepayment',enabled:true,requestId:'2'.repeat(32)},
   db,'world1',env);
  assert.equal(enable.player.enterprise.repaymentAuto,true);
  assert.equal(enable.player.enterprise.loanDebt,5500);
  const snapshot=(await readNormalized(db,'world1')).state.players.borrower;
  assert.equal(snapshot.enterprise.repaymentAuto,true);
  const reconnect=await dispatch('me','borrower',{},db,'world1',env);
  assert.equal(reconnect.player.enterprise.repaymentAuto,true);
  assert.equal(reconnect.player.enterprise.loanStatus,'Due');
  const retry=await dispatch('enterpriseAction','borrower',{
   operation:'setAutoDebtRepayment',enabled:true,requestId:'2'.repeat(32)},
   db,'world1',env);
  assert.equal(retry.replayed,true);
  assert.equal(retry.player.enterprise.loanDebt,5500);
 }finally{db.close()}
});

test('V2 bankruptcy liquidation is atomic, idempotent, and isolated from rivals',async()=>{
 const db=new D1Sqlite();
 try{
  for(const who of ['distressed','healthy'])await dispatch('register',who,{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const row=db.get('SELECT version,payload FROM world_players WHERE world_id=? AND uid=?',
   'world1','distressed');
  const user=JSON.parse(row.payload);
  user.cash=0;user.lastSettledAt=Date.now();
  user.enterprise={
   country:'us',loanDebt:5500,loanPrincipal:5000,
   loanDueAt:Date.now()-60000,loanIssuedAt:Date.now()-31*86400000,
   stocks:{},properties:[],majorCompanies:[],research:[],routes:[],
   warehouse:0,trucks:0,warehouseStock:0,metrics:{},
   fiscal:{year:1,nextTaxAt:Date.now()+365*86400000,
    taxableProfit:0,taxDue:200,totalTaxPaid:0}
  };
  db.sqlite.prepare('UPDATE world_players SET payload=?,version=version+1 WHERE world_id=? AND uid=?')
   .run(JSON.stringify(user),'world1','distressed');
  const before=(await readNormalized(db,'world1')).state.players.healthy;
  const req={operation:'fileBankruptcy',requestId:'c'.repeat(32)};
  const recovery=await dispatch('enterpriseAction','distressed',req,db,'world1',env);
  assert.equal(recovery.reward,500);
  assert.equal(recovery.player.cash,500);
  assert.equal(recovery.player.enterprise.bankruptcyCount,1);
  assert.equal(recovery.player.enterprise.loanDebt,0);
  assert.equal(recovery.player.enterprise.fiscal.taxDue,0);
  assert.equal((await dispatch('enterpriseAction','distressed',req,db,'world1',env)).replayed,true);
  const stored=await readNormalized(db,'world1');
  assert.deepEqual(stored.state.players.healthy,before);
  assert.equal(stored.state.players.distressed.cash,500);
  assert.equal(Object.keys(stored.state.receipts).length,1);
  await assert.rejects(dispatch('enterpriseAction','distressed',
   {operation:'borrowLoan',amount:5000,requestId:'d'.repeat(32)},db,'world1',env),
    /bankruptcy_credit_cooldown/);
 }finally{db.close()}
});

test('two signed Firebase-style accounts safely trade through the real HTTP API on V2 SQLite',async()=>{
 const db=new D1Sqlite();
 const priorFetch=globalThis.fetch;
 try{
  // The verifier validates real RS256 signatures; only the Google JWKS
  // retrieval is replaced with a locally generated public test key.
  const kp=await crypto.subtle.generateKey({
   name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
  },true,['sign','verify']);
  const pub={...await crypto.subtle.exportKey('jwk',kp.publicKey),
   kid:'v2-authenticated-regression-key',alg:'RS256',use:'sig'};
  globalThis.fetch=async url=>{
   assert.match(String(url),/securetoken@system\.gserviceaccount\.com/);
   return new Response(JSON.stringify({keys:[pub]}),{
    status:200,headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=600'}});
  };
  const enc=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
  const sign=async uid=>{
   const now=Math.floor(Date.now()/1000);
   const first=enc({alg:'RS256',kid:pub.kid})+'.'+
    enc({aud:'wtvstudios-5b40f',iss:'https://securetoken.google.com/wtvstudios-5b40f',
     sub:uid,iat:now-20,exp:now+3600,auth_time:now-20});
   const proof=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',
    kp.privateKey,new TextEncoder().encode(first));
   return first+'.'+Buffer.from(proof).toString('base64url');
  };
  const [a,b]=await Promise.all([sign('signed-player-a'),sign('signed-player-b')]);
  const endpoint='https://profitlands-world1.example.workers.dev/api';
  const send=async(jwt,action,extra={})=>{
   const response=await workerApi.fetch(new Request(endpoint,{
    method:'POST',headers:{'Origin':'https://willn0tbill.github.io',
     'Authorization':'Bearer '+jwt,'Content-Type':'application/json'},
    body:JSON.stringify({action,...extra})
   }),{DB:db,WORLD_STORAGE_V2:'enabled'});
   return {status:response.status,data:await response.json()};
  };
  await migrateExistingRegion(db,'world1');
  await migrateExistingRegion(db,'world-europe');
  assert.equal((await send(a,'register')).data.created,true);
  assert.equal((await send(b,'register')).data.created,true);
  assert.equal((await send('forged','me')).status,401);
  assert.equal((await send(a,'getPlayers')).data.length,1);
  assert.equal((await send(a,'getPlayers')).data[0].uid,'signed-player-b');
  const purchase=await send(a,'buyBusiness',{
   businessId:'coffee',requestId:rid(311)});
  assert.equal(purchase.status,200);
  assert.equal(purchase.data.player.cash,1000);
  const listing=await send(a,'enterpriseAction',{
   operation:'listCompany',index:0,price:500,requestId:rid(312)});
  assert.equal(listing.status,200);
  const acquisition=await send(b,'buyListedCompany',{
   sellerUid:'signed-player-a',index:0,maxPrice:500,requestId:rid(313)});
  assert.equal(acquisition.status,200);
  assert.equal(acquisition.data.player.businesses.length,1);
  const replay=await send(b,'buyListedCompany',{
   sellerUid:'signed-player-a',index:0,maxPrice:500,requestId:rid(313)});
  assert.equal(replay.status,200);
  assert.equal(replay.data.replayed,true);
  assert.equal((await send(a,'me')).data.player.cash,1500);
  assert.equal((await send(b,'me')).data.player.cash,1000);
  assert.equal((await send(a,'me',{worldId:'world-europe'})).status,409,
   'Americas accounts must not exist automatically in Europe');
  const state=(await readNormalized(db,'world1')).state;
  assert.equal(state.players['signed-player-a'].businesses.length,0);
  assert.equal(state.players['signed-player-b'].businesses.length,1);
  assert.equal(Object.keys(state.receipts).length,3);
 }finally{
  globalThis.fetch=priorFetch;
  db.close();
 }
});

test('V2 multi-account concurrency stress conserves 64 concurrent purchases and 64 receipts',async()=>{
 const db=new D1Sqlite();
 try{
  for(let i=0;i<32;i++)
   await dispatch('register','load-'+String(i).padStart(3,'0'),{},db,'world1');
  await migrateExistingRegion(db,'world1');
  const start=performance.now();
  const tasks=[];
  for(let i=0;i<32;i++){
   const who='load-'+String(i).padStart(3,'0');
   tasks.push(dispatch('buyBusiness',who,{
    businessId:'coffee',requestId:rid(2000+i*2)},db,'world1',env));
   tasks.push(dispatch('buyBusiness',who,{
    businessId:'coffee',requestId:rid(2001+i*2)},db,'world1',env));
  }
  const results=await Promise.all(tasks);
  assert.equal(results.length,64);
  const snapshot=await readNormalized(db,'world1');
  assert.equal(Object.keys(snapshot.state.players).length,32);
  assert.equal(Object.keys(snapshot.state.receipts).length,64);
  for(const p of Object.values(snapshot.state.players)){
   assert.equal(p.businesses.length,2);
   assert.equal(p.cash,500);
  }
  const after=await Promise.all(tasks.map((_,i)=>dispatch('buyBusiness',
   'load-'+String(Math.floor(i/2)).padStart(3,'0'),
   {businessId:'coffee',requestId:rid(2000+i)},db,'world1',env)));
  assert.ok(after.every(x=>x.replayed===true));
  assert.equal((await readNormalized(db,'world1')).state.players['load-000'].cash,500);
  const elapsed=Math.round(performance.now()-start);
  assert.ok(elapsed<15000,'local transactional load should not hang');
  console.log('V2_SQLITE_CONCURRENT_32_ACCOUNTS_64_TRANSACTIONS_PASS',elapsed,'ms');
 }finally{db.close()}
});
