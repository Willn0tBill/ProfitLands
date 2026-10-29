const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'account-trophies.js'),'utf8');
function harness(){
 const saved=new Map();let saves=0;
 const state={cash:5234,actions:60,started:true,badgeBook:{
  version:1,ranks:{'coffee.highestLevel':4},counters:{'coffee.upgrades':9},
  featured:['coffee.highestLevel.1'],recent:[]}};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v))};
 const sourceDoc={playerName:'Test player',companyName:'Test company',achievementBook:{
  version:1,ranks:{'coffee.highestLevel':8},counters:{'coffee.upgrades':10},featured:['coffee.highestLevel.8'],recent:[]}};
 const otherDoc={playerName:'Second player',achievementBook:{
  version:1,ranks:{'coffee.highestLevel':2},counters:{},featured:[],recent:[]}};
 const dbDocs=new Map([['first',sourceDoc],['other',otherDoc]]);
 function ref(uid){return{uid,get:async()=>({exists:dbDocs.has(uid),data:()=>dbDocs.get(uid)})}}
 const db={collection:name=>{assert.equal(name,'users');return{doc:ref}},
  runTransaction:async callback=>{
   const queued=[];
   const txn={
    get:async r=>({exists:dbDocs.has(r.uid),data:()=>dbDocs.get(r.uid)}),
    set:(r,payload,options)=>{assert.equal(options.merge,true);queued.push({uid:r.uid,payload})}
   };
   const outcome=await callback(txn);
   for(const w of queued)dbDocs.set(w.uid,{...(dbDocs.get(w.uid)||{}),...w.payload});
   return outcome;
  }};
 for(const uid of ['first','other']){} // Both account profiles already exist.
 const window={state,ProfitLandsBadges:{
   INDUSTRIES:[['coffee'],['restaurant']],
   TRACKS:[{id:'highestLevel'},{id:'upgrades'}],
   render(){saves++}
  },ProfitLandsWorkspace:{active:()=>''},addEventListener(){}};
 const document={readyState:'loading',addEventListener(){},visibilityState:'visible'};
 const ctx=vm.createContext({window,document,localStorage:storage,setTimeout:()=>123,clearTimeout(){},console,Date});
 new vm.Script(source).runInContext(ctx);
 return{bridge:window.ProfitLandsAccountTrophies,window,storage,saved,db,dbDocs,
  sourceDoc,otherDoc,saves:()=>saves};
}
test('merge preserves the highest earned per-track rank and avoids double-counting lifetime events',()=>{
 const h=harness(),m=h.bridge.merge({
  ranks:{'coffee.highestLevel':5},counters:{'coffee.upgrades':100},
  featured:['coffee.highestLevel.1']
 },{ranks:{'coffee.highestLevel':9},counters:{'coffee.upgrades':101},
  featured:['coffee.highestLevel.9']});
 assert.equal(m.ranks['coffee.highestLevel'],9);
 assert.equal(m.counters['coffee.upgrades'],101);
 assert.equal(m.featured.length,2);
});
test('account login merges older empire progress with cloud profile without changing money or actions',async()=>{
 const h=harness();
 h.bridge.prepare('first');
 // Cloud save populated state.badgeBook before account hook.
 h.window.state.badgeBook={version:1,ranks:{'coffee.highestLevel':6},
  counters:{'coffee.upgrades':15},featured:[],recent:[]};
 await h.bridge.onAuthChanged({uid:'first'},h.db);
 assert.equal(h.window.state.badgeBook.ranks['coffee.highestLevel'],8);
 assert.equal(h.window.state.badgeBook.counters['coffee.upgrades'],15);
 assert.equal(h.window.state.cash,5234);
 assert.equal(h.window.state.actions,60);
 assert.equal(h.bridge.status().loggedIn,true);
 assert.equal(h.bridge.status().pending,true);
 await h.bridge.flush();
 assert.equal(h.dbDocs.get('first').achievementBook.counters['coffee.upgrades'],15);
 assert.equal(h.dbDocs.get('first').playerName,'Test player','merge must not destroy other profile fields');
 assert.equal(h.bridge.status().synced,true);
});
test('each user account has isolated trophy progress on a shared device',async()=>{
 const h=harness();
 h.bridge.prepare('first');await h.bridge.onAuthChanged({uid:'first'},h.db);
 await h.bridge.flush();
 h.bridge.prepare('other');
 assert.equal(h.window.state.badgeBook,null);
 await h.bridge.onAuthChanged({uid:'other'},h.db);
 assert.equal(h.window.state.badgeBook.ranks['coffee.highestLevel'],2);
 assert.equal(h.window.state.badgeBook.counters['coffee.upgrades'],undefined);
 await h.bridge.flush();
 assert.equal(h.dbDocs.get('other').achievementBook.ranks['coffee.highestLevel'],2);
 assert.equal(h.dbDocs.get('first').achievementBook.ranks['coffee.highestLevel'],8);
});
test('guest trophies are saved locally and are separate from account progress',async()=>{
 const h=harness();
 await h.bridge.onAuthChanged(null,null);
 assert.equal(h.bridge.status().account,'guest');
 assert.equal(h.bridge.changed(),undefined);
 const guestKey='profitlands-account-badges-v1:guest';
 assert.ok(h.saved.has(guestKey));
 h.bridge.prepare('first');await h.bridge.onAuthChanged({uid:'first'},h.db);
 assert.equal(h.window.state.badgeBook.ranks['coffee.highestLevel'],8);
 assert.ok(h.saved.has('profitlands-account-badges-v1:first'));
});
test('invalid rank keys and forged featured entries are ignored during cloud merge',()=>{
 const h=harness();
 const cleaned=h.bridge.clean({ranks:{'coffee.highestLevel':99999,'fake.track':12},
 counters:{'fake.stuff':99,'coffee.upgrades':1e200},
 featured:['fake.track.2','coffee.highestLevel.99999'],recent:[]});
 assert.equal(cleaned.ranks['coffee.highestLevel'],1024);
 assert.equal(cleaned.ranks['fake.track'],undefined);
 assert.equal(cleaned.counters['fake.stuff'],undefined);
 const merged=h.bridge.merge(cleaned);
 assert.equal(merged.featured.length,0);
});
test('new game preserves personal badges and authenticated ownership uses existing user Firestore document',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const auth=fs.readFileSync(path.join(root,'firebase-auth.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(!app.includes('state.badgeBook=null'));
 assert.ok(!economy.includes('state.badgeBook=null'));
 assert.ok(auth.includes('ProfitLandsAccountTrophies?.onAuthChanged'));
 assert.ok(auth.includes('ProfitLandsAccountTrophies?.prepare'));
 assert.ok(html.includes('account-trophies.js'));
 assert.ok(html.includes('steam-achievement-map.js'));
});
test('Steam starter list offers 100 mapped badge identifiers and no live Steam API calls',()=>{
 const steam=fs.readFileSync(path.join(root,'steam-achievement-map.js'),'utf8');
 const ctx=vm.createContext({window:{}});
 new vm.Script(steam).runInContext(ctx);
 const list=ctx.window.ProfitLandsSteamAchievements.achievements;
 assert.equal(list.length,100);
 assert.equal(new Set(list.map(x=>x.apiName)).size,100);
 assert.equal(new Set(list.map(x=>x.badgeId)).size,100);
 assert.equal(ctx.window.ProfitLandsSteamAchievements.connected,false);
 assert.ok(!steam.includes('SteamUserStats'));
});
