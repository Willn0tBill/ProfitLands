const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'steam-achievement-map.js'),'utf8');
function harness({steamEnabled=true,ready=true}={}){
 let gets=0,sets=0,stores=0,allowStore=true;
 const unlocked=new Set();
 const bridge={
  ready,
  async getAchievement(name){gets++;return unlocked.has(name)},
  async setAchievement(name){sets++;return true},
  async storeStats(){stores++;return allowStore}
 };
 const window={
  profitLandsPlatform:{steamEnabled},
  ProfitLandsBadges:{rankAt:(sector,track)=>sector==='coffee'&&track==='highestLevel'?100:0},
  ProfitLandsSteamBridge:bridge,addEventListener(){}
 };
 const context=vm.createContext({window,console});
 new vm.Script(source).runInContext(context);
 return{api:window.ProfitLandsSteamAchievements,bridge,window,
  counts:()=>({gets,sets,stores}),setAllowStore:x=>{allowStore=x}};
}
test('website refuses native Steam commands even if injected scripts imitate a bridge',async()=>{
 const h=harness({steamEnabled:false});
 assert.equal(await h.api.connect(h.bridge),false);
 assert.equal(h.api.connected,false);
 assert.equal(h.counts().gets,0);
});
test('native Steam bridge unlocks curated achievements and batches their store',async()=>{
 const h=harness();
 assert.equal(await h.api.connect(h.bridge),true);
 assert.equal(h.api.connected,true);
 assert.equal(h.counts().sets,2);
 assert.equal(h.counts().stores,1);
 assert.equal(await h.api.sync(),true);
 assert.equal(h.counts().sets,2,'a successful upload is not repeated in a session');
 assert.equal(h.counts().stores,1);
 h.api.disconnect();
 assert.equal(h.api.connected,false);
});
test('a failed Steam store is retried rather than falsely considered confirmed',async()=>{
 const h=harness();
 h.setAllowStore(false);
 assert.equal(await h.api.connect(h.bridge),false);
 assert.equal(h.counts().stores,1);
 h.setAllowStore(true);
 assert.equal(await h.api.sync(),true);
 assert.equal(h.counts().stores,2);
 assert.equal(h.counts().sets,4);
});
test('native implementation restricts IPC and hides Node.js from game renderer',()=>{
 const main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8');
 const platform=fs.readFileSync(path.join(root,'platform.js'),'utf8');
 assert.ok(main.includes("allowed.has(name)"));
 assert.ok(main.includes('nodeIntegration:false'));
 assert.ok(main.includes('contextIsolation:true'));
 assert.ok(preload.includes('contextBridge.exposeInMainWorld'));
 assert.ok(platform.includes('steamEnabled:'));
});
