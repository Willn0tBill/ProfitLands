const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../challenge-center.js'),'utf8');
function harness(){
 const state={started:true,playType:'single',cash:1000,businesses:[{locations:[{workers:3},{workers:0}]}],news:[]};
 const root={innerHTML:'',addEventListener(){}};
 let saved=0,gained=0;
 const window={state,ProfitLandsMoney:{gain:n=>{gained+=n;state.cash+=n},format:n=>'$'+n},save(){saved++},render(){},addEventListener(){}};
 const document={readyState:'loading',getElementById:id=>id==='challengeCenter'?root:null,addEventListener(){}};
 vm.runInNewContext(code,{window,document,Date,Math,Number,console});
 return {api:window.ProfitLandsChallengeCenter,state,gained:()=>gained,saved:()=>saved,root};
}
test('daily contracts pay exactly once each and persist claims',()=>{
 const h=harness(),now=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(h.api.claim('starter',now),true);
 assert.equal(h.api.claim('starter',now),false);
 assert.equal(h.api.claim('crew',now),true);
 assert.equal(h.api.claim('branches',now),true);
 assert.equal(h.gained(),375);
 assert.equal(h.saved(),3);
 assert.equal(h.state.challengeCenter.claimed.length,3);
});
test('contracts reset on next UTC day but not same day',()=>{
 const h=harness(),first=Date.parse('2026-11-10T12:00:00Z');
 h.api.claim('starter',first);
 assert.equal(h.api.claim('starter',first+1000),false);
 assert.equal(h.api.claim('starter',first+86400000),true);
 assert.equal(h.gained(),200);
});
test('unmet contracts cannot be claimed and multiplayer is excluded',()=>{
 const h=harness(),now=Date.now();
 h.state.businesses=[];
 assert.equal(h.api.claim('starter',now),false);
 h.state.businesses=[{locations:[{workers:3}]}];
 h.state.playType='multi';
 assert.equal(h.api.claim('starter',now),false);
 assert.equal(h.gained(),0);
});
