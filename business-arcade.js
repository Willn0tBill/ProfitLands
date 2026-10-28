/* ProfitLands Business Arcade — original, self-contained management mini-games.
   In-game cash prizes are small and capped to preserve the economy.
   Gameplay works with mouse, keyboard and touch; no casino/gambling elements. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const GAMES=[
 {id:'rush',name:'Coffee Rush',icon:'☕',label:'CLICKER',description:'Serve as many orders as you can in 20 seconds.',duration:20000,accent:'mint'},
 {id:'dispatch',name:'Delivery Dispatch',icon:'📦',label:'QUICK DECISIONS',description:'Route deliveries to the correct district.',duration:20000,accent:'amber'},
 {id:'desk',name:'Deal Desk',icon:'BUS',label:'BUSINESS QUIZ',description:'Choose smart business decisions in five quick scenarios.',duration:0,accent:'blue'}
];
const DESTINATIONS=['Downtown','Waterfront','University'];
const SCENARIOS=[
 {prompt:'A supplier offers lower prices for a reliable long-term contract. What helps margins?',options:['Negotiate a bulk rate','Raise warehouse rent','Discard working inventory'],answer:0,why:'Lower supply costs can improve profit margins.'},
 {prompt:'Your coffee shop has long queues during lunch. Which investment helps most?',options:['Remove staff at peak hours','Schedule more cashiers at lunch','Stop advertising permanently'],answer:1,why:'Matching staffing to peak demand reduces service bottlenecks.'},
 {prompt:'A store is repeatedly running out of products. What should you improve?',options:['Forecast demand and restock earlier','Double prices without checking demand','Close every location'],answer:0,why:'Better forecasting reduces stockouts and missed sales.'},
 {prompt:'One location earns less than others despite strong sales. What is worth reviewing?',options:['The branch’s rent and operating expenses','The company logo alone','Only total empire value'],answer:0,why:'Profit depends on expenses as well as revenue.'},
 {prompt:'You are expanding into a new city. Which is the safer first step?',options:['Open ten locations without research','Ignore local regulations','Review demand, rent and staffing costs'],answer:2,why:'Researching the local market helps manage expansion risk.'}
];
const LIMIT=3,WINDOW_MS=5*60*1000,COOLDOWN_MS=8000;
let session=null,clock=null,view='games',lastActionAt=0;
const fmt=n=>window.ProfitLandsMoney?.format?.(n)||'$'+Math.round(n).toLocaleString('en-US');
function ensure(){
 const state=window.state;
 if(!state)return null;
 if(!state.arcade||typeof state.arcade!=='object'||state.arcade.version!==1){
  state.arcade={version:1,earned:0,played:0,perfect:0,bests:{rush:0,dispatch:0,desk:0},rewards:[]};
 }
 const p=state.arcade;
 if(!Array.isArray(p.rewards))p.rewards=[];
 if(!p.bests||typeof p.bests!=='object')p.bests={rush:0,dispatch:0,desk:0};
 return p;
}
function available(now=Date.now()){
 const p=ensure();
 if(!p)return 0;
 p.rewards=p.rewards.filter(t=>Number.isFinite(t)&&now>=t&&now-t<WINDOW_MS).slice(-LIMIT);
 return Math.max(0,LIMIT-p.rewards.length);
}
function canPlay(){
 return Boolean(window.state?.started&&$('gameScreen')?.classList.contains('active')&&document.visibilityState!=='hidden');
}
function stopTicker(){
 if(clock!==null){clearInterval(clock);clock=null}
}
function stop(){
 stopTicker();session=null;view='games';render();
}
function game(id){return GAMES.find(x=>x.id===id)}
function start(id,now=Date.now()){
 if(!canPlay()||session||!game(id))return false;
 const g=game(id);
 if(now-lastActionAt<COOLDOWN_MS)return false;
 session={id,started:now,endAt:g.duration?now+g.duration:null,score:0,served:0,mistakes:0,index:0,finished:false,answerFeedback:null,destination:0};
 if(id==='dispatch')session.destination=Math.floor(now/1000)%DESTINATIONS.length;
 view='playing';
 stopTicker();
 // Single lightweight interval. Pause/quit on hidden tab, no offline rewards.
 clock=setInterval(()=>tick(),150);
 render();
 return true;
}
function progress(now=Date.now()){
 if(!session)return 0;
 const g=game(session.id);
 return g.duration?Math.max(0,Math.min(100,(session.endAt-now)/g.duration*100)):Math.max(0,100-session.index/SCENARIOS.length*100);
}
function rewardFor(id,score){
 const s=Math.max(0,Math.floor(Number(score)||0));
 if(id==='rush')return Math.min(110,s*3);
 if(id==='dispatch')return Math.min(96,s*12);
 if(id==='desk')return Math.min(90,s*18);
 return 0;
}
function complete(now=Date.now()){
 if(!session||session.finished)return false;
 session.finished=true;
 stopTicker();
 const current=session;
 const p=ensure(),oldBest=Number(p.bests[current.id])||0;
 p.bests[current.id]=Math.max(oldBest,current.score);
 p.played++;
 if(current.id==='dispatch'&&current.score===8||current.id==='desk'&&current.score===5)p.perfect++;
 const award=rewardFor(current.id,current.score);
 const canReward=available(now)>0&&award>0;
 if(canReward){
  const purse=window.ProfitLandsMoney;
  if(purse?.gain)purse.gain(award);
  else window.state.cash+=award;
  p.earned+=award;
  p.rewards.push(now);
 }
 current.award=canReward?award:0;
 current.practice=!canReward;
 view='result';
 window.save?.();
 window.render?.();
 render();
 return true;
}
function tick(now=Date.now()){
 if(!session)return;
 if(!canPlay()){stop();return}
 if(session.endAt&&now>=session.endAt){complete(now);return}
 const bar=$('arcadeCountdown');
 if(bar)bar.style.width=progress(now)+'%';
 const time=$('arcadeTimeLeft');
 if(time&&session.endAt)time.textContent=Math.ceil((session.endAt-now)/1000)+'s';
}
function press(action,option,now=Date.now()){
 if(!session||session.finished||view!=='playing'||!canPlay())return false;
 if(session.endAt&&now>=session.endAt){complete(now);return false}
 const s=session;
 if(s.id==='rush'&&action==='serve'){
  s.score+=1;s.served++;
  // Don't rebuild the entire panel on every tap; keeps input fast on mobile.
  const score=$('arcadeScore');if(score)score.textContent=String(s.score);
  const bubble=$('arcadeFeedback');if(bubble)bubble.textContent=s.served%10===0?'10 orders served — great pace!':'Order '+s.served+' served';
  return true;
 }
 if(s.id==='dispatch'&&action==='route'){
  const dest=Number(option);
  if(!Number.isInteger(dest)||dest<0||dest>=DESTINATIONS.length)return false;
  if(dest===s.destination)s.score++;
  else s.mistakes++;
  s.index++;
  if(s.index>=8){complete(now);return true}
  s.destination=(s.destination+1+(s.index%2))%DESTINATIONS.length;
  render();return true;
 }
 if(s.id==='desk'&&action==='choose'){
  const answer=Number(option),scenario=SCENARIOS[s.index];
  if(!scenario||!Number.isInteger(answer)||answer<0||answer>=scenario.options.length)return false;
  if(answer===scenario.answer)s.score++;
  else s.mistakes++;
  s.index++;
  if(s.index>=SCENARIOS.length){complete(now);return true}
  s.answerFeedback=scenario.why;
  render();return true;
 }
 return false;
}
function tile(g){
 const best=Number(ensure()?.bests?.[g.id])||0;
 return '<article class="pl-arcade-game pl-arcade-'+g.accent+'">'+
  '<div class="pl-arcade-game-top"><span class="pl-arcade-game-icon" aria-hidden="true">'+g.icon+'</span><span class="pl-arcade-pill">'+g.label+'</span></div>'+
  '<h3>'+g.name+'</h3><p>'+g.description+'</p>'+
  '<div class="pl-arcade-game-bottom"><span>PERSONAL BEST <b>'+best+'</b></span>'+
  '<button type="button" data-arcade-start="'+g.id+'">Play <span aria-hidden="true">→</span></button></div></article>';
}
function info(){
 const p=ensure(),left=available();
 return '<div class="pl-arcade-meta"><div><span>REWARD PLAYS AVAILABLE</span><strong>'+left+' / '+LIMIT+'</strong></div>'+
 '<div><span>TOTAL ARCADE EARNINGS</span><strong>'+fmt(p?.earned||0)+'</strong></div>'+
 '<div><span>GAMES COMPLETED</span><strong>'+Number(p?.played||0)+'</strong></div></div>';
}
function gameScreen(){
 const s=session,g=game(s.id);
 if(!g)return '';
 const remaining=s.endAt?Math.max(0,Math.ceil((s.endAt-Date.now())/1000)):null;
 let controls='';
 if(s.id==='rush')controls=
  '<div class="pl-arcade-clicker-stage"><div class="pl-arcade-clicker-glow"></div>'+
   '<button type="button" class="pl-arcade-tap" data-arcade-action="serve" aria-label="Serve a coffee order">'+
   '<span class="pl-arcade-cup" aria-hidden="true">☕</span><span>SERVE ORDER</span>'+
   '<small>Click or press Space</small></button></div>'+
   '<p id="arcadeFeedback" class="pl-arcade-feedback" role="status">Tap as fast as you can to fulfill orders.</p>';
 else if(s.id==='dispatch')controls=
   '<p class="pl-arcade-instruction">A delivery is headed to <strong>'+DESTINATIONS[s.destination]+'</strong>. Choose the matching route.</p>'+
   '<div class="pl-arcade-options">'+DESTINATIONS.map((d,i)=>'<button type="button" data-arcade-action="route" data-arcade-option="'+i+'">'+d+'</button>').join('')+'</div>'+
   '<p class="pl-arcade-feedback">Shipment '+(s.index+1)+' / 8 · '+s.mistakes+' routing errors</p>';
 else{
  const q=SCENARIOS[s.index];
  controls='<p class="pl-arcade-instruction">'+q.prompt+'</p>'+
   '<div class="pl-arcade-options">'+q.options.map((x,i)=>'<button type="button" data-arcade-action="choose" data-arcade-option="'+i+'">'+x+'</button>').join('')+'</div>'+
   '<p class="pl-arcade-feedback">'+(s.answerFeedback||'Choose the strongest business decision.')+'</p>';
 }
 return '<div class="pl-arcade-session">'+
   '<div class="pl-arcade-session-head"><div><span class="pl-arcade-overline">NOW PLAYING</span><h3>'+g.name+'</h3></div>'+
   '<button class="pl-arcade-quit" type="button" data-arcade-quit>Quit round</button></div>'+
   '<div class="pl-arcade-session-stats"><span>Score <b id="arcadeScore">'+s.score+'</b></span>'+
   '<span>'+ (remaining===null?'Question '+(s.index+1)+' / 5':'Time left <b id="arcadeTimeLeft">'+remaining+'s</b>')+'</span></div>'+
   '<div class="pl-arcade-track"><span id="arcadeCountdown" style="width:'+progress()+'%"></span></div>'+controls+
   '<p class="pl-arcade-rules">In-game cash rewards are capped at 3 completed games per rolling 5 minutes. No management actions are used.</p>'+
  '</div>';
}
function resultScreen(){
 const s=session,g=game(s.id),earned=s.award||0;
 return '<section class="pl-arcade-result"><span class="pl-arcade-result-icon" aria-hidden="true">✓</span>'+
 '<span class="pl-arcade-overline">ROUND COMPLETE</span><h3>'+g.name+'</h3>'+
 '<p>You finished with <b>'+s.score+'</b> point'+(s.score===1?'':'s')+'.</p>'+
 '<div class="pl-arcade-result-amount">'+(earned?'+'+fmt(earned):'Practice round')+'</div>'+
 '<p>'+(earned?'The cash reward was added to your existing empire and saved.':'No reward paid for this round (low score or reward limit reached).')+'</p>'+
 '<div class="pl-arcade-result-buttons"><button type="button" data-arcade-back>Return to arcade</button>'+
 '<button type="button" data-arcade-retry="'+s.id+'">Play again</button></div></section>';
}
function render(){
 const root=$('arcadeContent');if(!root)return;
 const p=ensure();
 if(!p)return;
 if(!session||view==='games'){
  root.innerHTML=info()+'<div class="pl-arcade-grid">'+GAMES.map(tile).join('')+'</div>'+
   '<div class="pl-arcade-help"><strong>Arcade earnings are intentionally modest.</strong> This is an optional way to interact with your empire between management decisions. Your real business income and automatic market cycles continue normally.</div>';
 }else if(view==='playing')root.innerHTML=gameScreen();
 else root.innerHTML=resultScreen();
}
function init(){
 const root=$('arcadeContent');
 if(!root)return;
 root.addEventListener('click',event=>{
  const startButton=event.target.closest('[data-arcade-start]');
  if(startButton){start(startButton.dataset.arcadeStart);return}
  const actionButton=event.target.closest('[data-arcade-action]');
  if(actionButton){press(actionButton.dataset.arcadeAction,actionButton.dataset.arcadeOption);return}
  if(event.target.closest('[data-arcade-quit]')){stop();return}
  if(event.target.closest('[data-arcade-back]')){stop();return}
  const retry=event.target.closest('[data-arcade-retry]');
  if(retry){const id=retry.dataset.arcadeRetry;stop();start(id)}
 });
 document.addEventListener('keydown',e=>{
  if(!session||session.id!=='rush'||view!=='playing'||e.code!=='Space'||e.repeat)return;
  if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(window.ProfitLandsWorkspace?.active?.()!=='arcade')return;
  e.preventDefault();press('serve');
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&session)stop()});
 // Navigating to another management view stops the timer instead of collecting
 // unattended bonuses while the player is elsewhere.
 window.addEventListener('profitlands:viewchange',e=>{
  if(e.detail?.view!=='arcade'&&session&&view==='playing')stop();
 });
 render();
}
window.ProfitLandsArcade={ensure,available,game,rewardFor,start,press,complete,tick,stop,render,getSession:()=>session,GAMES};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();