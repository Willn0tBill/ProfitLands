const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../challenge-center.js'),'utf8');
function harness(){
 const state={started:true,playType:'single',cash:1000,businesses:[{locationManagementVersion:1,locations:[{workers:3},{workers:0}]}],news:[]};
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

test('daily rotation selects exactly one bonus contract and one business decision',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 const today=h.api.status(day),tomorrow=h.api.status(day+86400000);
 assert.equal(today.contracts.length,4);
 assert.notEqual(today.contracts[3].id,tomorrow.contracts[3].id);
 assert.notEqual(today.event.id,tomorrow.event.id);
});
test('business choice pays once, rejects repeats and resets on the next day',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(h.api.decide(0,day),true);
 assert.equal(h.api.decide(0,day),false);
 assert.equal(h.state.challengeCenter.eventChoice,0);
 assert.equal(h.api.decide(1,day+86400000),true);
});
test('business choice cannot spend more cash than available',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 h.state.cash=0;
 assert.equal(h.api.decide(0,day),false);
 assert.equal(h.api.decide(1,day),true);
});

test('business decisions charge upfront without guaranteed cash payouts',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 const startingCash=h.state.cash;
 assert.equal(h.api.decide(0,day),true);
 const event=h.api.dailyEvent(day),choice=event.options[0];
 assert.equal(h.state.cash,startingCash-choice.cost);
 assert.equal(h.gained(),0);
 assert.equal(h.api.decisionEffect(day+1000).id,event.id);
 assert.equal(h.api.decisionEffect(day+300001),null);
});
test('daily decision is disabled in multiplayer and after expiry',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(h.api.decide(0,day),true);
 h.state.playType='multi';
 assert.equal(h.api.decisionEffect(day+1000),null);
 assert.equal(h.api.decide(1,day),false);
});
