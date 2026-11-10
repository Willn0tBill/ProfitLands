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
const EVENTS=[
 {id:'supplier',title:'Supplier Negotiation',description:'A supplier offers a discounted bulk purchase. Do you invest in inventory or preserve liquidity?',options:[{name:'Buy discounted stock',cost:80,payout:120},{name:'Preserve cash',cost:0,payout:0}]},
 {id:'marketing',title:'Neighborhood Campaign',description:'A local event could bring new customers. Fund a promotion or keep your budget intact?',options:[{name:'Fund the campaign',cost:100,payout:145},{name:'Keep the budget',cost:0,payout:0}]},
 {id:'maintenance',title:'Equipment Maintenance',description:'A machine needs attention. Preventive maintenance offers a small guaranteed benefit; delaying is free.',options:[{name:'Maintain now',cost:60,payout:80},{name:'Delay repairs',cost:0,payout:0}]}
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
 return {day:c.day,claimed:c.claimed.slice(),contracts:activeContracts(now).map(q=>({...q,value:Math.min(q.target,Math.max(0,Math.floor(q.value(s,c)))),claimed:c.claimed.includes(q.id)})),powerup:window.ProfitLandsArcade?.activePowerup?.(now)||null,history:window.state?.arcade||null,event:dailyEvent(now),eventChoice:c.eventChoice};
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
function decide(option,now=Date.now()){
 const c=ensure(now),s=window.state,e=dailyEvent(now),choice=e.options[option];
 if(!c||c.eventChoice!==null||!choice)return false;
 const cash=Number(window.ProfitLandsMoney?.balance?.()??s.cash);
 if(!Number.isFinite(cash)||cash<choice.cost)return false;
 // A single deterministic choice per day. No random chance, wagering or repeat farming.
 if(choice.cost){if(window.ProfitLandsMoney?.spend)window.ProfitLandsMoney.spend(choice.cost);else s.cash-=choice.cost}
 if(choice.payout){if(window.ProfitLandsMoney?.gain)window.ProfitLandsMoney.gain(choice.payout);else s.cash+=choice.payout}
 c.eventChoice=option;
 if(!Array.isArray(s.news))s.news=[];
 s.news.push('BUSINESS DECISION — '+e.title+': '+choice.name+'. Net impact '+fmt(choice.payout-choice.cost)+'.');
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
 '<section class="pl-center-decision"><strong>Today’s Business Decision · '+data.event.title+'</strong><p>'+data.event.description+'</p><div class="pl-center-options">'+data.event.options.map((o,i)=>'<button type="button" data-center-decision="'+i+'" '+(data.eventChoice!==null?'disabled':'')+'>'+o.name+' · '+(o.payout-o.cost>=0?'+':'')+fmt(o.payout-o.cost)+'</button>').join('')+'</div>'+(data.eventChoice!==null?'<small>Decision completed for today.</small>':'<small>One decision per day. No random outcome.</small>')+'</section>'+ 
 '<p class="pl-center-history">Arcade record: '+Math.max(0,Number(history.played)||0)+' rounds · '+fmt(Math.max(0,Number(history.earned)||0))+' earned. Daily contracts reset at 00:00 UTC. Rewards are one-time per contract per day.</p>';
}
function init(){
 const root=$('challengeCenter');if(!root)return;
 root.addEventListener('click',e=>{const b=e.target.closest?.('[data-center-claim]');if(b)claim(b.dataset.centerClaim);const d=e.target.closest?.('[data-center-decision]');if(d)decide(Number(d.dataset.centerDecision))});
 window.addEventListener('profitlands:viewchange',()=>render());
 window.setInterval?.(()=>{if(document.visibilityState!=='hidden'&&window.ProfitLandsWorkspace?.active?.()==='arcade')render()},10000);
 render();
}
window.ProfitLandsChallengeCenter={CONTRACTS,ROTATING,EVENTS,activeContracts,dailyEvent,dayKey,ensure,status,claim,decide,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
