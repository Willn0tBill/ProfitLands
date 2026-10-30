const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','account-trophies.js'),'utf8');

function firestore(){
 const docs=new Map([['player',{playerName:'Player',achievementBook:{version:1,ranks:{},counters:{},featured:[],recent:[]}}]]);
 const listeners=new Map();
 const snapshot=uid=>({exists:docs.has(uid),data:()=>docs.get(uid),metadata:{fromCache:false}});
 const notify=uid=>{for(const fn of listeners.get(uid)||[])fn(snapshot(uid))};
 const ref=uid=>({
  uid,get:async()=>snapshot(uid),
  onSnapshot(onValue){
   if(!listeners.has(uid))listeners.set(uid,new Set());
   listeners.get(uid).add(onValue);
   onValue(snapshot(uid));
   return()=>listeners.get(uid).delete(onValue);
  }
 });
 return{
  docs,listeners,collection:name=>{
   assert.equal(name,'users');
   return{doc:ref};
  },
  runTransaction:async callback=>{
   const updates=[];
   const result=await callback({
    get:async r=>snapshot(r.uid),
    set:(r,payload,options)=>{assert.equal(options.merge,true);updates.push({uid:r.uid,payload})}
   });
   for(const {uid,payload} of updates){
    docs.set(uid,{...(docs.get(uid)||{}),...payload});
    notify(uid);
   }
   return result;
  }
 };
}
function device(db,initial){
 const storageMap=new Map(),window={
  state:{started:true,badgeBook:initial||null},
  ProfitLandsBadges:{
   INDUSTRIES:[['coffee']],TRACKS:[{id:'highestLevel'},{id:'upgrades'}],render(){}
  },
  ProfitLandsWorkspace:{active:()=>''},addEventListener(){}
 };
 const localStorage={
  getItem:key=>storageMap.get(key)||null,
  setItem:(key,val)=>storageMap.set(key,String(val))
 };
 const ctx=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},
  localStorage,console,Date,setTimeout:()=>1,clearTimeout(){}});
 new vm.Script(source).runInContext(ctx);
 return{bridge:window.ProfitLandsAccountTrophies,window,storageMap,db};
}
async function login(d,uid='player'){
 d.bridge.prepare(uid);
 await d.bridge.onAuthChanged({uid},d.db);
}

test('two open devices receive higher achievements from Firestore without re-login',async()=>{
 const db=firestore(),a=device(db),b=device(db);
 await login(a);await login(b);
 a.window.state.badgeBook.ranks['coffee.highestLevel']=21;
 a.bridge.changed();assert.equal(await a.bridge.flush(),true);
 assert.equal(b.window.state.badgeBook.ranks['coffee.highestLevel'],21);
 assert.equal(db.docs.get('player').playerName,'Player');
 b.window.state.badgeBook.ranks['coffee.highestLevel']=30;
 b.bridge.changed();assert.equal(await b.bridge.flush(),true);
 assert.equal(a.window.state.badgeBook.ranks['coffee.highestLevel'],30);
});

test('removing a showcased badge syncs to another device without resurrecting it',async()=>{
 const db=firestore(),a=device(db),b=device(db);
 await login(a);await login(b);
 a.window.state.badgeBook.ranks['coffee.highestLevel']=5;
 a.window.state.badgeBook.featured=['coffee.highestLevel.1'];
 a.window.state.badgeBook.featuredAt=100;
 a.bridge.changed();await a.bridge.flush();
 assert.equal(b.window.state.badgeBook.featured[0],'coffee.highestLevel.1');
 b.window.state.badgeBook.featured=[];
 b.window.state.badgeBook.featuredAt=101;
 b.bridge.changed();await b.bridge.flush();
 assert.equal(a.window.state.badgeBook.featured.length,0);
 assert.equal(db.docs.get('player').achievementBook.featured.length,0);
});

test('signing out ends old-user updates and keeps the new account isolated',async()=>{
 const db=firestore(),d=device(db);
 await login(d);
 assert.equal(db.listeners.get('player').size,1);
 d.bridge.prepare('second');
 await d.bridge.onAuthChanged({uid:'second'},db);
 assert.equal(db.listeners.get('player').size,0);
 assert.equal(d.bridge.status().account,'account');
 assert.equal(d.window.state.badgeBook.ranks['coffee.highestLevel'],undefined);
 db.docs.get('player').achievementBook.ranks['coffee.highestLevel']=100;
 assert.equal(d.window.state.badgeBook.ranks['coffee.highestLevel'],undefined);
});

test('guest achievements transfer only after explicit import',async()=>{
 const db=firestore(),d=device(db);
 d.storageMap.set('profitlands-account-badges-v1:guest',JSON.stringify({
  version:1,ranks:{'coffee.highestLevel':17},counters:{},featured:[],recent:[]
 }));
 await login(d);
 assert.equal(d.window.state.badgeBook.ranks['coffee.highestLevel'],undefined);
 assert.equal(d.bridge.guestAvailable(),true);
 assert.equal(d.bridge.importGuest(),true);
 assert.equal(d.window.state.badgeBook.ranks['coffee.highestLevel'],17);
 await d.bridge.flush();
 assert.equal(db.docs.get('player').achievementBook.ranks['coffee.highestLevel'],17);
});

test('offline write failure keeps trophy progress locally for retry',async()=>{
 const db=firestore(),d=device(db);
 await login(d);
 d.window.state.badgeBook.ranks['coffee.highestLevel']=4;
 d.bridge.changed();
 const original=db.runTransaction;
 db.runTransaction=async()=>{throw Error('simulated offline')};
 assert.equal(await d.bridge.flush(),false);
 assert.equal(d.bridge.status().pending,true);
 assert.equal(JSON.parse(d.storageMap.get('profitlands-account-badges-v1:player')).ranks['coffee.highestLevel'],4);
 db.runTransaction=original;
 assert.equal(await d.bridge.flush(),true);
 assert.equal(db.docs.get('player').achievementBook.ranks['coffee.highestLevel'],4);
});
