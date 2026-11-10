'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../firebase-auth.js'),'utf8');
function device(shared){
 const events={},storage=new Map(),user={uid:'qa-user'};let callback;
 const doc=id=>({get:async()=>({exists:!!shared[id],data:()=>structuredClone(shared[id])}),set:async value=>{shared[id]={...shared[id],...structuredClone(value)}},collection:()=>({doc})});
 const db={collection:()=>({doc}),runTransaction:async fn=>{const writes=[];const tx={get:ref=>ref.get(),set:(ref,v)=>writes.push([ref,v])};await fn(tx);for(const [ref,v] of writes)await ref.set(v)}};
 const auth={onAuthStateChanged:fn=>callback=fn};
 const firebase={initializeApp(){},auth:()=>auth,firestore:()=>db};firebase.firestore.FieldValue={serverTimestamp:()=>({seconds:1})};
 const state={mode:'standard',playType:'single',day:1,cash:1000,started:true,savedAt:100};
 const ctx={window:{PROFITLANDS_FIREBASE_CONFIG:{apiKey:'qa'},addEventListener:(k,fn)=>events[k]=fn,dispatchEvent(){},ProfitLandsMoney:{attach(){}},ProfitLandsBalance:{migrate(){}}},firebase,state,document:{getElementById:()=>null,querySelector:()=>null,head:{appendChild(){}},createElement:()=>({})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console:{warn(){},error(){}},Event:class{},setTimeout,clearTimeout,render(){},netWorth:()=>1000};
 vm.createContext(ctx);vm.runInContext(code,ctx);events.load();
 return {ctx,state,storage,login:()=>callback(user),save:()=>ctx.window.profitlandsFirebase.cloudSave(true)};
}
test('stale second device cannot overwrite latest save',async()=>{
 const shared={},a=device(shared),b=device(shared);await a.login();await b.login();
 a.state.day=5;assert.equal(await a.save(),true);
 b.state.day=8;assert.equal(await b.save(),false);
 assert.equal(shared['last-game'].state.day,5);
 assert.equal(b.ctx.window.profitlandsCloudConflict,true);
});
test('sequential saves advance revision',async()=>{
 const shared={},a=device(shared);await a.login();
 a.state.day=2;assert.equal(await a.save(),true);
 a.state.day=3;assert.equal(await a.save(),true);
 assert.equal(shared['last-game'].revision,2);
 assert.equal(shared['last-game'].state.day,3);
});

test('conflicted device preserves its local recovery copy on reload',async()=>{
 const shared={},a=device(shared),b=device(shared);await a.login();await b.login();
 a.state.day=5;assert.equal(await a.save(),true);
 b.state.day=8;assert.equal(await b.save(),false);
 b.storage.set('profitlands-v2',JSON.stringify({...b.state,savedAt:800}));
 const c=device(shared);c.storage.set('profitlands-v2',b.storage.get('profitlands-v2'));
 c.storage.set('profitlands-cloud-conflict-owner','qa-user');
 await c.login();
 assert.equal(c.state.day,5);
 assert.equal(JSON.parse(c.storage.get('profitlands-conflict-backup-qa-user')).day,8);
 assert.equal(c.storage.get('profitlands-cloud-conflict-owner'),undefined);
});
