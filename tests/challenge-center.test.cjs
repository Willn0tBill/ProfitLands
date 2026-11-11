const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../challenge-center.js'),'utf8');
function harness(){
 const state={started:true,playType:'single',cash:1000,businesses:[{locationManagementVersion:1,locations:[{workers:3},{workers:0}]}],news:[]};
 const root={innerHTML:'',addEventListener(){}};
 const summary={textContent:''};
 const title={textContent:''},detail={textContent:''};
 const statusBox={querySelector:tag=>tag==='strong'?title:tag==='span'?detail:null};
 let saved=0,gained=0;
 const window={state,ProfitLandsWorkspace:{active:()=> 'arcade'},ProfitLandsMoney:{gain:n=>{gained+=n;state.cash+=n},format:n=>'$'+n},save(){saved++},render(){},addEventListener(){}};
 const document={readyState:'loading',visibilityState:'visible',getElementById:id=>id==='challengeCenter'?root:id==='challengeSummaryStatus'?summary:id==='challengePowerupStatus'?statusBox:null,addEventListener(){}};
 vm.runInNewContext(code,{window,document,Date,Math,Number,console});
 return {api:window.ProfitLandsChallengeCenter,window,state,gained:()=>gained,saved:()=>saved,root,summary,title,detail};
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
 assert.equal(h.api.decisionEffect(day+450001),null);
});
test('daily decision is disabled in multiplayer and after expiry',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(h.api.decide(0,day),true);
 h.state.playType='multi';
 assert.equal(h.api.decisionEffect(day+1000),null);
 assert.equal(h.api.decide(1,day),false);
});

test('wealth tiers scale duration and lock it at activation',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(h.api.wealthDuration(9999),450000);
 assert.equal(h.api.wealthDuration(10000),375000);
 assert.equal(h.api.wealthDuration(100000),300000);
 assert.equal(h.api.wealthDuration(1000000),255000);
 assert.equal(h.api.wealthDuration(100000000),225000);
 assert.equal(h.api.decide(0,day),true);
 assert.equal(h.state.challengeCenter.eventDuration,450000);
 h.state.cash=1000000000;
 assert.equal(h.api.decisionEffect(day+300000).remainingMs,150000);
});

test('balanced strategy decisions persist bounded business reputation without duplicate rewards',()=>{
 const h=harness(),day=Date.parse('2026-11-11T12:00:00Z');
 const event=h.api.dailyEvent(day),change=event.options[0].reputation||0;
 h.state.businesses[0].reputation=99;
 assert.equal(h.api.decide(0,day),true);
 assert.equal(h.state.businesses[0].reputation,Math.min(100,99+change));
 assert.equal(h.api.decide(0,day),false);
 assert.equal(h.state.businesses[0].reputation,Math.min(100,99+change));
});
test('reputation choices cannot mutate businesses in multiplayer',()=>{
 const h=harness(),day=Date.parse('2026-11-11T12:00:00Z');
 h.state.businesses[0].reputation=50;
 h.state.playType='multi';
 assert.equal(h.api.decide(0,day),false);
 assert.equal(h.state.businesses[0].reputation,50);
});

test('reputation demand is capped, solo-only and integrated into location revenue',()=>{
 const economy=fs.readFileSync(path.join(__dirname,'../economy-system.js'),'utf8');
 assert.ok(economy.includes("state.playType==='multi'?1:1+(reputation-50)*.0016"));
 assert.ok(economy.includes('demand*reputationDemand*f.countryRevenue'));
 assert.ok(economy.includes('Math.max(0,Math.min(100,b.reputation))'));
});
test('Challenge Center script and styles use valid separate HTML lines',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../play/index.html'),'utf8');
 assert.ok(html.includes('challenge-center.js'));
 assert.ok(html.includes('challenge-center.css'));
 assert.equal(html.includes('\\\\n  <script src="../challenge-center.js'),false);
});

test('Challenge Center stays discoverable without burying Arcade gameplay',()=>{
 const h=harness(),now=Date.parse('2026-11-10T12:00:00Z');
 h.api.render(now);
 assert.equal(h.summary.textContent,'0 / 4 claimed');
 const html=fs.readFileSync(path.join(__dirname,'../play/index.html'),'utf8');
 assert.ok(html.includes('<details id="challengeDrawer"'));
 assert.ok(html.includes('id="challengeSummaryStatus"'));
 assert.ok(html.indexOf('id="challengeCenter"')<html.indexOf('id="arcadeContent"'));
 assert.equal(h.api.claim('starter',now),true);
 assert.equal(h.summary.textContent,'1 / 4 claimed');
 assert.equal(h.api.claim('starter',now),false);
 assert.equal(h.gained(),100);
 const css=fs.readFileSync(path.join(__dirname,'../challenge-center.css'),'utf8');
 assert.match(css,/pl-challenge-drawer>summary:focus-visible/);
 assert.match(css,/max-width:430px/);
});

test('ten-second mission tick refreshes text without replacing clickable contracts',()=>{
 const h=harness(),day=Date.parse('2026-11-10T12:00:00Z');
 h.api.render(day);
 const html=h.root.innerHTML;
 h.api.tick(day+1000);
 assert.equal(h.root.innerHTML,html,'contract and choice buttons remain in DOM');
 assert.equal(h.title.textContent,'No active power-up');
 assert.equal(h.summary.textContent,'0 / 4 claimed');
 assert.match(h.detail.textContent,/Arcade round/);
 assert.equal(h.api.claim('starter',day+1500),true);
 const afterClaim=h.root.innerHTML;
 h.api.tick(day+2500);
 assert.equal(h.root.innerHTML,afterClaim,'claim buttons stay attached between ticks');
 assert.equal(h.summary.textContent,'1 / 4 claimed');
});

test('real huge-money wallet permits priced business decisions and debits exact cost',()=>{
 const h=harness(),realMoney=fs.readFileSync(path.join(__dirname,'../huge-money.js'),'utf8');
 vm.runInNewContext(realMoney,{window:h.window,Math,Number,console});
 const ledger=h.window.ProfitLandsMoney;
 ledger.attach(h.state);
 const day=Date.parse('2026-11-10T12:00:00Z');
 const starting=ledger.number(ledger.balance());
 const option=h.api.dailyEvent(day).options[0];
 assert.ok(option.cost>0);
 assert.equal(h.api.decide(0,day),true,'{m,e} wallet balance is not a NaN rejection');
 assert.equal(h.state.challengeCenter.eventChoice,0);
 assert.ok(Math.abs(ledger.number(ledger.balance())-(starting-option.cost))<0.001);
 assert.equal(h.api.decide(0,day),false,'paid option cannot be replayed');
});
