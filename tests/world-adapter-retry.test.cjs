'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','firebase-world-adapter.js'),'utf8');

let globalNonce=0;
function setup(failOnce=false,storage=null){
 const store=storage||new Map();
 const sent=[],events=[],callbacks={};
 let current={uid:'alpha'},failure=typeof failOnce==='number'?failOnce:Number(Boolean(failOnce));
 const callable=async payload=>{
  sent.push(payload);
  if(payload.action==='health')return {data:{ok:true,worldId:'world1',chatEnabled:false,catalog:[{id:'coffee',cost:500}]}};
  if(payload.action==='register')return {data:{player:{uid:current.uid}}};
  if((payload.action==='requestAttack'||payload.action==='buyBusiness')&&failure>0){
   failure--;
   throw {code:'functions/unavailable',message:'Temporary outage'};
  }
  return {data:{ok:true,replayed:payload.action==='requestAttack'&&sent.filter(p=>p.action==='requestAttack').length>1}};
 };
 const userAuth={get currentUser(){return current},onAuthStateChanged:fn=>{callbacks.auth=fn}};
 const firebase={
  apps:[{}],auth:()=>userAuth,functions:()=>{},
  app:()=>({functions:()=>({httpsCallable:()=>callable})})
 };
 const sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
 const window={state:{playType:'multi'},sessionStorage,
  crypto:{getRandomValues:buffer=>{buffer.fill(++globalNonce)}},
  dispatchEvent:e=>events.push(e.type),
  addEventListener:(event,fn)=>{callbacks[event]=fn}
 };
 const document={getElementById:id=>id==='gameScreen'?{classList:{contains:s=>s==='active'}}:null};
 const CustomEvent=class{constructor(type){this.type=type}};
 vm.runInNewContext(source,{window,document,firebase,CustomEvent,Uint8Array,console});
 return {api:window.ProfitLandsOnline,window,events,callbacks,sent,store,changeUser:user=>{current=user}};
}
test('client connects only with a matching authenticated account',async()=>{
 const h=setup();
 assert.equal(h.api.isConnected(),false);
 assert.equal(await h.api.connect(),true);
 assert.equal(h.api.isConnected(),true);
 assert.equal(h.sent.filter(x=>x.action==='register').length,1);
 await h.api.connect();
 assert.equal(h.sent.filter(x=>x.action==='register').length,1);
});
test('ambiguous PvP transport errors reuse the same ID and do not disconnect',async()=>{
 const h=setup(true);await h.api.connect();
 const response=await h.api.requestAttack({targetUid:'beta',attackId:'supplier'});
 assert.equal(response.ok,true);
 const calls=h.sent.filter(x=>x.action==='requestAttack');
 assert.equal(calls.length,2);
 assert.equal(calls[0].requestId,calls[1].requestId);
 assert.ok(/^[0-9a-f]{32}$/.test(calls[0].requestId));
 assert.equal(h.api.isConnected(),true);
});
test('session changes prevent a retry from being sent as another user',async()=>{
 const h=setup(true);await h.api.connect();
 // Underlying request can rotate the auth user while the first call is failing.
 const api=h.api;
 // Simulate a session becoming invalid before an action is started.
 h.changeUser({uid:'newuser'});
 await assert.rejects(api.requestAttack({targetUid:'beta',attackId:'supplier'}),/Connect to World 1 first/);
 assert.equal(h.sent.filter(x=>x.action==='requestAttack').length,0);
});
test('server money APIs never accept client-provided cash or rankings',async()=>{
 const h=setup();await h.api.connect();
 await h.api.buyBusiness('coffee');
 await h.api.upgradeBusiness(0);
 await h.api.getLeaderboard('day');
 const buys=h.sent.filter(x=>x.action==='buyBusiness');
 const upgrades=h.sent.filter(x=>x.action==='upgradeBusiness');
 assert.equal(buys[0].businessId,'coffee');
 assert.equal(Object.hasOwn(buys[0],'cash'),false);
 assert.equal(upgrades[0].index,0);
 assert.equal(h.sent.find(x=>x.action==='getLeaderboard').period,'day');
});
test('chat remains disabled without backend moderation',async()=>{
 const h=setup();await h.api.connect();
 assert.equal(h.api.chatEnabled(),false);
 await assert.rejects(h.api.sendChat('hello'),/disabled/);
 await assert.rejects(h.api.reportMessage('one'),/disabled/);
 assert.equal(h.sent.filter(x=>x.action==='sendChat'||x.action==='reportMessage').length,0);
});

test('business purchase reuses a stable request ID after a temporary network loss',async()=>{
 const h=setup(1);await h.api.connect();
 await h.api.buyBusiness('coffee');
 const buys=h.sent.filter(x=>x.action==='buyBusiness');
 assert.equal(buys.length,2);
 assert.equal(buys[0].requestId,buys[1].requestId);
 assert.equal(buys[0].businessId,'coffee');
});
test('double transport failures preserve the ID for the next deliberate retry',async()=>{
 const h=setup(2);await h.api.connect();
 await assert.rejects(h.api.buyBusiness('coffee'),/Temporary outage/);
 const attempts=h.sent.filter(x=>x.action==='buyBusiness');
 assert.equal(attempts.length,2);
 const old=attempts[0].requestId;
 await h.api.buyBusiness('coffee');
 const final=h.sent.filter(x=>x.action==='buyBusiness');
 assert.equal(final[2].requestId,old);
 await h.api.buyBusiness('coffee');
 const future=h.sent.filter(x=>x.action==='buyBusiness');
 assert.notEqual(future[3].requestId,old,'A confirmed new purchase needs a new transaction ID');
});

test('in-flight paid request ID survives reload and is cleared after confirmation',async()=>{
 const sharedStore=new Map();
 const first=setup(2,sharedStore);
 await first.api.connect();
 await assert.rejects(first.api.buyBusiness('coffee'),/Temporary outage/);
 const original=first.sent.find(x=>x.action==='buyBusiness').requestId;
 assert.equal(sharedStore.size,1);
 const reloaded=setup(false,sharedStore);
 await reloaded.api.connect();
 await reloaded.api.buyBusiness('coffee');
 assert.equal(reloaded.sent.find(x=>x.action==='buyBusiness').requestId,original);
 assert.equal(sharedStore.size,0);
 await reloaded.api.buyBusiness('coffee');
 assert.notEqual(reloaded.sent.filter(x=>x.action==='buyBusiness')[1].requestId,original);
});
