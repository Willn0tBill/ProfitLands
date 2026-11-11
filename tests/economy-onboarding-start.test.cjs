'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../economy-system.js'),'utf8');

function economyReset(playType='single'){
 const from=source.indexOf('  function reset(mode,type){');
 const to=source.indexOf('  function doEndDay(',from);
 assert.ok(from>=0&&to>from,'real-time economy reset is available');
 const snippet=source.slice(from,to);
 const state={mode:'standard',playType,country:'us',difficulty:'executive'};
 const window={
  resetProfitLandsMarket(){},
  ProfitLandsMoney:{attach(){}},
  ProfitLandsDifficulty:{byId:()=>({startCash:1000}),current:()=>({name:'Executive'})},
  ProfitLandsCountry:{byId:()=>({loanRate:0.08}),current:()=>({name:'US'}),resetFiscal(){}}
 };
 const ctx=vm.createContext({state,window,STOCKS:[{id:'nova'}],MODES:{standard:{actions:60,daySeconds:900}},money:n=>'$'+n,save(){}});
 new vm.Script(snippet+'\nreset("standard",'+JSON.stringify(playType)+');').runInContext(ctx);
 return state;
}
test('real-time new solo empire enables guided workspace progression',()=>{
 const state=economyReset('single');
 assert.equal(state.started,true);
 assert.equal(state.onboardingVersion,1);
 assert.equal(state.onboardingDismissed,false);
 assert.equal(state.businesses.length,0);
 assert.equal(state.day,1);
});
test('real-time reset never unlocks guided singleplayer state in multiplayer',()=>{
 const state=economyReset('multi');
 assert.equal(state.onboardingVersion,0);
 assert.equal(state.onboardingDismissed,false);
});
test('overridden real-time startup syncs workspace after reset',()=>{
 const marker=source.indexOf('    const originalStart=window.startProfitLands;');
 const reset=source.indexOf('      reset(state.mode,state.playType);',marker);
 const sync=source.indexOf('      window.ProfitLandsWorkspace?.syncMode?.();',reset);
 const screen=source.indexOf("      document.getElementById('gameScreen')?.classList.add('active');",reset);
 assert.ok(marker>=0&&reset>marker&&sync>reset&&screen>sync,'workspace locks must refresh before the game is shown');
});

test('new gameplay reset stays guidance-aware without deleting account trophies',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.ok(app.includes("state.onboardingVersion=type==='multi'?0:1"));
 assert.ok(app.includes('state.onboardingDismissed=false'));
 assert.ok(app.includes('state.started=true;window.ProfitLandsWorkspace?.syncMode?.()'));
 const economy=fs.readFileSync(path.join(__dirname,'../economy-system.js'),'utf8');
 assert.ok(economy.includes('window.ProfitLandsWorkspace?.refreshGuidance?.()'));
 assert.ok(economy.includes('state.arcade=null;state.onboardingVersion='));
});
