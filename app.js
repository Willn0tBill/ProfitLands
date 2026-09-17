const MODES={fast:{name:'Fast',daySeconds:300,actions:4},standard:{name:'Standard',daySeconds:900,actions:6},long:{name:'Long',daySeconds:3600,actions:10},persistent:{name:'Persistent',daySeconds:86400,actions:12}};
const STOCKS=[
 {id:'nova',name:'NovaTech',ticker:'NVT',price:42.5,sector:'Technology',risk:'High',dividend:0},
 {id:'harbor',name:'Harbor Foods',ticker:'HFD',price:24.8,sector:'Consumer',risk:'Low',dividend:.5},
 {id:'atlas',name:'Atlas Energy',ticker:'ATE',price:67.2,sector:'Energy',risk:'Medium',dividend:.8},
 {id:'skyline',name:'Skyline Motors',ticker:'SKM',price:31.4,sector:'Industrial',risk:'Medium',dividend:.3}
];
const state={mode:'standard',day:1,cash:1000,stocks:Object.fromEntries(STOCKS.map(s=>[s.id,{shares:0}])),businesses:0,property:0,actions:6,timeLeft:900,news:[],trend:null,started:false};
let timerHandle=null;
const $=id=>document.getElementById(id);
function money(n){return '$'+Math.round(n).toLocaleString();}
function save(){localStorage.setItem('profitlands-v1',JSON.stringify(state));}
function load(){const raw=localStorage.getItem('profitlands-v1');if(!raw)return;try{Object.assign(state,JSON.parse(raw));}catch(e){localStorage.removeItem('profitlands-v1');}}
function resetForMode(mode){state.mode=mode;state.day=1;state.cash=1000;state.stocks=Object.fromEntries(STOCKS.map(s=>[s.id,{shares:0}]));state.businesses=0;state.property=0;state.actions=MODES[mode].actions;state.timeLeft=MODES[mode].daySeconds;state.news=['You founded your first company with $1,000.'];state.trend=null;state.started=true;save();}
function netWorth(){return state.cash+STOCKS.reduce((sum,s)=>sum+s.price*state.stocks[s.id].shares,0)+state.businesses*500+state.property*750;}
function dailyIncome(){return state.businesses*95+state.property*12;}
function render(){
 $('modeName').textContent=MODES[state.mode].name;$('dayLabel').textContent='Day '+state.day;$('gameDay').textContent=state.day;
 $('cash').textContent=money(state.cash);$('netWorth').textContent=money(netWorth());$('dailyIncome').textContent='+'+money(dailyIncome())+'/day';$('actionsLeft').textContent=state.actions;$('actionsMax').textContent=MODES[state.mode].actions;$('timer').textContent=formatTime(state.timeLeft);
 renderStocks();renderHoldings();renderNews();
 if(state.trend){$('eventBanner').classList.remove('hidden');$('eventBanner').textContent='Research report: '+state.trend;}else $('eventBanner').classList.add('hidden');
}
function renderStocks(){
 $('stockList').innerHTML=STOCKS.map(s=>{const pct=s._change||0;return `<div class="stock" data-stock="${s.id}"><div><b>${s.name}</b><small>${s.ticker} · ${s.sector}</small></div><div class="stock-price">${money(s.price)}</div><div class="change ${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct.toFixed(1)}%</div></div>`}).join('');
 document.querySelectorAll('.stock').forEach(el=>el.onclick=()=>trade(el.dataset.stock));
}
function renderHoldings(){
 const items=[];STOCKS.forEach(s=>{const h=state.stocks[s.id];if(h.shares)items.push(`<div class="holding"><div><b>${s.ticker}</b><small>${h.shares} share${h.shares===1?'':'s'}</small></div><strong>${money(h.shares*s.price)}</strong></div>`)});
 if(state.businesses)items.push(`<div class="holding"><div><b>Businesses</b><small>${state.businesses} owned</small></div><strong>${money(state.businesses*500)}</strong></div>`);
 if(state.property)items.push(`<div class="holding"><div><b>Property</b><small>${state.property} owned</small></div><strong>${money(state.property*750)}</strong></div>`);
 $('holdings').innerHTML=items.length?items.join(''):'<div class="empty">Nothing here yet. Start building your empire.</div>';
}
function renderNews(){$('newsFeed').innerHTML=state.news.slice(-5).reverse().map((n,i)=>`<div class="news-item"><span>${i===0?'NOW':'RECENT'}</span>${n}</div>`).join('');}
function formatTime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;if(h)return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function spendAction(cost){if(state.actions<=0){toast('No actions left. End the day to reset them.');return false}if(state.cash<cost){toast('Not enough cash.');return false}state.cash-=cost;state.actions--;return true;}
function action(type){
 if(type==='business'&&spendAction(500)){state.businesses++;state.news.push('You opened a new business. It will generate income overnight.');toast('Business built.');}
 else if(type==='property'&&spendAction(750)){state.property++;state.news.push('You purchased a piece of ProfitLands property.');toast('Property purchased.');}
 else if(type==='research'&&spendAction(150)){const s=STOCKS[Math.floor(Math.random()*STOCKS.length)];const up=Math.random()>.45;state.trend=`${s.name} looks ${up?'strong':'weak'} for the next market update.`;state.news.push(`Research: analysts expect ${s.ticker} to be ${up?'stronger':'weaker'} next day.`);toast('Research complete.');}
 save();render();
}
function trade(id){const s=STOCKS.find(x=>x.id===id);const choice=prompt(`${s.name} (${s.ticker})\nPrice: ${money(s.price)}\n\nType B to buy 1 share or S to sell 1 share.`);if(!choice)return;const c=choice.trim().toLowerCase();if(c!=='b'&&c!=='s')return toast('Use B to buy or S to sell.');if(state.actions<=0)return toast('No actions left.');if(c==='b'){if(state.cash<s.price)return toast('Not enough cash.');state.cash-=s.price;state.stocks[id].shares++;state.actions--;state.news.push(`You bought 1 share of ${s.ticker}.`);toast(`Bought ${s.ticker}.`);}else{if(!state.stocks[id].shares)return toast('You do not own that stock.');state.cash+=s.price;state.stocks[id].shares--;state.actions--;state.news.push(`You sold 1 share of ${s.ticker}.`);toast(`Sold ${s.ticker}.`);}save();render();}
function marketUpdate(){STOCKS.forEach(s=>{let move=(Math.random()-.48)*.16;if(state.trend&&state.trend.includes(s.name))move+=(state.trend.includes('strong')?.06:-.06);const old=s.price;s.price=Math.max(2,+(s.price*(1+move)).toFixed(2));s._change=(s.price/old-1)*100;});}
function endDay(auto=false){
 if(!state.started)return;state.cash+=dailyIncome();marketUpdate();const events=['A new startup gets attention across ProfitLands.','Consumer demand rises this morning.','A surprise supply issue hits one industry.','A major investor announces a new fund.','Markets open quietly after a calm night.'];const event=events[Math.floor(Math.random()*events.length)];state.news.push(event);state.day++;state.actions=MODES[state.mode].actions;state.timeLeft=MODES[state.mode].daySeconds;state.trend=null;save();render();if(!auto)toast(`Day ${state.day-1} ended. Welcome to Day ${state.day}!`);
}
function startTimer(){clearInterval(timerHandle);timerHandle=setInterval(()=>{if(!state.started)return;state.timeLeft--;if(state.timeLeft<=0){endDay(true);toast(`Day ${state.day-1} ended automatically.`)}render();save();},1000);}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1800);}
document.querySelectorAll('.mode-card').forEach(card=>card.addEventListener('click',()=>{document.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');state.mode=card.dataset.mode;}));
$('startGame').onclick=()=>{resetForMode(state.mode);$('homeScreen').classList.remove('active');$('gameScreen').classList.add('active');render();startTimer();};
document.querySelectorAll('.action-button').forEach(btn=>btn.onclick=()=>action(btn.dataset.action));
$('endDay').onclick=()=>endDay(false);
load();
if(state.started){$('homeScreen').classList.remove('active');$('gameScreen').classList.add('active');const selected=document.querySelector(`[data-mode="${state.mode}"]`);if(selected){document.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('selected'));selected.classList.add('selected');}render();startTimer();}
