'use strict';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import worker,{verifyFirebase} from '../cloudflare/src/index.mjs';
import core from '../cloudflare/src/world-core.mjs';
import rules from '../cloudflare/src/pvp-rules.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base='https://profitlands-world1.example.workers.dev';
const webOrigin='https://willn0tbill.github.io';
const dir=dirname(fileURLToPath(import.meta.url));
const root=join(dir,'..');
let authKeys;
let fetchCount=0;
const realFetch=globalThis.fetch;
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function keys(){
 if(authKeys)return authKeys;
 const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 authKeys={privateKey:kp.privateKey,publicKey:{...await crypto.subtle.exportKey('jwk',kp.publicKey),
  kid:'test-key-1',alg:'RS256',use:'sig'}};
 globalThis.fetch=async url=>{
  assert.match(String(url),/securetoken@system\.gserviceaccount\.com/);
  fetchCount++;
  return new Response(JSON.stringify({keys:[authKeys.publicKey]}),{
   status:200,headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=600'}});
 };
 return authKeys;
}
async function token(uid='user-one',override={}){
 const kp=await keys();
 const now=Math.floor(Date.now()/1000);
 const header=enc({alg:'RS256',kid:'test-key-1'});
 const payload=enc({...{aud:'wtvstudios-5b40f',iss:'https://securetoken.google.com/wtvstudios-5b40f',
  sub:uid,iat:now-30,exp:now+3600,auth_time:now-30},...override});
 const signed=header+'.'+payload;
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(signed));
 return signed+'.'+Buffer.from(signature).toString('base64url');
}
function dbMock(){
 let row=null;
 let reads=0,writes=0;
 return {
  read:()=>row&&JSON.parse(row.payload),get version(){return row?.version??null},
  get reads(){return reads},get writes(){return writes},
  prepare(sql){
   let args=[];
   return {
    bind(...values){args=values;return this},
    async first(){
     assert.match(sql,/^SELECT version, payload FROM world_state/);
     reads++;
     return row?{...row}:null;
    },
    async run(){
     writes++;
     if(sql.startsWith('INSERT OR IGNORE')){
      if(!row)row={version:0,payload:args[1]};
      return {meta:{changes:1}};
     }
     if(sql.startsWith('UPDATE world_state')){
      if(!row||row.version!==args[2])return {meta:{changes:0}};
      row={version:row.version+1,payload:args[0]};
      return {meta:{changes:1}};
     }
     throw Error('Unexpected SQL '+sql);
    }
   };
  },
  mutate(cb){
   const state=JSON.parse(row.payload);
   cb(state);row={version:row.version+1,payload:JSON.stringify(state)};
  }
 };
}
async function request(db,action,uid='user-one',extra={},options={}){
 const authorization=options.authorization??(uid?'Bearer '+await token(uid):null);
 const headers=new Headers({'Content-Type':'application/json','Origin':options.origin??webOrigin});
 if(authorization)headers.set('Authorization',authorization);
 return worker.fetch(new Request(base+'/api',{
  method:'POST',headers,body:JSON.stringify({action,...extra})
 }),{DB:db});
}
async function post(db,action,uid,extra={},opts={}){
 const response=await request(db,action,uid,extra,opts);
 return {status:response.status,body:await response.json(),headers:response.headers};
}
const rid=n=>String(n).padStart(32,'0');

test('Firebase identity verifies signed JWT and rejects forged, expired or foreign project tokens',async()=>{
 const good=await token();
 assert.equal(await verifyFirebase(good),'user-one');
 await assert.rejects(verifyFirebase(good.slice(0,-5)+'abcde'),/signature|token/i);
 await assert.rejects(verifyFirebase(await token('user-one',{aud:'other-project'})),/different project/);
 await assert.rejects(verifyFirebase(await token('user-one',{exp:1})),/expired/);
 await assert.rejects(verifyFirebase('not-a-token'),/Invalid|Malformed/i);
 assert.ok(fetchCount>=1);
});
test('public health works without user identity but protected actions need signed Firebase token',async()=>{
 const db=dbMock();
 const health=await post(db,'health',null);
 assert.equal(health.status,200);assert.equal(health.body.worldId,'world1');
 assert.equal(health.body.chatEnabled,false);
 assert.ok(health.body.catalog.length>=8);
 assert.equal(health.headers.get('Access-Control-Allow-Origin'),webOrigin);
 const noAuth=await post(db,'register',null);
 assert.equal(noAuth.status,401);assert.equal(noAuth.body.error.code,'unauthenticated');
 const forged=await post(db,'register','user-one',{}, {authorization:'Bearer forged'});
 assert.equal(forged.status,401);
 assert.equal(db.reads,1,'only the public health probe reads D1; unauthenticated calls cannot access player records');
});
test('Cloudflare site is an authorized frontend origin and unrelated sites are rejected',async()=>{
 const db=dbMock();
 const origin='https://profitlands.winotbill.workers.dev';
 const ok=await post(db,'health',null,{}, {origin});
 assert.equal(ok.status,200);
 assert.equal(ok.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal(ok.body.worldId,'world1');
 const rejected=await post(db,'health',null,{}, {origin:'https://other.example'});
 assert.equal(rejected.status,403);
 assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
 const preflight=await worker.fetch(new Request(base+'/api',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}),{DB:db});
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
});
test('health remains unavailable until the D1 binding and schema are ready',async()=>{
 const noDb=await worker.fetch(new Request(base+'/health',{method:'GET',headers:{Origin:'https://profitlands.winotbill.workers.dev'}}),{});
 assert.equal(noDb.status,503);
 assert.equal((await noDb.json()).error.code,'unavailable');
 const missingTable={prepare(){return {bind(){return this},async first(){throw Error('no such table world_state')}}}};
 const noSchema=await worker.fetch(new Request(base+'/health',{method:'GET'}),{DB:missingTable});
 assert.equal(noSchema.status,503);
 assert.equal((await noSchema.json()).error.code,'unavailable');
});
test('World 1 persists a registered player, keeps local client cash out and buys with canonical costs',async()=>{
 const db=dbMock();
 const joined=await post(db,'register');
 assert.equal(joined.status,200);assert.equal(joined.body.player.cash,1500);
 assert.equal(joined.body.player.uid,'user-one');
 assert.equal((await post(db,'register')).body.created,false);
 const bought=await post(db,'buyBusiness','user-one',{businessId:'coffee',requestId:rid(1),cash:999999999});
 assert.equal(bought.status,200);assert.equal(bought.body.player.cash,1000);
 assert.equal(bought.body.player.businesses[0].type,'coffee');
 const me=await post(db,'me');assert.equal(me.body.player.businesses.length,1);
 assert.equal(db.read().players['user-one'].cash,1000);
});
test('payment receipts survive retry, avoid double purchase and reject request-id substitution',async()=>{
 const db=dbMock();
 await post(db,'register');
 const first=await post(db,'buyBusiness','user-one',{businessId:'coffee',requestId:rid(2)});
 assert.equal(first.status,200);
 const replay=await post(db,'buyBusiness','user-one',{businessId:'coffee',requestId:rid(2)});
 assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
 assert.equal(replay.body.player.businesses.length,1);
 assert.equal((await post(db,'buyBusiness','user-one',{businessId:'hotel',requestId:rid(2)})).status,400);
 assert.equal(db.read().players['user-one'].cash,1000);
});
test('server rejects unknown businesses, unaffordable upgrades and bad request IDs',async()=>{
 const db=dbMock();await post(db,'register');
 assert.equal((await post(db,'buyBusiness','user-one',{businessId:'fake',requestId:rid(3)})).status,409);
 assert.equal((await post(db,'buyBusiness','user-one',{businessId:'hotel',requestId:rid(4)})).status,409);
 assert.equal((await post(db,'upgradeBusiness','user-one',{index:0,requestId:rid(5)})).status,409);
 assert.equal((await post(db,'buyBusiness','user-one',{businessId:'coffee',requestId:'guess'})).status,400);
 assert.equal(db.read().players['user-one'].businesses.length,0);
});
test('different accounts have independent ledgers, leaderboards and no write access to another profile',async()=>{
 const db=dbMock();
 await post(db,'register','user-one');await post(db,'register','user-two');
 await post(db,'buyBusiness','user-one',{businessId:'coffee',requestId:rid(6)});
 const first=await post(db,'me','user-one'),second=await post(db,'me','user-two');
 assert.equal(first.body.player.businesses.length,1);
 assert.equal(second.body.player.businesses.length,0);
 const leaders=await post(db,'getLeaderboard','user-one',{period:'all'});
 assert.equal(leaders.status,200);assert.equal(leaders.body.length,2);
 const others=await post(db,'getPlayers','user-two');
 assert.equal(others.body.length,1);assert.equal(others.body[0].uid,'user-one');
 assert.equal(others.body[0].cash,undefined,'rival list excludes private cash');
});
test('PvP is opt-in, respects new player grace and paid attacks change both ledgers atomically',async()=>{
 const db=dbMock();
 await post(db,'register','user-one');await post(db,'register','user-two');
 assert.equal((await post(db,'togglePvP','user-one')).status,200);
 assert.equal((await post(db,'togglePvP','user-two')).status,200);
 let failed=await post(db,'requestAttack','user-one',{
  targetUid:'user-two',attackId:'supplier',requestId:rid(7)});
 assert.equal(failed.status,409);
 db.mutate(state=>{
  for(const uid of ['user-one','user-two']){
   state.players[uid].cash=300000;
   state.players[uid].createdAtSeconds-=3*86400;
   state.players[uid].businesses=[{type:'factory',level:1}];
  }
 });
 const result=await post(db,'requestAttack','user-one',{
  targetUid:'user-two',attackId:'supplier',requestId:rid(7)});
 assert.equal(result.status,200);
 assert.equal(result.body.event.type,'pvp_attack');
 assert.ok(db.read().players['user-two'].activePenalty>0);
 const charged=db.read().players['user-one'].cash;
 const replay=await post(db,'requestAttack','user-one',{
  targetUid:'user-two',attackId:'supplier',requestId:rid(7)});
 assert.equal(replay.body.replayed,true);
 assert.equal(db.read().players['user-one'].cash,charged);
});
test('unknown origins and request methods are rejected; public health cannot bypass private account actions',async()=>{
 const db=dbMock();
 const denied=await post(db,'health',null,{}, {origin:'https://malicious.example'});
 assert.equal(denied.status,403);
 const get=await worker.fetch(new Request(base+'/health',{method:'GET',headers:{Origin:webOrigin}}),{DB:db});
 assert.equal(get.status,200);
 const invalid=await post(db,'sendChat');
 assert.equal(invalid.status,409);
 assert.equal(invalid.body.error.code,'failed-precondition');
});
test('Cloudflare adapter and config are loaded, no Firebase Functions billing dependency in the client',()=>{
 const html=readFileSync(join(root,'play/index.html'),'utf8');
 const adapter=readFileSync(join(root,'firebase-world-adapter.js'),'utf8');
 const config=readFileSync(join(root,'world1-config.js'),'utf8');
 const wrangler=readFileSync(join(root,'cloudflare/wrangler.toml'),'utf8');
 const schema=readFileSync(join(root,'cloudflare/schema.sql'),'utf8');
 assert.ok(html.indexOf('world1-config.js')<html.indexOf('firebase-world-adapter.js'));
 assert.match(html,/firebase-world-adapter\.js\?v=cloudflare01/);
 assert.doesNotMatch(html,/firebase-functions-compat\.js/);
 assert.doesNotMatch(adapter,/httpsCallable\(|\.functions\(/);
 assert.match(adapter,/getIdToken\(/);
 assert.match(adapter,/Authorization:'Bearer '/);
 assert.match(wrangler,/name = "profitlands-world1"/);
 assert.match(wrangler,/binding = "DB"/);
 assert.match(schema,/version INTEGER NOT NULL/);
 assert.match(config,/PROFITLANDS_WORLD1_ENDPOINT/);
});
test('the Cloudflare rules match the established Firebase server economics and attack definitions',()=>{
 const original=readFileSync(join(root,'functions/world-core.js'),'utf8');
 const duplicate=readFileSync(join(root,'cloudflare/src/world-core.mjs'),'utf8');
 const prior=readFileSync(join(root,'functions/pvp-rules.js'),'utf8');
 const copied=readFileSync(join(root,'cloudflare/src/pvp-rules.mjs'),'utf8');
 assert.ok(duplicate.includes(original));
 assert.ok(copied.includes(prior));
 assert.equal(core.MAX_PLAYERS,64);
 assert.ok(rules.ATTACKS.length>=3);
});
test.after(()=>{globalThis.fetch=realFetch});
