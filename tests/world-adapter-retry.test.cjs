'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','firebase-world-adapter.js'),'utf8');
let globalNonce=0;

function setup(failOnce=false,storage=null,{configured=true,healthIsPlaceholder=false,authRestoring=false}={}){
 const store=storage||new Map();
 const sent=[],events=[],callbacks={};
 let current=authRestoring?null:{uid:'alpha',getIdToken:async()=> 'signed-alpha'};
 let failure=typeof failOnce==='number'?failOnce:Number(Boolean(failOnce));
 const fakeFetch=async (url,options)=>{
  assert.equal(url,'https://profitlands-world1.demo.workers.dev/api');
  assert.equal(options.method,'POST');
  const payload=JSON.parse(options.body);
  sent.push(payload);
  if(payload.action==='health'){
   if(healthIsPlaceholder)return {ok:true,status:200,json:async()=>{throw Error('Hello World is not JSON')}};
   return answer({ok:true,worldId:'world1',chatEnabled:false,catalog:[{id:'coffee',cost:500}]});
  }
  assert.match(options.headers.Authorization,/^Bearer signed-/,'uses Firebase ID token, not a client cash value');
  if(payload.action==='register')return answer({player:{uid:current.uid}});
  if(['requestAttack','buyBusiness'].includes(payload.action)&&failure>0){
   failure--;
   return answer({error:{code:'unavailable',message:'Temporary outage'}},503);
  }
  return answer({ok:true,replayed:payload.action==='requestAttack'&&sent.filter(p=>p.action==='requestAttack').length>1});
 };
 const answer=(data,status=200)=>({ok:status===200,status,json:async()=>data});
 const userAuth={get currentUser(){return current},onAuthStateChanged:fn=>{callbacks.auth=fn}};
 const firebase={apps:[{}],auth:()=>userAuth};
 const sessionStorage={
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
 };
 const window={state:{playType:'multi'},sessionStorage,firebase,
  PROFITLANDS_WORLD1_ENDPOINT:configured?'https://profitlands-world1.demo.workers.dev':'',
  crypto:{getRandomValues:buffer=>{buffer.fill(++globalNonce)}},
  dispatchEvent:e=>events.push(e.type),
  addEventListener:(event,fn)=>{callbacks[event]=fn}
 };
 const document={getElementById:id=>id==='gameScreen'?{classList:{contains:s=>s==='active'}}:null};
 const CustomEvent=class{constructor(type){this.type=type}};
 vm.runInNewContext(source,{window,document,CustomEvent,Uint8Array,URL,
  fetch:fakeFetch,setTimeout,clearTimeout,AbortController,console});
 return {api:window.ProfitLandsOnline,window,events,callbacks,sent,store,
  changeUser:uid=>{current=uid?{uid,getIdToken:async()=> 'signed-'+uid}:null}};
}
test('client connects only with a matching authenticated account and a configured free Worker',async()=>{
 const h=setup();
 assert.equal(h.api.isConnected(),false);
 assert.equal(h.api.isConfigured(),true);
 assert.equal(await h.api.connect(),true);
 assert.equal(h.api.isConnected(),true);
 assert.equal(h.sent.filter(x=>x.action==='register').length,1);
 await h.api.connect();
 assert.equal(h.sent.filter(x=>x.action==='register').length,1);
 const notReady=setup(false,null,{configured:false});
 assert.equal(notReady.api.isConfigured(),false);
 await assert.rejects(notReady.api.connect(),/has not been deployed/);
});
test('a configured URL is not a ready server when Cloudflare still returns Hello World',async()=>{
 const h=setup(false,null,{healthIsPlaceholder:true});
 assert.equal(h.api.isConfigured(),true);
 assert.equal(await h.api.probe(),false);
 assert.equal(h.sent.filter(x=>x.action==='health').length,1);
 assert.equal(h.sent.some(x=>x.action==='register'),false);
 await assert.rejects(h.api.connect(),/not responding correctly|not serving World 1/);
 assert.equal(h.api.isConnected(),false);
 assert.equal(h.sent.some(x=>x.action==='register'),false);
});
test('ready probe checks server health once per interval, without Firebase identity data',async()=>{
 const h=setup();
 assert.equal(await h.api.probe(),true);
 assert.equal(await h.api.probe(),true);
 const probes=h.sent.filter(x=>x.action==='health');
 assert.equal(probes.length,1,'repeat renders should not flood free Worker requests');
 assert.equal(Object.hasOwn(probes[0],'token'),false);
 assert.equal(Object.hasOwn(probes[0],'cash'),false);
 const missing=setup(false,null,{configured:false});
 assert.equal(await missing.api.probe(),false);
 assert.equal(missing.sent.length,0);
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
 h.changeUser('newuser');
 await assert.rejects(h.api.requestAttack({targetUid:'beta',attackId:'supplier'}),/Connect to World 1 first/);
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
 assert.notEqual(future[3].requestId,old);
});
test('in-flight paid request ID survives reload and clears after confirmation',async()=>{
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
test('auth tokens never appear in outgoing JSON payloads or persistent storage',async()=>{
 const h=setup();await h.api.connect();await h.api.buyBusiness('coffee');
 assert.doesNotMatch(JSON.stringify(h.sent),/signed-alpha/);
 assert.equal([...h.store.values()].some(x=>String(x).includes('signed-alpha')),false);
 assert.match(source,/^.*getIdToken\(/m);
 assert.doesNotMatch(source,/httpsCallable/);
});

test('restored Firebase account can connect after asynchronous page hydration without another login',async()=>{
 const h=setup(false,null,{authRestoring:true});
 let resolveAuth;
 h.window.profitlandsFirebase={waitForAuth:()=>new Promise(resolve=>{resolveAuth=resolve})};
 const pending=h.api.connect();
 await Promise.resolve();
 assert.equal(h.sent.length,0,'do not call the Worker before Firebase restores the session');
 h.changeUser('alpha');
 resolveAuth({uid:'alpha'});
 assert.equal(await pending,true);
 assert.equal(h.api.isConnected(),true);
 assert.equal(h.sent.filter(x=>x.action==='register').length,1);
});
test('signed-out account is prompted only after Firebase confirms sign-out',async()=>{
 const h=setup(false,null,{authRestoring:true});
 let resolveAuth;
 h.window.profitlandsFirebase={waitForAuth:()=>new Promise(resolve=>{resolveAuth=resolve})};
 const pending=h.api.connect();
 await Promise.resolve();
 assert.equal(h.sent.length,0);
 resolveAuth(null);
 await assert.rejects(pending,/Please sign in to your ProfitLands account on this page/);
 assert.equal(h.sent.length,0,'do not register or send a token for signed-out players');
});
