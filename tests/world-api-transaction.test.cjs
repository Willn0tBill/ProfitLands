'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const apiCode=fs.readFileSync(path.join(root,'functions','index.js'),'utf8');
const core=require('../functions/world-core');
const pvp=require('../functions/pvp-rules');
const CLOCK=Date.UTC(2026,10,4,21,0);
const copy=data=>data===undefined?undefined:structuredClone(data);

class MemoryRef{
 constructor(db,p){this.db=db;this.path=p}
 collection(name){return new MemoryRef(this.db,this.path+'/'+name)}
 doc(id){return new MemoryRef(this.db,this.path+'/'+id)}
 limit(max){return {get:async()=>{
  this.db.rosterReads++;
  const prefix=this.path+'/';
  return {docs:[...this.db.data].filter(([key])=>key.startsWith(prefix)&&key.slice(prefix.length).split('/').length===1)
   .slice(0,max).map(([key,value])=>({id:key.slice(prefix.length),data:()=>copy(value)}))};
 }}}
}
class MemoryFirestore{
 constructor(){this.data=new Map();this.queue=Promise.resolve();this.rosterReads=0}
 collection(name){return new MemoryRef(this,name)}
 snapshot(ref){
  const value=this.data.get(ref.path);
  return {exists:value!==undefined,data:()=>copy(value)};
 }
 runTransaction(fn){
  const operation=this.queue.then(async()=>{
   const pending=[];
   let hasWrite=false;
   const tx={
    get:async ref=>{if(hasWrite)throw Error('Transaction tried to read after a write');return this.snapshot(ref)},
    set:(ref,data,opts)=>{hasWrite=true;pending.push({kind:'set',path:ref.path,data:copy(data),merge:Boolean(opts?.merge)})},
    create:(ref,data)=>{hasWrite=true;pending.push({kind:'create',path:ref.path,data:copy(data)})}
   };
   const output=await fn(tx);
   for(const op of pending){
    if(op.kind==='create'&&this.data.has(op.path))throw Error('Already exists: '+op.path);
    this.data.set(op.path,op.merge?{...(this.data.get(op.path)||{}),...op.data}:op.data);
   }
   return output;
  });
  // Simulate serialized Firestore transactions without using real credentials.
  this.queue=operation.catch(()=>{});
  return operation;
 }
}
function harness(){
 const db=new MemoryFirestore();
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
 const exports={};
 class ClockDate extends Date{static now(){return CLOCK}}
 const fakeRequire=name=>{
  if(name==='firebase-functions/v2/https')return {onCall:(opts,handler)=>handler,HttpsError};
  if(name==='firebase-admin/app')return {getApps:()=>[],initializeApp:()=>{}};
  if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>CLOCK}};
  if(name==='node:crypto')return require('node:crypto');
  if(name==='./world-core')return core;
  if(name==='./pvp-rules')return pvp;
  throw Error('Unexpected dependency: '+name);
 };
 const context={exports,require:fakeRequire,Date:ClockDate,console};
 new vm.Script(apiCode,{filename:'functions/index.js'}).runInNewContext(context);
 const call=(uid,action,props={})=>exports.worldApi({
  auth:uid?{uid,token:{name:'DO NOT EXPOSE A REAL NAME'}}:null,
  data:{action,...props}
 });
 const get=uid=>copy(db.data.get('worlds/world1/players/'+uid));
 const set=(uid,profile)=>db.data.set('worlds/world1/players/'+uid,copy(profile));
 return {call,db,get,set};
}

test('callable rejects untrusted identities and actions',async()=>{
 const h=harness();
 await assert.rejects(h.call(null,'register'),e=>e.code==='unauthenticated');
 await assert.rejects(h.call('alpha','invalid-action'),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('bad/uid','register'),e=>e.code==='unauthenticated');
 const health=await h.call(null,'health');
 assert.equal(health.ok,true);
 assert.equal(health.worldId,'world1');
 assert.equal(health.chatEnabled,false);
});
test('registration is idempotent, retains one account and obscures real identity',async()=>{
 const h=harness();
 const a=await h.call('alpha','register');
 const repeat=await h.call('alpha','register');
 assert.equal(a.created,true);
 assert.equal(repeat.created,false);
 assert.equal(a.player.cash,1500);
 assert.match(a.player.displayName,/^Tycoon-[A-F0-9]{7}$/);
 assert.equal(a.player.displayName.includes('DO NOT EXPOSE'),false);
 assert.equal(h.db.data.get('worlds/world1').joined,1);
 assert.equal((await h.call('alpha','me')).player.cash,1500);
});
test('fake client cash cannot fund business purchases or corrupt other player',async()=>{
 const h=harness();
 await h.call('alpha','register');
 await h.call('beta','register');
 await assert.rejects(h.call('alpha','buyBusiness',{businessId:'factory',cash:999999999,requestId:'factory_fail_0001'}),e=>e.code==='failed-precondition');
 const bought=await h.call('alpha','buyBusiness',{businessId:'coffee',cash:999999999,requestId:'coffee_good_0001'});
 assert.equal(bought.player.cash,1000);
 assert.equal(h.get('beta').cash,1500);
 assert.equal(bought.player.businesses.length,1);
});
test('concurrent business purchases are serialized and cannot overspend',async()=>{
 const h=harness();
 await h.call('alpha','register');
 h.set('alpha',{...h.get('alpha'),cash:500});
 const [first,second]=await Promise.allSettled([
  h.call('alpha','buyBusiness',{businessId:'coffee',requestId:'coffee_race_0001'}),
  h.call('alpha','buyBusiness',{businessId:'coffee',requestId:'coffee_race_0002'})
 ]);
 assert.equal(first.status,'fulfilled');
 assert.equal(second.status,'rejected');
 assert.equal(second.reason.code,'failed-precondition');
 assert.equal(h.get('alpha').cash,0);
 assert.equal(h.get('alpha').businesses.length,1);
});
test('PvP charges exactly once, replays same event and rejects cross-action replay',async()=>{
 const h=harness();
 await h.call('alpha','register');
 await h.call('beta','register');
 const old=Math.floor(CLOCK/1000)-90_000;
 h.set('alpha',{...h.get('alpha'),cash:100000,pvpEnabled:true});
 h.set('beta',{...h.get('beta'),cash:100000,businesses:[{type:'coffee',level:1}],
  createdAtSeconds:old,pvpEnabled:true});
 const input={targetUid:'beta',attackId:'supplier',requestId:'atkreplay_0001'};
 const first=await h.call('alpha','requestAttack',input);
 assert.equal(first.ok,true);
 assert.equal(first.cost,undefined);
 assert.equal(first.event.cost,5000);
 assert.equal(h.get('alpha').cash,95000);
 assert.equal(h.get('beta').activePenalty,0.12);
 const retry=await h.call('alpha','requestAttack',input);
 assert.equal(retry.replayed,true);
 assert.equal(h.get('alpha').cash,95000);
 await assert.rejects(h.call('alpha','requestAttack',{...input,attackId:'pressure'}),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('alpha','requestDefense',{requestId:input.requestId}),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('alpha','requestAttack',{...input,targetUid:'bad/slash'}),e=>e.code==='invalid-argument');
 assert.equal(h.get('alpha').cash,95000);
});
test('shield replay is free and mixing attack ID into defense is rejected',async()=>{
 const h=harness();
 await h.call('alpha','register');
 h.set('alpha',{...h.get('alpha'),cash:30000});
 const requestId='defense_once_0001';
 const first=await h.call('alpha','requestDefense',{requestId});
 assert.equal(first.event.cost,10000);
 assert.equal(h.get('alpha').cash,20000);
 const second=await h.call('alpha','requestDefense',{requestId});
 assert.equal(second.replayed,true);
 assert.equal(h.get('alpha').cash,20000);
 await assert.rejects(h.call('alpha','requestAttack',{requestId,targetUid:'beta',attackId:'supplier'}),e=>e.code==='invalid-argument');
});
test('leaderboards read server-owned scores and world chat remains disabled',async()=>{
 const h=harness();
 await h.call('alpha','register');
 await h.call('beta','register');
 await h.call('alpha','buyBusiness',{businessId:'coffee',requestId:'coffee_leader_0001'});
 const ranks=await h.call('alpha','getLeaderboard',{period:'all'});
 assert.equal(ranks.length,2);
 assert.ok(ranks.every(entry=>entry.score===1500));
 assert.equal((await h.call('alpha','getPlayers')).length,1);
 assert.deepEqual(Array.from(await h.call('alpha','getChat')),[]);
 await assert.rejects(h.call('alpha','sendChat',{text:'hello'}),e=>e.code==='failed-precondition');
 assert.equal(h.db.data.size,3,'chat cannot create public messages');
});

test('replayed business purchase charges once, even when repeated after success',async()=>{
 const h=harness();await h.call('alpha','register');
 const input={businessId:'coffee',requestId:'buy_coffee_once_001'};
 const first=await h.call('alpha','buyBusiness',input);
 assert.equal(first.replayed,false);
 assert.equal(first.cost,500);
 assert.equal(h.get('alpha').businesses.length,1);
 const second=await h.call('alpha','buyBusiness',input);
 assert.equal(second.replayed,true);
 assert.equal(second.cost,500);
 assert.equal(second.player.cash,first.player.cash);
 assert.equal(h.get('alpha').businesses.length,1);
 assert.equal(h.get('alpha').cash,1000);
});
test('concurrent duplicate business purchases commit only once',async()=>{
 const h=harness();await h.call('alpha','register');
 const input={businessId:'coffee',requestId:'same_buy_race_0001'};
 const outcomes=await Promise.all([h.call('alpha','buyBusiness',input),h.call('alpha','buyBusiness',input)]);
 assert.equal(outcomes.filter(p=>p.replayed===false).length,1);
 assert.equal(outcomes.filter(p=>p.replayed===true).length,1);
 assert.equal(h.get('alpha').cash,1000);
 assert.equal(h.get('alpha').businesses.length,1);
});
test('business upgrades are idempotent and cannot rerun with a reused request ID',async()=>{
 const h=harness();await h.call('alpha','register');
 await h.call('alpha','buyBusiness',{businessId:'coffee',requestId:'buy_to_upgrade_0001'});
 const requestId='upgrade_once_0001';
 const input={index:0,requestId};
 const first=await h.call('alpha','upgradeBusiness',input);
 assert.equal(first.replayed,false);
 assert.equal(first.player.businesses[0].level,2);
 const second=await h.call('alpha','upgradeBusiness',input);
 assert.equal(second.replayed,true);
 assert.equal(h.get('alpha').businesses[0].level,2);
 assert.equal(h.get('alpha').cash,125);
 await assert.rejects(h.call('alpha','buyBusiness',{businessId:'coffee',requestId}),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('alpha','upgradeBusiness',{index:1,requestId}),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('alpha','requestDefense',{requestId}),e=>e.code==='invalid-argument');
 assert.equal(h.get('alpha').cash,125);
});
test('purchase ID cannot be replayed as a different product',async()=>{
 const h=harness();await h.call('alpha','register');
 const requestId='shared_product_0001';
 await h.call('alpha','buyBusiness',{businessId:'coffee',requestId});
 await assert.rejects(h.call('alpha','buyBusiness',{businessId:'hotel',requestId}),e=>e.code==='invalid-argument');
 await assert.rejects(h.call('alpha','requestDefense',{requestId}),e=>e.code==='invalid-argument');
 assert.equal(h.get('alpha').businesses.length,1);
});

test('leaderboard and player directory reuse one cached roster snapshot',async()=>{
 const h=harness();
 await h.call('alpha','register');
 await h.call('beta','register');
 const results=await Promise.all([
  h.call('alpha','getLeaderboard',{period:'all'}),
  h.call('alpha','getPlayers'),
  h.call('alpha','getLeaderboard',{period:'day'})
 ]);
 assert.equal(results[0].length,2);
 assert.equal(results[1].length,1);
 assert.equal(h.db.rosterReads,1,'parallel online queries must share a single database scan');
 await h.call('alpha','getLeaderboard',{period:'week'});
 assert.equal(h.db.rosterReads,1,'rapid repeated queries should reuse cache');
 await h.call('alpha','buyBusiness',{businessId:'coffee',requestId:'cache_invalidation_001'});
 const after=await h.call('alpha','getLeaderboard',{period:'all'});
 assert.equal(after.length,2);
 assert.equal(h.db.rosterReads,2,'a successful purchase must invalidate the cached roster');
});
