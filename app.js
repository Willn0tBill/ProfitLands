const MODES={fast:{name:'Fast',daySeconds:300,actions:4},standard:{name:'Standard',daySeconds:900,actions:6},long:{name:'Long',daySeconds:3600,actions:10},persistent:{name:'Persistent',daySeconds:86400,actions:12}};
const GOAL=1_000_000_000_000;
const STOCKS=[
{id:'nova',name:'NovaTech',ticker:'NVT',price:42.5,sector:'Technology',risk:'High'},
{id:'harbor',name:'Harbor Foods',ticker:'HFD',price:24.8,sector:'Consumer',risk:'Low'},
{id:'atlas',name:'Atlas Energy',ticker:'ATE',price:67.2,sector:'Energy',risk:'Medium'},
{id:'skyline',name:'Skyline Motors',ticker:'SKM',price:31.4,sector:'Industrial',risk:'Medium'}
];
const BUSINESS_TYPES=[
{id:'coffee',name:'Coffee Shop',icon:'☕',cost:500,baseRevenue:115,baseExpense:48,volatility:.28,desc:'Sells coffee, drinks, and quick food. Cheap to start and easy to expand.'},
{id:'restaurant',name:'Restaurant',icon:'🍔',cost:2000,baseRevenue:390,baseExpense:190,volatility:.32,desc:'Food sales with strong upside but higher operating costs.'},
{id:'gamestore',name:'Game Store',icon:'🎮',cost:5000,baseRevenue:760,baseExpense:420,volatility:.36,desc:'Sells games and electronics. Popularity can swing quickly.'},
{id:'hotel',name:'Hotel',icon:'🏨',cost:25000,baseRevenue:3300,baseExpense:1900,volatility:.25,desc:'Earns from rooms and hospitality. Expensive but steady.'},
{id:'dealership',name:'Car Dealership',icon:'🚗',cost:100000,baseRevenue:12500,baseExpense:7900,volatility:.4,desc:'Large transactions and large swings in demand.'},
{id:'factory',name:'Factory',icon:'🏭',cost:500000,baseRevenue:62000,baseExpense:41000,volatility:.2,desc:'Produces goods at scale. Strong margins when demand is healthy.'},
{id:'software',name:'Software Company',icon:'💻',cost:2500000,baseRevenue:330000,baseExpense:170000,volatility:.45,desc:'High-growth technology company with high demand volatility.'},
{id:'logistics',name:'Logistics Company',icon:'📦',cost:10000000,baseRevenue:1250000,baseExpense:770000,volatility:.24,desc:'Moves goods across ProfitLands and benefits from strong commerce.'}
];
const state={mode:'standard',playType:'single',day:1,cash:1000,stocks:{},businesses:[],property:0,actions:6,timeLeft:900,news:[],trend:null,started:false,lastDayProfit:0,bankrupt:false};
let timerHandle=null;
let dayEnding=false;
function syncTime(){if(!state.started||!state.dayEndsAt)return;state.timeLeft=Math.max(0,Math.ceil((state.dayEndsAt-Date.now())/1000));}
const $=id=>document.getElementById(id);
function money(n){if(Math.abs(n)>=1e12)return '$'+(n/1e12).toFixed(2)+'T';if(Math.abs(n)>=1e9)return '$'+(n/1e9).toFixed(2)+'B';if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(2)+'M';if(Math.abs(n)>=1e3)return '$'+Math.round(n).toLocaleString();return '$'+Math.round(n).toLocaleString()}
function save(){if(!window.profitlandsCrazyGames?.dataReady)localStorage.setItem('profitlands-v2',JSON.stringify(state));try{window.profitlandsSaveHook?.()}catch(e){console.warn('Save hook failed',e)}}
function load(){const raw=localStorage.getItem('profitlands-v2');if(!raw)return;try{const saved=JSON.parse(raw);Object.assign(state,saved)}catch(e){localStorage.removeItem('profitlands-v2')}}
function resetForMode(mode,type){state.mode=mode;state.playType=type;state.day=1;state.cash=1000;state.stocks=Object.fromEntries(STOCKS.map(s=>[s.id,{shares:0}]));state.businesses=[];state.property=0;state.actions=MODES[mode].actions;state.timeLeft=MODES[mode].daySeconds;state.dayEndsAt=Date.now()+MODES[mode].daySeconds*1000;state.news=['You founded your first company with $1,000.'];state.trend=null;state.started=true;state.lastDayProfit=0;state.bankrupt=false;save()}
function businessValue(b){const t=BUSINESS_TYPES.find(x=>x.id===b.type);return t.cost*(1+b.level*.15)+b.chainCount*t.cost*10*.55}
function businessDailyProfit(b){const t=BUSINESS_TYPES.find(x=>x.id===b.type);const levelMult=1+(b.level-1)*.22;const chainMult=1+b.chainCount*.9;const popularity=b.popularity/100;const revenue=t.baseRevenue*levelMult*chainMult*(.45+popularity*.8)*(1+b.marketing*.08);const expense=t.baseExpense*levelMult*chainMult*(1+b.efficiency*.07);return Math.round(revenue-expense)}
function netWorth(){return state.cash+STOCKS.reduce((sum,s)=>sum+s.price*(state.stocks[s.id]?.shares||0),0)+state.businesses.reduce((sum,b)=>sum+businessValue(b),0)+state.property*750}
function totalBusinessProfit(){return state.businesses.reduce((sum,b)=>sum+businessDailyProfit(b),0)}
function formatTime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;if(h)return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function render(){
$('modeName').textContent=MODES[state.mode].name;$('playType').textContent=state.playType==='multi'?'Multiplayer':'Singleplayer';$('gameDay').textContent=state.day;$('dayLabel')?.remove();$('cash').textContent=money(state.cash);$('netWorth').textContent=money(netWorth());$('dailyIncome').textContent=(state.lastDayProfit>=0?'+':'')+money(state.lastDayProfit);$('actionsLeft').textContent=state.actions;$('actionsMax').textContent=MODES[state.mode].actions;$('timer').textContent=formatTime(state.timeLeft);$('goalStatus').textContent=`$1T Empire Goal · ${((netWorth()/GOAL)*100).toFixed(6)}% complete`;
renderBusinesses();renderStocks();renderHoldings();renderNews();renderFinance();
if(state.trend){$('eventBanner').classList.remove('hidden');$('eventBanner').textContent='Research report: '+state.trend}else $('eventBanner').classList.add('hidden')
}
function renderBusinesses(){
if(!state.businesses.length){$('businessList').innerHTML='<div class="empty">No businesses yet. Buy one to start building your empire.</div>';return}
$('businessList').innerHTML=state.businesses.map((b,i)=>{const t=BUSINESS_TYPES.find(x=>x.id===b.type);const p=businessDailyProfit(b);return `<div class="business-card" data-business="${i}"><div class="business-top"><div><div class="business-name">${t.icon} ${b.name}</div><div class="business-type">${t.name} · Level ${b.level} · ${b.chainCount+1} location${b.chainCount?'s':''}</div></div><div class="business-profit">${p>=0?'+':''}${money(p)}/day</div></div><div class="business-meta"><div class="mini-stat"><small>POPULARITY</small><b>${Math.round(b.popularity)}%</b><div class="popbar"><i style="width:${Math.max(0,Math.min(100,b.popularity))}%"></i></div></div><div class="mini-stat"><small>REVENUE</small><b>${money(Math.max(0,p+b.expensePreview||0))}</b></div><div class="mini-stat"><small>UPGRADES</small><b>${b.level-1}</b></div><div class="mini-stat"><small>HEALTH</small><b class="${p<0?'danger':'good'}">${p<0?'LOSS':'PROFIT'}</b></div></div></div>`}).join('');
document.querySelectorAll('.business-card').forEach(el=>el.onclick=()=>openManage(Number(el.dataset.business)))
}
function renderStocks(){$('stockList').innerHTML=STOCKS.map(s=>{const h=state.stocks[s.id];const pct=s._change||0;return `<div class="stock" data-stock="${s.id}"><div><b>${s.name}</b><small>${s.ticker} · ${s.sector}</small></div><div class="stock-price">${money(s.price)}</div><div class="change ${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct.toFixed(1)}%</div></div>`}).join('');document.querySelectorAll('.stock').forEach(el=>el.onclick=()=>trade(el.dataset.stock))}
function renderHoldings(){const items=[];STOCKS.forEach(s=>{const h=state.stocks[s.id];if(h?.shares)items.push(`<div class="holding"><div><b>${s.ticker}</b><small>${h.shares} share${h.shares===1?'':'s'}</small></div><strong>${money(h.shares*s.price)}</strong></div>`)});if(state.businesses.length)items.push(`<div class="holding"><div><b>Businesses</b><small>${state.businesses.length} companies · ${state.businesses.reduce((n,b)=>n+b.chainCount+1,0)} locations</small></div><strong>${money(state.businesses.reduce((n,b)=>n+businessValue(b),0))}</strong></div>`);if(state.property)items.push(`<div class="holding"><div><b>Property</b><small>${state.property} owned</small></div><strong>${money(state.property*750)}</strong></div>`);$('holdings').innerHTML=items.length?items.join(''):'<div class="empty">Nothing here yet. Start building your empire.</div>'}
function renderNews(){$('newsFeed').innerHTML=state.news.slice(-6).reverse().map((n,i)=>`<div class="news-item"><span>${i===0?'NOW':'RECENT'}</span>${n}</div>`).join('')}
function renderFinance(){const p=totalBusinessProfit();const health=p>=0?'Healthy':'Under pressure';$('financeInfo').innerHTML=`<div class="finance-row"><span>Business profit today</span><b class="${p>=0?'good':'danger'}">${p>=0?'+':''}${money(p)}</b></div><div class="finance-row"><span>Businesses</span><b>${state.businesses.length}</b></div><div class="finance-row"><span>Total locations</span><b>${state.businesses.reduce((n,b)=>n+b.chainCount+1,0)}</b></div><div class="finance-row"><span>Financial health</span><b class="${p>=0?'good':'danger'}">${health}</b></div><div class="finance-row"><span>Empire goal</span><b>${money(GOAL)}</b></div>`}
function spendAction(cost){if(state.actions<=0){toast('No actions left. End the day to reset them.');return false}if(state.cash<cost){toast('Not enough cash.');return false}state.cash-=cost;state.actions--;return true}
function buyBusiness(typeId){const t=BUSINESS_TYPES.find(x=>x.id===typeId);if(!spendAction(t.cost))return;const b={type:typeId,name:`${t.name} #${state.businesses.length+1}`,level:1,popularity:50+Math.random()*20,marketing:0,efficiency:0,chainCount:0};state.businesses.push(b);state.news.push(`You opened ${b.name}. Its daily income will change with popularity.`);closeModal('businessModal');toast(`${t.name} opened.`);save();render()}
function action(type){if(type==='property'&&spendAction(750)){state.property++;state.news.push('You purchased property. It provides a small steady return each day.');toast('Property purchased.')}else if(type==='research'&&spendAction(150)){const s=STOCKS[Math.floor(Math.random()*STOCKS.length)];const up=Math.random()>.45;state.trend=`${s.name} looks ${up?'strong':'weak'} for the next market update.`;state.news.push(`Research says ${s.ticker} may be ${up?'stronger':'weaker'} tomorrow.`);toast('Research complete.')}save();render()}
function trade(id){
 const s=STOCKS.find(x=>x.id===id);if(!s)return;
 $('tradeContent').innerHTML=`<span class="eyebrow">STOCK MARKET</span><h2>${s.name}</h2><p class="modal-sub">${s.ticker} · ${s.sector} · Current price ${money(s.price)} · Risk: ${s.risk}</p><div class="trade-balance"><span>Cash</span><b>${money(state.cash)}</b></div><div class="trade-actions"><button class="trade-action" data-trade="buy"><b>Buy 1 Share</b><small>${money(s.price)}</small></button><button class="trade-action" data-trade="sell"><b>Sell 1 Share</b><small>Own: ${state.stocks[id]?.shares||0}</small></button></div>`;
 $('tradeModal').classList.remove('hidden');
 document.querySelectorAll('[data-trade]').forEach(btn=>btn.onclick=()=>tradeAction(id,btn.dataset.trade));
}
function tradeAction(id,actionType){
 const s=STOCKS.find(x=>x.id===id);if(!s)return;
 if(state.actions<=0)return toast('No actions left.');
 if(actionType==='buy'){
  if(state.cash<s.price)return toast('Not enough cash.');
  state.cash-=s.price;state.stocks[id].shares++;state.actions--;state.news.push(`You bought 1 share of ${s.ticker}.`);toast(`Bought ${s.ticker}.`);
 }else{
  if(!state.stocks[id]?.shares)return toast('You do not own that stock.');
  state.cash+=s.price;state.stocks[id].shares--;state.actions--;state.news.push(`You sold 1 share of ${s.ticker}.`);toast(`Sold ${s.ticker}.`);
 }
 closeModal('tradeModal');save();render();
}
function openManage(index){const b=state.businesses[index],t=BUSINESS_TYPES.find(x=>x.id===b.type),profit=businessDailyProfit(b),upgradeCost=Math.round(t.cost*(1+b.level*.75));const chainCost=t.cost*10;const marketingCost=Math.round(t.cost*.65*(b.marketing+1));const efficiencyCost=Math.round(t.cost*.7*(b.efficiency+1));$('manageContent').innerHTML=`<div class="manage-head"><div><span class="eyebrow">COMPANY MANAGEMENT</span><h2>${t.icon} ${b.name}</h2><p class="modal-sub">${t.desc}</p></div><div class="business-profit">${profit>=0?'+':''}${money(profit)}/day</div></div><div class="manage-stats"><div class="mini-stat"><small>LEVEL</small><b>${b.level}</b></div><div class="mini-stat"><small>POPULARITY</small><b>${Math.round(b.popularity)}%</b></div><div class="mini-stat"><small>LOCATIONS</small><b>${b.chainCount+1}</b></div><div class="mini-stat"><small>STATUS</small><b class="${profit<0?'danger':'good'}">${profit<0?'LOSING':'PROFITABLE'}</b></div></div><div class="manage-actions"><button class="upgrade-button" data-manage="upgrade"><b>⬆ Upgrade Business</b><small>Level ${b.level+1} · ${money(upgradeCost)}</small></button><button class="upgrade-button" data-manage="marketing"><b>📢 Marketing</b><small>+8 popularity · ${money(marketingCost)}</small></button><button class="upgrade-button" data-manage="efficiency"><b>⚙ Improve Efficiency</b><small>Lower daily expenses · ${money(efficiencyCost)}</small></button><button class="upgrade-button" data-manage="sell"><b>💰 Sell Business</b><small>Recover part of its current value</small></button></div><div class="chain-box"><b>🏢 Chain Expansion</b><p class="modal-sub">Open another ${t.name} location. The first expansion costs 10× the original business price. Each later location gets more expensive.</p><button class="chain-button" data-manage="chain" ${state.cash<chainCost?'disabled':''}>Open Location #${b.chainCount+2} · ${money(chainCost*(1+b.chainCount*.35))}</button></div>`;$('manageModal').classList.remove('hidden');document.querySelectorAll('[data-manage]').forEach(el=>el.onclick=()=>manageAction(index,el.dataset.manage));}
function manageAction(index,what){const b=state.businesses[index];if(!b)return;const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(what==='upgrade'){const cost=Math.round(t.cost*(1+b.level*.75));if(!spendAction(cost))return;b.level++;state.news.push(`${b.name} reached Level ${b.level}.`);toast('Business upgraded.')}else if(what==='marketing'){const cost=Math.round(t.cost*.65*(b.marketing+1));if(!spendAction(cost))return;b.marketing++;b.popularity=Math.min(100,b.popularity+8);toast('Marketing boosted popularity.')}else if(what==='efficiency'){const cost=Math.round(t.cost*.7*(b.efficiency+1));if(!spendAction(cost))return;b.efficiency++;toast('Efficiency improved.')}else if(what==='chain'){const cost=Math.round(t.cost*10*(1+b.chainCount*.35));if(!spendAction(cost))return;b.chainCount++;state.news.push(`${b.name} expanded to location #${b.chainCount+1}.`);toast('New chain location opened.')}else if(what==='sell'){const value=Math.round(businessValue(b)*.65);state.cash+=value;state.businesses.splice(index,1);state.news.push(`You sold ${b.name} for ${money(value)}.`);closeModal('manageModal');toast('Business sold.')}save();render();if(what!=='sell')openManage(index)}
function marketUpdate(){STOCKS.forEach(s=>{let move=(Math.random()-.48)*.16;if(state.trend&&state.trend.includes(s.name))move+=(state.trend.includes('strong')?.06:-.06);const old=s.price;s.price=Math.max(2,+(s.price*(1+move)).toFixed(2));s._change=(s.price/old-1)*100})}
function businessUpdate(){let total=0;state.businesses.forEach(b=>{const t=BUSINESS_TYPES.find(x=>x.id===b.type);const swing=(Math.random()-.5)*t.volatility*100;b.popularity=Math.max(5,Math.min(100,b.popularity+swing));total+=businessDailyProfit(b)});const propertyIncome=state.property*12;return total+propertyIncome}
function checkBankruptcy(){if(state.cash<0){state.cash=0}const p=totalBusinessProfit();if(state.businesses.length&&p<0&&state.cash<Math.abs(p)*2){state.news.push('⚠️ Financial warning: your companies are burning cash. Consider upgrading, expanding carefully, or selling a business.')}if(state.businesses.length&&state.cash===0&&p<0){state.news.push('🚨 Your empire is in a financial crisis. A recovery is possible, but continued losses may force asset sales.');state.bankrupt=true}else if(p>=0){state.bankrupt=false}}
function endDay(auto=false){if(!state.started)return;const profit=businessUpdate();state.cash+=profit;state.lastDayProfit=profit;marketUpdate();const events=['A new startup gets attention across ProfitLands.','Consumer demand rises this morning.','A surprise supply issue hits one industry.','A major investor announces a new fund.','Markets open quietly after a calm night.','A local trend changes customer behavior across several industries.'];const event=events[Math.floor(Math.random()*events.length)];state.news.push(event);checkBankruptcy();state.day++;state.actions=MODES[state.mode].actions;state.timeLeft=MODES[state.mode].daySeconds;state.dayEndsAt=Date.now()+MODES[state.mode].daySeconds*1000;state.trend=null;save();render();if(!auto)toast(`Day ${state.day-1} ended. Welcome to Day ${state.day}!`)}
function startTimer(){
 clearInterval(timerHandle);
 syncTime();
 timerHandle=setInterval(()=>{
  if(!state.started)return;
  syncTime();
  if(state.timeLeft<=0&&!dayEnding){
   dayEnding=true;
   endDay(true);
   dayEnding=false;
   toast(`Day ${state.day-1} ended automatically.`);
  }
  render();
 },250);
}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2000)}
function closeModal(id){$(id).classList.add('hidden')}
document.querySelectorAll('.mode-card').forEach(card=>card.addEventListener('click',()=>{document.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');state.mode=card.dataset.mode}));
document.querySelectorAll('.type-card').forEach(card=>card.addEventListener('click',()=>{document.querySelectorAll('.type-card').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');state.playType=card.dataset.type;$('multiNotice').classList.toggle('hidden',state.playType!=='multi')}));
window.startProfitLands=()=>{resetForMode(state.mode,state.playType);$('homeScreen').classList.remove('active');$('gameScreen').classList.add('active');render();startTimer();window.profitlandsCrazyGames?.gameplayStart()};
$('startGame').onclick=()=>window.startProfitLands();
$('openBusinessShop').onclick=()=>{$('businessChoices').innerHTML=BUSINESS_TYPES.map(t=>`<button class="business-choice" data-buy="${t.id}"><h4>${t.icon} ${t.name}</h4><p>${t.desc}</p><div class="choice-bottom"><span>Buy for ${money(t.cost)}</span><span>↑ Chain: ${money(t.cost*10)}</span></div></button>`).join('');$('businessModal').classList.remove('hidden');document.querySelectorAll('[data-buy]').forEach(el=>el.onclick=()=>buyBusiness(el.dataset.buy))};
document.querySelectorAll('.action-button').forEach(btn=>btn.onclick=()=>action(btn.dataset.action));document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>closeModal(btn.dataset.close));
$('endDay').onclick=()=>endDay(false);
$('endGame').onclick=()=>{
 if(!state.started)return;
 $('endGameContent').innerHTML='<span class="eyebrow">END GAME</span><h2>Save and leave this empire?</h2><p class="modal-sub">Your current game will stay saved. You can return to it later.</p><div class="confirm-actions"><button id="cancelEndGame" class="secondary-button">Keep Playing</button><button id="confirmEndGame" class="primary-button">Save & End Game</button></div>';
 $('endGameModal').classList.remove('hidden');
 $('cancelEndGame').onclick=()=>closeModal('endGameModal');
 $('confirmEndGame').onclick=()=>{
  state.started=false;syncTime();save();clearInterval(timerHandle);window.profitlandsCrazyGames?.gameplayStop();
  $('gameScreen').classList.remove('active');$('homeScreen').classList.add('active');
  closeModal('endGameModal');closeModal('manageModal');closeModal('businessModal');closeModal('settingsModal');closeModal('tradeModal');
  toast('Game saved. You can continue your empire later.');
 };
};
$('openSettings').onclick=()=>{$('settingsModal').classList.remove('hidden')};
load();
if(!window.profitlandsCrazyGames?.enabled && state.started){syncTime();$('homeScreen').classList.remove('active');$('gameScreen').classList.add('active');const selected=document.querySelector(`[data-mode="${state.mode}"]`);if(selected){document.querySelectorAll('.mode-card').forEach(x=>x.classList.remove('selected'));selected.classList.add('selected')}const type=document.querySelector(`[data-type="${state.playType}"]`);if(type){document.querySelectorAll('.type-card').forEach(x=>x.classList.remove('selected'));type.classList.add('selected')}render();startTimer()}
