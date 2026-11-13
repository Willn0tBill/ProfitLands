'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../firebase-auth.js'),'utf8');
function device(shared,choice='cloud'){
 const events={},storage=new Map(),user={uid:'qa-user'};let callback;
 const doc=id=>({get:async()=>({exists:!!shared[id],data:()=>structuredClone(shared[id])}),set:async value=>{shared[id]={...shared[id],...structuredClone(value)}},collection:()=>({doc})});
 const db={collection:()=>({doc}),runTransaction:async fn=>{const writes=[];const tx={get:ref=>ref.get(),set:(ref,v)=>writes.push([ref,v])};await fn(tx);for(const [ref,v] of writes)await ref.set(v)}};
 const auth={onAuthStateChanged:fn=>callback=fn};
 const firebase={initializeApp(){},auth:()=>auth,firestore:()=>db};firebase.firestore.FieldValue={serverTimestamp:()=>({seconds:1})};
 const state={mode:'standard',playType:'single',day:1,cash:1000,started:true,savedAt:100};
 const ctx={window:{ProfitLandsCloudRecovery:{choose:async()=>choice},PROFITLANDS_FIREBASE_CONFIG:{apiKey:'qa'},addEventListener:(k,fn)=>events[k]=fn,dispatchEvent(){},ProfitLandsMoney:{attach(){}},ProfitLandsBalance:{migrate(){}}},firebase,state,document:{getElementById:()=>null,querySelector:()=>null,head:{appendChild(){}},createElement:()=>({})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console:{warn(){},error(){}},Event:class{},setTimeout,clearTimeout,render(){},netWorth:()=>1000};
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

test('player can explicitly keep device progress and preserves previous cloud backup',async()=>{
 const shared={},a=device(shared),b=device(shared);await a.login();await b.login();
 a.state.day=5;assert.equal(await a.save(),true);
 b.state.day=8;assert.equal(await b.save(),false);
 const c=device(shared,'local');
 c.storage.set('profitlands-v2',JSON.stringify({...b.state,savedAt:800}));
 c.storage.set('profitlands-cloud-conflict-owner','qa-user');
 await c.login();
 assert.equal(c.state.day,8);
 assert.equal(shared['last-game'].state.day,8);
 assert.equal(shared['last-game'].revision,2);
 assert.equal(JSON.parse(c.storage.get('profitlands-conflict-cloud-backup-qa-user')).day,5);
 assert.equal(JSON.parse(c.storage.get('profitlands-conflict-backup-qa-user')).day,8);
 assert.equal(c.storage.has('profitlands-cloud-conflict-owner'),false);
});

test('deferring conflict preserves marker and pauses automatic cloud writes',async()=>{
 const shared={},a=device(shared),b=device(shared);await a.login();await b.login();
 a.state.day=4;await a.save();
 b.state.day=9;assert.equal(await b.save(),false);
 const c=device(shared,'later');
 c.storage.set('profitlands-v2',JSON.stringify({...b.state,savedAt:900}));
 c.storage.set('profitlands-cloud-conflict-owner','qa-user');
 await c.login();
 assert.equal(c.ctx.window.profitlandsCloudConflict,true);
 assert.equal(c.storage.get('profitlands-cloud-conflict-owner'),'qa-user');
 assert.equal(JSON.parse(c.storage.get('profitlands-conflict-backup-qa-user')).day,9);
 assert.equal(await c.save(),false);
 assert.equal(shared['last-game'].state.day,4);
});

test('failed device backup refuses recovery rather than risking progress loss',async()=>{
 const shared={},a=device(shared);await a.login();a.state.day=6;await a.save();
 const c=device(shared,'cloud');
 c.storage.set('profitlands-v2',JSON.stringify({...c.state,day:12,savedAt:1200}));
 c.storage.set('profitlands-cloud-conflict-owner','qa-user');
 const original=c.ctx.localStorage.setItem;
 c.ctx.localStorage.setItem=(k,v)=>{if(k==='profitlands-conflict-backup-qa-user')throw Error('quota');original(k,v)};
 await c.login();
 assert.equal(c.ctx.window.profitlandsCloudConflict,true);
 assert.equal(c.storage.get('profitlands-cloud-conflict-owner'),'qa-user');
 assert.equal(shared['last-game'].state.day,6);
});

test('cloud modification while choice is open is not overwritten by local recovery',async()=>{
 const shared={},a=device(shared);await a.login();a.state.day=5;await a.save();
 const c=device(shared,'local');
 c.storage.set('profitlands-v2',JSON.stringify({...c.state,day:7,savedAt:700}));
 c.storage.set('profitlands-cloud-conflict-owner','qa-user');
 c.ctx.window.ProfitLandsCloudRecovery.choose=async()=>{
  shared['last-game'].revision+=1;
  shared['last-game'].state.day=11;
  return 'local';
 };
 await c.login();
 assert.equal(shared['last-game'].state.day,11);
 assert.equal(c.ctx.window.profitlandsCloudConflict,true);
 assert.equal(c.storage.get('profitlands-cloud-conflict-owner'),'qa-user');
});

test('save choice UI is included before the cloud auth module and describes safe options',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../play/index.html'),'utf8');
 const picker=fs.readFileSync(path.join(__dirname,'../cloud-recovery.js'),'utf8');
 assert.ok(html.indexOf('cloud-recovery.js')<html.indexOf('firebase-auth.js'));
 assert.match(picker,/Keep this device/);
 assert.match(picker,/Use cloud empire/);
 assert.match(picker,/Decide later/);
 assert.match(picker,/aria-modal/);
});
