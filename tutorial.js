/* ProfitLands first-time interactive tutorial */
(function(){
  const KEY='profitlands-tutorial-complete';
  let step=0,active=false;
  const steps=[
    {title:'Welcome to ProfitLands',body:'You start with $1,000. Your goal is to build an empire worth $1 trillion. Businesses, stocks, the economy, and major events all affect how quickly you grow.',target:null},
    {title:'Your cash and net worth',body:'Cash is the money you can spend right now. Net worth includes your cash plus the value of your investments and companies, minus debt. Your net worth also determines when larger corporations unlock.',target:'.stats-grid'},
    {title:'Start with a business',body:'Businesses are your main source of active income. Each one has its own price, expenses, popularity, and risk. Buy a business when you are ready, then manage it as conditions change.',target:'#openBusinessShop'},
    {title:'Your business can change every day',body:'Daily profit is not fixed. Popularity, location, demand, rent, wages, supply costs, the economy, random conditions, and major events can all change your results.',target:'#businessList'},
    {title:'Read the economy',body:'Economic Health shows the condition of the world economy. Rent, wages, demand, supply, and loan rates can move with it. As your empire gets larger, economic swings and event intensity become more dramatic.',target:'#economyPanel'},
    {title:'Read the news',body:'The news reports what is happening across ProfitLands. Natural disasters, industry changes, economic shocks, and other events can affect businesses and markets. Use the headlines to understand why things are changing.',target:'.news-panel'},
    {title:'Stocks: start with the basics',body:'Stocks represent shares of fictional companies. The price is what one share costs. The percentage beside it shows how much that stock changed during the latest market update. A positive percentage means the price rose; a negative percentage means it fell.',target:'.market-panel',stock:true},
    {title:'How to read a stock',body:'Look at three things: PRICE tells you what one share costs, CHANGE tells you the latest movement, and RISK describes how sensitive the stock is. You can click a stock to open its buy/sell screen. ProfitLands stocks usually move more gradually than businesses, but major events can still move them.',target:'.market-panel',stock:true},
    {title:'Buy and sell stocks',body:'Buying a share uses cash and gives you one share of that company. Selling a share gives you the current market price back. Your holdings and their current value appear in Your Holdings. There is no guarantee a stock will rise.',target:'.market-panel',stock:true},
    {title:'Loans can help, but they cost money',body:'If your cash reaches $0, an emergency loan may become available. Loans have interest and a 15-day repayment deadline. If you default, the game can place you into a fictional legal recovery period.',target:'#bankPanel'},
    {title:'Businesses can fail',body:'A business tracks its own financial balance. If losses reach the original purchase cost of your most expensive business, your empire enters Financial Recovery. The game then gives you a choice: continue temporarily and take another loss, or file for bankruptcy.',target:'#businessList'},
    {title:'What happens when you file bankruptcy?',body:'The failed company is liquidated and your empire is reset. Your stocks, property, major corporations, and loans are cleared. You do not automatically get a fixed $100. Instead, ProfitLands calculates an estimated owner recovery equal to 5% of the failed business\'s remaining liquidation value. The exact amount can change depending on the business and its value.',target:'#businessList'},
    {title:'The empire gets harder',body:'At $1M, $10M, $100M, $1B, $10B, $100B, and $1T in net worth, larger corporate opportunities unlock. The bigger your empire becomes, the greater its exposure to market and economic events.',target:'#majorCompaniesPanel'},
    {title:'You are ready',body:'Watch the economy, read the news, manage your businesses, and keep an eye on your stocks. Your first $1,000 is only the beginning.',target:null}
  ];
  function ensure(){
    if(document.getElementById('tutorialModal'))return;
    const m=document.createElement('div');
    m.id='tutorialModal';m.className='modal hidden';
    m.innerHTML='<div class="modal-card wide tutorial-card"><div class="tutorial-progress"><span id="tutorialProgress"></span><button id="tutorialSkip" class="tutorial-skip">Skip tutorial</button></div><div id="tutorialContent"></div><div class="tutorial-actions"><button id="tutorialBack" class="secondary-button">Back</button><button id="tutorialNext" class="primary-button">Next <span>→</span></button></div></div>';
    document.body.appendChild(m);
    m.querySelector('#tutorialSkip').onclick=finish;
    m.querySelector('#tutorialBack').onclick=()=>{if(step>0){step--;renderStep()}};
    m.querySelector('#tutorialNext').onclick=()=>{if(step<steps.length-1){step++;renderStep()}else finish()};
  }
  function clearHighlights(){document.querySelectorAll('.tutorial-highlight').forEach(x=>x.classList.remove('tutorial-highlight'))}
  function renderStep(){
    ensure();clearHighlights();
    const s=steps[step],target=s.target?document.querySelector(s.target):null;
    if(target){target.classList.add('tutorial-highlight');target.scrollIntoView({behavior:'smooth',block:'center'})}
    const content=document.getElementById('tutorialContent');
    const stockNote=s.stock?'<div class="tutorial-stock-example"><div><span>PRICE</span><b>$42.50</b></div><div><span>CHANGE</span><b>+2.1%</b></div><div><span>RISK</span><b>HIGH</b></div><p>If yesterday\'s price was $42.50 and today\'s change is +2.1%, the stock moved upward. A negative percentage means it moved downward.</p></div>':'';
    content.innerHTML='<span class="eyebrow">PROFITLANDS TUTORIAL · '+String(step+1).padStart(2,'0')+'/'+steps.length+'</span><h2>'+s.title+'</h2><p class="modal-sub tutorial-body">'+s.body+'</p>'+stockNote+(s.stock?'<p class="tutorial-tip">Tip: A rising price does not automatically mean a stock is a good purchase. Check the company, sector, risk, price, and current events before deciding what to do.</p>':'');
    document.getElementById('tutorialProgress').style.width=((step+1)/steps.length*100)+'%';
    document.getElementById('tutorialBack').disabled=step===0;
    document.getElementById('tutorialNext').innerHTML=step===steps.length-1?'Start Playing <span>→</span>':'Next <span>→</span>';
    document.getElementById('tutorialModal').classList.remove('hidden');
  }
  function finish(){
    active=false;clearHighlights();localStorage.setItem(KEY,'1');document.getElementById('tutorialModal')?.classList.add('hidden');
  }
  function start(){
    if(active||localStorage.getItem(KEY))return;
    active=true;step=0;setTimeout(renderStep,350);
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#startGame'))setTimeout(start,450);
  });
  window.ProfitLandsTutorial={start,reset:()=>localStorage.removeItem(KEY)};
})();