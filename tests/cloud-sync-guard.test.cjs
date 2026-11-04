'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const guardCode=fs.readFileSync(path.join(root,'cloud-sync-guard.js'),'utf8');
const authCode=fs.readFileSync(path.join(root,'firebase-auth.js'),'utf8');
function empire(day=2,company='coffee'){
 return{saveVersion:4,started:true,mode:'standard',playType:'single',day,
  cash:day*1000,cashHuge:day+'e3',actions:50,timeLeft:350,dayEndsAt:Date.now()+350000,
  savedAt:Date.now(),businesses:[{type:company,name:'QA Business',level:day,locations:[{id:'downtown',level:day}]}],
  stocks:{nova:{shares:0}},news:['Started']};
}
function firestore(initial=null){
 const docs=new Map();
 if(initial)docs.set('users/player/saves/last-game',{state:JSON.parse(JSON.stringify(initial)),revision:0,saveVersion:4});
 docs.set('users/player',{playerName:'Player',companyName:'QA Co'});
 let failTransactions=false;
 const snapshot=key=>({exists:docs.has(key),data:()=>JSON.parse(JSON.stringify(docs.get(key)))});
 const ref=key=>({
  key,async get(){return snapshot(key)},
  async set(data,opts){
   docs.set(key,{...(opts?.merge?(docs.get(key)||{}):{}),...JSON.parse(JSON.stringify(data))})
  },
  collection(name){return{doc:id=>ref(key+'/'+name+'/'+id)}}
 });
 const db={
  collection:name=>({doc:id=>ref(name+'/'+id)}),
  runTransaction:async fn=>{
   if(failTransactions)throw Error('offline');
   const staged=[];
   const tx={
    get:async r=>snapshot(r.key),
    set:(r,data,opts)=>staged.push({key:r.key,data,opts})
   };
   const value=await fn(tx);
   for(const s of staged)docs.set(s.key,{...(s.opts?.merge?(docs.get(s.key)||{}):{}),...JSON.parse(JSON.stringify(s.data))});
   return value;
  }
 };
 return {db,docs,fail:v=>{failTransactions=v}};
}
function device(db,localSave=null,owner='player',base=''){
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{id,textContent:'',innerHTML:'',onclick:null,children:[],classList:{add(){},remove(){},contains:()=>false},appendChild(x){this.children.push(x)},remove(){},querySelector:()=>null,insertBefore(){}});
  return elements.get(id);
 };
 const memory=new Map();
 if(localSave)memory.set('profitlands-v2',JSON.stringify(localSave));
 if(owner)memory.set('profitlands-local-owner',owner);
 if(base)memory.set('profitlands-cloud-base-v1:player',base);
 const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,v)=>memory.set(key,String(v))};
 const state=JSON.parse(JSON.stringify(localSave||empire(1)));
 const window={
  state,PROFITLANDS_FIREBASE_CONFIG:{apiKey:'testkey'},
  addEventListener(name,fn){if(name==='load')window.load=fn},
  ProfitLandsMoney:{attach(){}},ProfitLandsBalance:{migrate(){}},
  restoreProfitLandsMarket(){},stopProfitLandsTimer(){},
  confirm:()=>true
 };
 const document={
  getElementById:element,querySelector:selector=>null,
  createElement:tag=>({tag,className:'',innerHTML:'',textContent:'',appendChild(){},remove(){},classList:{add(){},remove(){}}}),
  head:{appendChild(){}},body:{appendChild(){}}
 };
 let onAuthChanged=null,renderCount=0;
 const fireAuth={onAuthStateChanged:fn=>{onAuthChanged=fn}};
 const firestoreFn=()=>db;
 firestoreFn.FieldValue={serverTimestamp:()=>({serverTimestamp:true})};
 const firebase={initializeApp(){},auth:()=>fireAuth,firestore:firestoreFn};
 const ctx=vm.createContext({window,state,document,localStorage,firebase,console,Date,JSON,Math,Number,Set,
  render:()=>{renderCount++},setTimeout:()=>1,clearTimeout(){}});
 new vm.Script(guardCode,{filename:'cloud-sync-guard.js'}).runInContext(ctx);
 new vm.Script(authCode,{filename:'firebase-auth.js'}).runInContext(ctx);
 window.load();
 return{
  state,window,localStorage,memory,firestore:db,renderCount:()=>renderCount,
  login:async()=>onAuthChanged({uid:'player'}),
  save:()=>window.profitlandsFirebase.cloudSave(true),
  status:()=>window.profitlandsFirebase.cloudStatus(),
  resolve:choice=>window.profitlandsFirebase.resolveConflict(choice),
  guard:window.ProfitLandsCloudGuard
 };
}
test('fingerprints ignore timer fields, but distinguish meaningful empire changes',()=>{
 const d=device(firestore().db),guard=d.guard;
 const a=empire(3),b=JSON.parse(JSON.stringify(a));
 b.timeLeft=1;b.savedAt+=300;b.dayEndsAt+=300;b.started=false;
 assert.equal(guard.fingerprint(a),guard.fingerprint(b));
 b.businesses[0].locations[0].level++;
 assert.notEqual(guard.fingerprint(a),guard.fingerprint(b));
 assert.equal(guard.revision({revision:5}),5);
 assert.equal(guard.revision({revision:-8}),0);
});
test('comparing two changed saves requires a choice instead of timestamp-based overwrite',()=>{
 const d=device(firestore().db),g=d.guard;
 const local=empire(4),remote=empire(9);
 assert.equal(g.decide(local,remote,''),'conflict');
 assert.equal(g.decide(local,remote,g.fingerprint(local)),'cloud');
 assert.equal(g.decide(local,remote,g.fingerprint(remote)),'local');
 assert.equal(g.decide(local,local,'not-a-base'),'cloud');
 assert.equal(g.decide(null,remote,''),'cloud');
});
test('initial sign-in with divergent progress pauses upload and preserves both copies',async()=>{
 const existing=empire(9),database=firestore(existing);
 const d=device(database.db,empire(4),null);
 await d.login();
 assert.equal(d.status().blocked,true);
 assert.equal(d.status().conflict,true);
 assert.equal(database.docs.get('users/player/saves/last-game').state.day,9);
 assert.equal(d.state.day,4);
 assert.equal(await d.save(),false);
 assert.equal(d.memory.get('profitlands-v2')!==null,true);
 assert.match(d.window.profitlandsCloudConflict.account,/Day 9/);
});
test('two devices cannot silently overwrite a newer cloud revision',async()=>{
 const original=empire(2),database=firestore(original);
 const a=device(database.db,original,'player'),b=device(database.db,original,'player');
 await a.login();await b.login();
 assert.equal(a.status().revision,0);
 assert.equal(b.status().revision,0);
 a.state.day=3;a.state.cash=3000;
 assert.equal(await a.save(),true);
 assert.equal(database.docs.get('users/player/saves/last-game').revision,1);
 b.state.day=8;b.state.cash=8000;
 assert.equal(await b.save(),false);
 assert.equal(b.status().conflict,true);
 assert.equal(database.docs.get('users/player/saves/last-game').state.day,3,'second device cannot replace the first');
 assert.equal(database.docs.get('users/player/saves/last-game').revision,1);
 assert.equal(await b.save(),false,'further automatic writes stay blocked');
});
test('choosing the account save preserves local changes in a recovery copy',async()=>{
 const database=firestore(empire(14)),d=device(database.db,empire(7));
 await d.login();
 assert.equal(d.status().conflict,true);
 assert.equal(await d.resolve('cloud'),true);
 assert.equal(d.status().blocked,false);
 assert.equal(d.state.day,14);
 assert.equal(JSON.parse(d.memory.get('profitlands-v2-conflict-backup')).day,7);
 assert.equal(JSON.parse(d.memory.get('profitlands-v2')).day,14);
 assert.equal(database.docs.get('users/player/saves/last-game').state.day,14);
});
test('choosing this device writes via transaction, backs up the cloud, and increases revision',async()=>{
 const database=firestore(empire(15)),d=device(database.db,empire(6));
 await d.login();
 assert.equal(d.status().conflict,true);
 assert.equal(await d.resolve('local'),true);
 assert.equal(d.status().blocked,false);
 assert.equal(database.docs.get('users/player/saves/last-game').state.day,6);
 assert.equal(database.docs.get('users/player/saves/last-game').revision,1);
 assert.equal(JSON.parse(d.memory.get('profitlands-v2-conflict-backup')).day,15);
});
test('unavailable network leaves local progress and existing cloud unchanged',async()=>{
 const current=empire(5),database=firestore(current),d=device(database.db,current);
 await d.login();
 d.state.day=6;database.fail(true);
 assert.equal(await d.save(),false);
 assert.equal(database.docs.get('users/player/saves/last-game').state.day,5);
 assert.equal(d.state.day,6);
 assert.equal(d.status().conflict,false);
});
test('browser uses the cloud guard before Firebase auth without touching CrazyGames packaging',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('cloud-sync-guard.js')>0);
 assert.ok(html.indexOf('cloud-sync-guard.js')<html.indexOf('firebase-auth.js'));
 assert.ok(html.includes('../crazygames.js'),'existing CrazyGames adapter is still referenced');
});

test('account switching keeps the previous user snapshot available',async()=>{
 const db=firestore(empire(19));
 const d=device(db.db,empire(12),'another-user');
 await d.login();
 assert.equal(d.state.day,19);
 const saved=d.memory.get('profitlands-v2-previous-owner:another-user');
 assert.equal(JSON.parse(saved).day,12);
 assert.equal(d.memory.get('profitlands-local-owner'),'player');
});

test('a rejected backup write prevents a destructive cloud switch',async()=>{
 const db=firestore(empire(20));
 const d=device(db.db,empire(13),'player');
 await d.login();
 const prior=JSON.stringify(d.state);
 const originalSet=d.localStorage.setItem;
 d.localStorage.setItem=(key,value)=>{
   if(key==='profitlands-v2-conflict-backup')throw Error('Storage unavailable');
   originalSet(key,value);
 };
 assert.equal(await d.resolve('cloud'),false);
 assert.equal(JSON.stringify(d.state),prior);
 assert.equal(d.status().blocked,true);
});
