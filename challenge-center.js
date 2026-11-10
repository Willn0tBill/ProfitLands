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
function dayKey(now=Date.now()){return new Date(now).toISOString().slice(0,10)}
function ensure(now=Date.now()){
 const s=window.state;
 if(!s||s.playType==='multi'||!s.started)return null;
 if(!s.challengeCenter||typeof s.challengeCenter!=='object')s.challengeCenter={};
 const c=s.challengeCenter,key=dayKey(now);
 if(c.day!==key){c.day=key;c.claimed=[]}
 if(!Array.isArray(c.claimed))c.claimed=[];
 c.claimed=c.claimed.filter(id=>CONTRACTS.some(x=>x.id===id)).slice(0,CONTRACTS.length);
 return c;
}
function status(now=Date.now()){
 const s=window.state,c=ensure(now);
 if(!c)return null;
 return {day:c.day,claimed:c.claimed.slice(),contracts:CONTRACTS.map(q=>({...q,value:Math.min(q.target,Math.max(0,Math.floor(q.value(s)))),claimed:c.claimed.includes(q.id)})),powerup:window.ProfitLandsArcade?.activePowerup?.(now)||null,history:window.state?.arcade||null};
}
function claim(id,now=Date.now()){
 const c=ensure(now),q=CONTRACTS.find(x=>x.id===id),s=window.state;
 if(!c||!q||c.claimed.includes(id)||q.value(s)<q.target)return false;
 c.claimed.push(id);
 if(window.ProfitLandsMoney?.gain)window.ProfitLandsMoney.gain(q.reward);
 else s.cash=(Number(s.cash)||0)+q.reward;
 if(!Array.isArray(s.news))s.news=[];
 s.news.push('DAILY CONTRACT — '+q.title+' completed. Reward: '+fmt(q.reward)+'.');
 window.save?.();window.render?.();render();
 window.toast?.('Contract complete: +'+fmt(q.reward));
 return true;
}
function render(now=Date.now()){
 const root=$('challengeCenter'),data=status(now);
 if(!root)return;
 if(!data){root.innerHTML='<p>Daily contracts and Arcade power-ups are available in single-player mode.</p>';return}
 const p=data.powerup,history=data.history||{};
 root.innerHTML='<header class="pl-center-head"><div><small>YOUR DAILY MISSIONS</small><h3>Challenge Center</h3><p>Complete contracts, claim rewards, and master mini-games to earn temporary advantages.</p></div><span>'+data.claimed.length+' / '+CONTRACTS.length+' claimed today</span></header>'+
 '<div class="pl-center-status">'+(p?'<strong>⚡ '+p.name+'</strong><span>'+p.description+' · '+Math.ceil(p.remainingMs/1000)+'s remaining</span>':'<strong>No active power-up</strong><span>Complete a rewarding Arcade round to unlock one.</span>')+'</div>'+
 '<div class="pl-center-contracts">'+data.contracts.map(q=>'<article><div><strong>'+q.title+'</strong><p>'+q.description+'</p><small>'+q.value+' / '+q.target+' · Reward '+fmt(q.reward)+'</small></div><button type="button" data-center-claim="'+q.id+'" '+(q.claimed||q.value<q.target?'disabled':'')+'>'+(q.claimed?'Claimed':q.value>=q.target?'Claim reward':'In progress')+'</button></article>').join('')+'</div>'+
 '<p class="pl-center-history">Arcade record: '+Math.max(0,Number(history.played)||0)+' rounds · '+fmt(Math.max(0,Number(history.earned)||0))+' earned. Daily contracts reset at 00:00 UTC. Rewards are one-time per contract per day.</p>';
}
function init(){
 const root=$('challengeCenter');if(!root)return;
 root.addEventListener('click',e=>{const b=e.target.closest?.('[data-center-claim]');if(b)claim(b.dataset.centerClaim)});
 window.addEventListener('profitlands:viewchange',()=>render());
 window.setInterval?.(()=>{if(document.visibilityState!=='hidden'&&window.ProfitLandsWorkspace?.active?.()==='arcade')render()},10000);
 render();
}
window.ProfitLandsChallengeCenter={CONTRACTS,dayKey,ensure,status,claim,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
