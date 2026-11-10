/* ProfitLands Challenge Center: solo daily contracts, arcade status and reward history. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>window.ProfitLandsMoney?.format?.(n)||'$'+Math.round(n).toLocaleString('en-US');
const CONTRACTS=[
 {id:'starter',title:'Open for Business',description:'Own at least one business.',target:1,reward:100,value:s=>(s.businesses||[]).length},
 {id:'crew',title:'Staff the Floor',description:'Employ at least three workers.',target:3,reward:125,value:s=>(s.businesses||[]).reduce((n,b)=>n+(b.locationManagementVersion===1?(b.locations||[]).reduce((x,l)=>x+Math.max(0,Number(l.workers)||0),0):Math.max(0,Number(b.workers)||0)),0)},
 {id:'branches',title:'Neighborhood Presence',description:'Operate at least two locations.',target:2,reward:150,value:s=>(s.businesses||[]).reduce((n,b)=>n+(Array.isArray(b.locations)?b.locations.length:1),0)}
];
const ROTATING=[
 {id:'arcade-rounds',title:'Arcade Apprentice',description:'Complete 2 Arcade rounds today.',target:2,reward:120,value:(s,c)=>Math.max(0,(Number(s.arcade?.played)||0)-(Number(c.arcadeStart)||0))},
 {id:'arcade-perfect',title:'Flawless Execution',description:'Complete a perfect Dispatch or Deal Desk round today.',target:1,reward:200,value:(s,c)=>Math.max(0,(Number(s.arcade?.perfect)||0)-(Number(c.perfectStart)||0))},
 {id:'branch-builder',title:'Expansion Sprint',description:'Operate 3 business locations.',target:3,reward:180,value:s=>(s.businesses||[]).reduce((n,b)=>n+(Array.isArray(b.locations)?b.locations.length:1),0)},
 {id:'team-leader',title:'Team Leader',description:'Employ 5 workers.',target:5,reward:160,value:s=>(s.businesses||[]).reduce((n,b)=>n+(b.locationManagementVersion===1?(b.locations||[]).reduce((x,l)=>x+Math.max(0,Number(l.workers)||0),0):Math.max(0,Number(b.workers)||0)),0)}
];
const EVENT_DURATION_MS=5*60*1000;
function wealthDuration(cash){
 const amount=Math.max(0,Number(cash)||0);
 const scale=amount<10000?1.5:amount<100000?1.25:amount<1000000?1:amount<100000000?.85:.75;
 return Math.round(EVENT_DURATION_MS*scale);
}
const EVENTS=[
 {id:'supplier',title:'Supplier Negotiation',description:'Bulk supplies cost cash upfront but reduce operating pressure for a wealth-adjusted duration.',options:[
  {name:'Negotiate bulk supplies',cost:80,reputation:1,multiplier:1.12,description:'Pay $80 now; positive operating income +12% for a wealth-adjusted duration.'},
  {name:'Preserve liquidity',cost:0,multiplier:1,description:'No upfront cost or operating modifier.'}]},
 {id:'marketing',title:'Neighborhood Campaign',description:'Advertising can lift earnings, but it only pays off if your empire is profitable.',options:[
  {name:'Run local campaign',cost:100,reputation:3,multiplier:1.18,description:'Pay $100 now; positive operating income +18% for a wealth-adjusted duration.'},
  {name:'Keep marketing lean',cost:0,multiplier:1,description:'Save cash; no demand campaign bonus.'}]},
 {id:'maintenance',title:'Equipment Maintenance',description:'Maintenance protects your operating cash flow during difficult market conditions.',options:[
  {name:'Service equipment',cost:60,reputation:2,multiplier:0.65,description:'Pay $60 now; operating losses reduced by 35% for a wealth-adjusted duration.'},
  {name:'Defer maintenance',cost:0,reputation:-1,multiplier:1,description:'No upfront cost or loss protection.'}]}
];
function dailyIndex(now,length){return Math.floor(now/86400000)%length}
function activeContracts(now){return [...CONTRACTS,ROTATING[dailyIndex(now,ROTATING.length)]]}
function dailyEvent(now){return EVENTS[dailyIndex(now,EVENTS.length)]}
function dayKey(now=Date.now()){return new Date(now).toISOString().slice(0,10)}
function ensure(now=Date.now()){
 const s=window.state;
 if(!s||s.playType==='multi'||!s.started)return null;
 if(!s.challengeCenter||typeof s.challengeCenter!=='object')s.challengeCenter={};
 const c=s.challengeCenter,key=dayKey(now);
 if(c.day!==key){c.day=key;c.claimed=[];c.eventChoice=null;c.arcadeStart=Math.max(0,Number(s.arcade?.played)||0);c.perfectStart=Math.max(0,Number(s.arcade?.perfect)||0)}
 if(!Array.isArray(c.claimed))c.claimed=[];
 c.claimed=c.claimed.filter(id=>activeContracts(now).some(x=>x.id===id)).slice(0,activeContracts(now).length);
 return c;
}
function status(now=Date.now()){
 const s=window.state,c=ensure(now);
 if(!c)return null;
 return {day:c.day,claimed:c.claimed.slice(),contracts:activeContracts(now).map(q=>({...q,value:Math.min(q.target,Math.max(0,Math.floor(q.value(s,c)))),claimed:c.claimed.includes(q.id)})),powerup:window.ProfitLandsArcade?.activePowerup?.(now)||null,history:window.state?.arcade||null,event:dailyEvent(now),eventChoice:c.eventChoice,decisionEffect:decisionEffect(now)};
}
function claim(id,now=Date.now()){
 const c=ensure(now),q=activeContracts(now).find(x=>x.id===id),s=window.state;
 if(!c||!q||c.claimed.includes(id)||q.value(s,c)<q.target)return false;
 c.claimed.push(id);
 if(window.ProfitLandsMoney?.gain)window.ProfitLandsMoney.gain(q.reward);
 else s.cash=(Number(s.cash)||0)+q.reward;
 if(!Array.isArray(s.news))s.news=[];
 s.news.push('DAILY CONTRACT — '+q.title+' completed. Reward: '+fmt(q.reward)+'.');
 window.save?.();window.render?.();render();
 window.toast?.('Contract complete: +'+fmt(q.reward));
 return true;
}
function decisionEffect(now=Date.now()){
 const s=window.state,c=s?.challengeCenter;
 if(!s||s.playType==='multi'||!s.started||!c||!Number.isInteger(c.eventChoice)||!Number.isFinite(c.eventUntil)||c.eventUntil<=now||c.eventUntil>now+EVENT_DURATION_MS*1.5)return null;
 const event=EVENTS.find(e=>e.id===c.eventId),option=event?.options[c.eventChoice];
 if(!option||!Number.isFinite(option.multiplier))return null;
 return {id:event.id,name:option.name,multiplier:option.multiplier,remainingMs:c.eventUntil-now};
}
function decide(option,now=Date.now()){
 const c=ensure(now),s=window.state,e=dailyEvent(now),choice=e.options[option];
 if(!c||c.eventChoice!==null||!Number.isInteger(option)||!choice)return false;
 const cash=Number(window.ProfitLandsMoney?.balance?.()??s.cash);
 if(!Number.isFinite(cash)||cash<choice.cost)return false;
 // A single deterministic choice per day. No random chance, wagering or repeat farming.
 if(choice.cost){if(window.ProfitLandsMoney?.spend)window.ProfitLandsMoney.spend(choice.cost);else s.cash-=choice.cost}
 // Reputation persists beyond the temporary boost, capped to avoid runaway compounding.
 if(Number.isFinite(choice.reputation)&&choice.reputation!==0){
  for(const business of s.businesses||[]){
   const old=Number.isFinite(business.reputation)?business.reputation:50;
   business.reputation=Math.max(0,Math.min(100,old+choice.reputation));
  }
 }
 c.eventChoice=option;
 c.eventId=e.id;
 c.eventDuration=wealthDuration(cash);
 c.eventUntil=now+c.eventDuration;
 if(!Array.isArray(s.news))s.news=[];
 s.news.push('BUSINESS DECISION — '+e.title+': '+choice.name+'. '+choice.description+' Duration: '+Math.round(c.eventDuration/1000)+' seconds.');
 window.save?.();window.render?.();render();
 return true;
}
function render(now=Date.now()){
 const root=$('challengeCenter'),data=status(now);
 if(!root)return;
 if(!data){root.innerHTML='<p>Daily contracts and Arcade power-ups are available in single-player mode.</p>';return}
 const p=data.powerup,history=data.history||{};
 root.innerHTML='<header class="pl-center-head"><div><small>YOUR DAILY MISSIONS</small><h3>Challenge Center</h3><p>Complete contracts, claim rewards, and master mini-games to earn temporary advantages.</p></div><span>'+data.claimed.length+' / '+data.contracts.length+' claimed today</span></header>'+
 '<div class="pl-center-status">'+(p?'<strong>⚡ '+p.name+'</strong><span>'+p.description+' · '+Math.ceil(p.remainingMs/1000)+'s remaining</span>':'<strong>No active power-up</strong><span>Complete a rewarding Arcade round to unlock one.</span>')+'</div>'+
 '<div class="pl-center-contracts">'+data.contracts.map(q=>'<article><div><strong>'+q.title+'</strong><p>'+q.description+'</p><small>'+q.value+' / '+q.target+' · Reward '+fmt(q.reward)+'</small></div><button type="button" data-center-claim="'+q.id+'" '+(q.claimed||q.value<q.target?'disabled':'')+'>'+(q.claimed?'Claimed':q.value>=q.target?'Claim reward':'In progress')+'</button></article>').join('')+'</div>'+
 '<section class="pl-center-decision"><strong>Today’s Business Decision · '+data.event.title+'</strong><p>'+data.event.description+'</p><div class="pl-center-options">'+data.event.options.map((o,i)=>'<button type="button" data-center-decision="'+i+'" '+(data.eventChoice!==null?'disabled':'')+'>'+o.name+' · '+o.description+(o.reputation?' · Reputation '+(o.reputation>0?'+':'')+o.reputation:'')+'</button>').join('')+'</div>'+(data.eventChoice!==null?'<small>Decision completed. '+(data.decisionEffect?'Effect active · '+Math.ceil(data.decisionEffect.remainingMs/1000)+'s left.':'Effect expired or no modifier selected.')+'</small>':'<small>One decision per day. Duration scales with available cash at activation (3m 45s–7m 30s); upfront costs may not pay off.</small>')+'</section>'+ 
 '<p class="pl-center-history">Arcade record: '+Math.max(0,Number(history.played)||0)+' rounds · '+fmt(Math.max(0,Number(history.earned)||0))+' earned. Daily contracts reset at 00:00 UTC. Rewards are one-time per contract per day.</p>';
}
function init(){
 const root=$('challengeCenter');if(!root)return;
 root.addEventListener('click',e=>{const b=e.target.closest?.('[data-center-claim]');if(b)claim(b.dataset.centerClaim);const d=e.target.closest?.('[data-center-decision]');if(d)decide(Number(d.dataset.centerDecision))});
 window.addEventListener('profitlands:viewchange',()=>render());
 window.setInterval?.(()=>{if(document.visibilityState!=='hidden'&&window.ProfitLandsWorkspace?.active?.()==='arcade')render()},10000);
 render();
}
window.ProfitLandsChallengeCenter={CONTRACTS,ROTATING,EVENTS,activeContracts,dailyEvent,dayKey,ensure,status,claim,decide,decisionEffect,wealthDuration,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
