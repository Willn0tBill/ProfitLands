/* ProfitLands dynamic economy, major corporations, risk, bankruptcy and world news */
(function(){
  const LOCS={
    downtown:{name:'Downtown',demand:1.22,rent:1.65},
    suburbs:{name:'Suburbs',demand:.94,rent:1.05},
    tourist:{name:'Tourist District',demand:1.35,rent:1.85},
    university:{name:'University District',demand:1.14,rent:1.20},
    waterfront:{name:'Waterfront',demand:1.18,rent:1.50},
    tech:{name:'Tech District',demand:1.10,rent:1.35},
    industrial:{name:'Industrial Park',demand:.88,rent:.82}
  };
  const RISK={
    coffee:{econ:.75,cost:.85,weather:.7,vol:.10},
    restaurant:{econ:1.05,cost:1.15,weather:.8,vol:.15},
    gamestore:{econ:1.00,cost:.9,weather:.5,vol:.18},
    hotel:{econ:1.10,cost:1.0,weather:1.15,vol:.12},
    dealership:{econ:1.35,cost:1.05,weather:.7,vol:.20},
    factory:{econ:.9,cost:1.35,weather:.75,vol:.09},
    software:{econ:1.25,cost:.65,weather:.35,vol:.23},
    logistics:{econ:1.0,cost:1.40,weather:1.20,vol:.13}
  };
  const MAJOR=[
    {id:'local',req:1e6,name:'Local Corporation',desc:'A multi-business company operating across one major market.',price:850000,rev:30000,expense:18000,vol:.14},
    {id:'regional',req:1e7,name:'Regional Corporation',desc:'A regional operator with a much larger footprint and workforce.',price:8000000,rev:280000,expense:190000,vol:.19},
    {id:'national',req:1e8,name:'National Corporation',desc:'A nationwide company exposed to consumer demand and large operating costs.',price:80000000,rev:2800000,expense:2000000,vol:.24},
    {id:'global',req:1e9,name:'Global Corporation',desc:'An international company exposed to global markets and supply chains.',price:800000000,rev:30000000,expense:22000000,vol:.29},
    {id:'conglomerate',req:1e10,name:'Conglomerate',desc:'A giant multi-industry company with several major business divisions.',price:8000000000,rev:320000000,expense:250000000,vol:.35},
    {id:'mega',req:1e11,name:'Mega Corporation',desc:'A world-scale corporation where small market changes can move billions.',price:80000000000,rev:3500000000,expense:2900000000,vol:.42},
    {id:'empire',req:1e12,name:'Global Empire',desc:'The final corporate tier, operating at enormous global scale.',price:850000000000,rev:40000000000,expense:35000000000,vol:.50}
  ];
  const EVENTS=[
    {id:'consumer_boom',title:'Consumer Spending Surges',type:'economic',duration:2,weight:10,text:'Consumers increased spending across several major markets today, giving retailers, restaurants, and entertainment businesses a noticeable boost.',effects:{health:5,demand:1.08,stocks:.018}},
    {id:'consumer_slowdown',title:'Consumer Spending Slows',type:'economic',duration:3,weight:10,text:'Consumer spending weakened across several major markets today. Retailers and restaurants are seeing fewer customers as households become more cautious.',effects:{health:-6,demand:.92,stocks:-.022}},
    {id:'rent_crisis',title:'Commercial Rents Rise',type:'economic',duration:3,weight:8,text:'Commercial property demand has increased in several major markets, pushing rents higher for businesses looking to expand. High-demand districts are feeling the largest increase.',effects:{rent:1.10,health:-2}},
    {id:'rent_relief',title:'Commercial Rent Pressure Eases',type:'economic',duration:3,weight:6,text:'More commercial space has become available across ProfitLands, easing rent pressure and giving expanding companies some breathing room.',effects:{rent:.92,health:2}},
    {id:'wage_surge',title:'Labor Costs Increase',type:'economic',duration:3,weight:7,text:'Businesses across ProfitLands are competing for workers, pushing wages and staffing costs higher in several industries.',effects:{wage:1.10,health:-2}},
    {id:'shipping',title:'Shipping Routes Disrupted',type:'world',duration:3,weight:8,text:'Several major shipping routes are experiencing delays today. Manufacturers and logistics companies are facing higher transportation costs as supplies take longer to arrive.',effects:{supply:1.14,health:-3,stocks:-.012}},
    {id:'supply_shortage',title:'Key Materials Become Scarce',type:'world',duration:3,weight:7,text:'A shortage of key materials is forcing manufacturers to compete for limited supplies. Production costs are rising while some companies warn of further delays.',effects:{supply:1.18,health:-4}},
    {id:'tech_boom',title:'Technology Sector Rallies',type:'economic',duration:3,weight:6,text:'New developments in technology have sparked stronger demand for software and digital services. Investors are paying close attention to the sector.',effects:{tech:1.16,health:3,stocks:.035}},
    {id:'travel_boom',title:'Travel Demand Jumps',type:'economic',duration:2,weight:6,text:'Travel activity increased sharply today, bringing more visitors into major tourism districts. Hotels and nearby businesses are reporting stronger customer traffic.',effects:{travel:1.18,demand:1.04,health:3}},
    {id:'market_panic',title:'Markets Turn Cautious',type:'economic',duration:2,weight:5,text:'Investors turned cautious today as concerns about the broader economy spread through financial markets. Stock prices are moving more sharply than usual.',effects:{health:-7,demand:.96,stocks:-.05}},
    {id:'investor_confidence',title:'Investor Confidence Improves',type:'economic',duration:2,weight:5,text:'Improving economic expectations have increased investor confidence today. Financial markets are seeing stronger activity as businesses prepare new expansion plans.',effects:{health:6,stocks:.045}},
    {id:'credit_tight',title:'Lenders Tighten Credit',type:'economic',duration:4,weight:5,text:'Banks are becoming more cautious about lending as economic uncertainty increases. Borrowing costs have moved higher for companies seeking new capital.',effects:{health:-4,loan:.025,stocks:-.015}},
    {id:'stimulus',title:'Economic Support Announced',type:'world',duration:3,weight:4,text:'A broad economic support program is encouraging new spending and investment across ProfitLands. Businesses are watching closely for signs of stronger demand.',effects:{health:7,demand:1.06,stocks:.025}},
    {id:'wildfire',title:'Wildfires Disrupt Western Regions',type:'natural',duration:3,weight:5,text:'Wildfires have disrupted transportation and local business activity across several western regions of ProfitLands. Delivery routes are delayed, tourism is weaker, and affected businesses face higher operating costs.',effects:{health:-5,weather:1.18,demand:.94,supply:1.10,stocks:-.018}},
    {id:'flood',title:'Flooding Disrupts Waterfront Markets',type:'natural',duration:2,weight:4,text:'Flooding has disrupted several waterfront districts today. Local travel has slowed, transportation routes are being rerouted, and nearby businesses are dealing with temporary operating problems.',effects:{health:-4,weather:1.16,demand:.93,supply:1.08}},
    {id:'storm',title:'Severe Storms Disrupt Commerce',type:'natural',duration:2,weight:4,text:'Severe storms are disrupting commerce across several regions. Some businesses are seeing lower foot traffic while transportation companies deal with delays and higher costs.',effects:{health:-4,weather:1.14,demand:.95,supply:1.07}},
    {id:'drought',title:'Drought Raises Production Costs',type:'natural',duration:4,weight:3,text:'A prolonged dry period is putting pressure on certain production and food supply networks. Businesses dependent on materials and agriculture are preparing for higher costs.',effects:{health:-3,supply:1.12}},
    {id:'revitalization',title:'New Commercial District Opens',type:'world',duration:4,weight:5,text:'A major commercial development opened today, changing traffic patterns and creating new opportunities for nearby businesses. Property demand is shifting as companies reconsider where to expand.',effects:{health:3,demand:1.04,rent:1.04}}
  ];
  const WEEK=[
    {name:'Monday',normal:3,extreme:.06},{name:'Tuesday',normal:2.5,extreme:.035},{name:'Wednesday',normal:3,extreme:.045},
    {name:'Thursday',normal:3.5,extreme:.05},{name:'Friday',normal:4.5,extreme:.075},{name:'Saturday',normal:3,extreme:.05},{name:'Sunday',normal:2,extreme:.025}
  ];
  function ensure(){
    state.economy=state.economy||{};
    const e=state.economy;
    if(typeof e.health!=='number')e.health=60;
    if(!Array.isArray(e.history))e.history=[];
    if(typeof e.trend!=='number')e.trend=0;
    if(typeof e.rentIndex!=='number')e.rentIndex=1;
    if(typeof e.wageIndex!=='number')e.wageIndex=1;
    if(typeof e.demandIndex!=='number')e.demandIndex=1;
    if(typeof e.supplyIndex!=='number')e.supplyIndex=1;
    if(typeof e.loanRate!=='number')e.loanRate=.08;
    if(!Array.isArray(e.activeEvents))e.activeEvents=[];
    if(typeof e.lastEventId!=='string')e.lastEventId='';
    if(!Array.isArray(state.loans))state.loans=[];
    if(typeof state.penaltyDays!=='number')state.penaltyDays=0;
    if(typeof state.bankruptcyCount!=='number')state.bankruptcyCount=0;
    if(!Array.isArray(state.majorCompanies))state.majorCompanies=[];
    (state.businesses||[]).forEach(b=>{
      const t=BUSINESS_TYPES.find(x=>x.id===b.type);
      if(!t)return;
      if(typeof b.originalCost!=='number')b.originalCost=t.cost;
      if(typeof b.financialBalance!=='number')b.financialBalance=0;
      if(typeof b.bankruptcyPending!=='boolean')b.bankruptcyPending=false;
      if(typeof b.locations?.length!=='number'&&Array.isArray(b.locations)){}
    });
  }
  function tier(){
    const n=typeof netWorth==='function'?netWorth():0;
    let i=0;for(let x=0;x<MAJOR.length;x++)if(n>=MAJOR[x].req)i=x+1;
    return i;
  }
  function economyLabel(h){if(h>=90)return'Boom';if(h>=70)return'Strong';if(h>=45)return'Normal';if(h>=25)return'Weak';return'Recession'}
  function eventSeverity(){return 1+tier()*.12}
  function activeEffect(key){
    let v=1;
    state.economy.activeEvents.forEach(a=>{const ev=EVENTS.find(x=>x.id===a.id);if(ev&&ev.effects&&ev.effects[key]!=null)v*=ev.effects[key]});
    return v;
  }
  function riskFor(b){return RISK[b.type]||{econ:1,cost:1,weather:.7,vol:.15}}
  function locationList(b){
    if(Array.isArray(b.locations)&&b.locations.length)return b.locations;
    return [{id:'downtown',name:'Downtown',demand:1.22,rent:1.65,basePopularity:b.popularity||55}];
  }
  function businessProfit(b){
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(!t)return 0;
    const r=riskFor(b), e=state.economy, scale=1+tier()*.045;
    const lvl=1+(b.level-1)*.22;
    const basePop=Math.max(5,Math.min(100,b.popularity||55));
    let total=0;
    locationList(b).forEach((l,i)=>{
      const loc=LOCS[l.id]||{demand:l.demand||1,rent:l.rent||1};
      const pop=Math.max(0,Math.min(100,(l.basePopularity??basePop)+b.marketing*1.5))/100;
      const seeded=Math.sin((state.day*97+i*31+String(l.id).length*17)+b.type.length)*43758.5453;
      const noise=(seeded-Math.floor(seeded))-.5;
      const random=1+noise*(r.vol*(1+tier()*.22)+.08);
      const demand=e.demandIndex*loc.demand*activeEffect('demand')*(1+(e.health-60)/250*r.econ);
      const revenue=t.baseRevenue*lvl*demand*(.45+pop*.8)*(1+b.marketing*.08)*Math.max(.55,random)*scale;
      const cost=t.baseExpense*lvl*loc.rent*e.rentIndex*e.wageIndex*e.supplyIndex*r.cost*activeEffect('supply')*(1+(100-e.health)/280*r.econ)*Math.max(.75,1-noise*.15);
      total+=revenue-cost;
    });
    if(b.type==='software')total*=activeEffect('tech');
    if(b.type==='hotel')total*=activeEffect('travel');
    total*=activeEffect('weather')>1?(1-(activeEffect('weather')-1)*.10*r.weather):1;
    return Math.round(total);
  }
  function businessValue2(b){
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(!t)return 0;
    const locs=locationList(b);
    let v=t.cost*(1+b.level*.15);
    for(let i=1;i<locs.length;i++)v+=t.cost*10*(1+(i-1)*.35)*.55;
    return Math.round(v);
  }
  function majorValue(c){return c.value||0}
  function calcNetWorth(){
    const stockValue=STOCKS.reduce((s,x)=>s+x.price*(state.stocks?.[x.id]?.shares||0),0);
    return Math.max(0,state.cash)+stockValue+(state.businesses||[]).reduce((s,b)=>s+businessValue2(b),0)+(state.property||0)*750+(state.majorCompanies||[]).reduce((s,c)=>s+majorValue(c),0)-state.loans.reduce((s,l)=>s+(l.balance||0),0);
  }
  function majorDaily(c){
    const d=MAJOR.find(x=>x.id===c.type);if(!d)return 0;
    const e=state.economy,vol=d.vol*(1+tier()*.15),noise=(Math.random()-.5)*2*vol;
    const econ=1+(e.health-60)/180;
    const event=activeEffect('demand')*activeEffect('supply');
    return Math.round((d.rev*econ*event*(1+noise)-d.expense*(1+(60-e.health)/220)*(1+Math.max(0,noise)*.35))* (1+Math.min(3,tier())*.02));
  }
  function stockUpdate(){
    const t=tier(), severity=1+t*.18;
    STOCKS.forEach(s=>{
      let sector=0;
      if(s.id==='nova')sector=activeEffect('tech')-1;
      if(s.id==='harbor')sector=activeEffect('demand')-1;
      if(s.id==='atlas')sector=activeEffect('supply')-1;
      if(s.id==='skyline')sector=(activeEffect('demand')-1)*.7;
      const base=(Math.random()-.5)*(.045+Math.min(1.5,t*.12));
      const econ=(state.economy.health-60)/250*(s.risk==='High'?1.2:s.risk==='Low'?.65:1);
      const event=activeEffect('stocks')-1;
      const move=Math.max(-.12,Math.min(.12,base+econ+sector*.55+event));
      const old=s.price;s.price=Math.max(2,+(s.price*(1+move)).toFixed(2));s._change=(s.price/old-1)*100;
    });
  }
  function chooseEvent(){
    const t=tier(), e=state.economy;
    const econChance=Math.min(.85,.18+t*.045);
    const naturalChance=Math.min(.38,.07+t*.025);
    const events=[];
    if(Math.random()<econChance)events.push('economic');
    if(Math.random()<naturalChance)events.push('natural');
    if(Math.random()<.08+t*.025)events.push('world');
    if(!events.length)return [];
    const chosen=[];
    events.forEach(type=>{
      const pool=EVENTS.filter(x=>x.type===type&&x.id!==e.lastEventId);
      if(pool.length){
        const total=pool.reduce((s,x)=>s+x.weight,0),r=Math.random()*total;
        let n=0,poolPick=pool[0];for(const x of pool){n+=x.weight;if(r<=n){poolPick=x;break}}
        chosen.push(poolPick);
      }
    });
    return chosen.slice(0,Math.min(3,1+Math.floor(t/3)));
  }
  function applyEvents(){
    const e=state.economy;
    e.activeEvents=(e.activeEvents||[]).map(a=>({...a,days:a.days-1})).filter(a=>a.days>0);
    const chosen=chooseEvent();
    const severity=eventSeverity();
    chosen.forEach(ev=>{
      e.activeEvents.push({id:ev.id,days:ev.duration});
      e.lastEventId=ev.id;
      if(ev.effects.health)e.health+=ev.effects.health*severity;
      if(ev.effects.rent)e.rentIndex*=Math.pow(ev.effects.rent,Math.min(1.5,severity));
      if(ev.effects.wage)e.wageIndex*=Math.pow(ev.effects.wage,Math.min(1.5,severity));
      if(ev.effects.demand)e.demandIndex*=Math.pow(ev.effects.demand,Math.min(1.4,severity));
      if(ev.effects.supply)e.supplyIndex*=Math.pow(ev.effects.supply,Math.min(1.4,severity));
      if(ev.effects.loan)e.loanRate+=ev.effects.loan*severity;
      state.news.push(ev.title+' — '+ev.text);
    });
    return chosen;
  }
  function updateEconomy(){
    const e=state.economy,w=WEEK[(state.day-1)%7],t=tier();
    const h=e.health, hist=e.history.slice(-5),avg=hist.length?hist.reduce((a,b)=>a+b,0)/hist.length:h;
    const momentum=hist.length?((hist[hist.length-1]-hist[0])/Math.max(1,hist.length-1))*.7:0;
    const mean=(60-h)*.045;
    let move=momentum*.35+mean+(Math.random()-.5)*w.normal*(1+t*.12);
    if(Math.random()<w.extreme*(1+t*.18))move+=(Math.random()<.5?-1:1)*(10+Math.random()*16)*(1+t*.10);
    e.health=Math.max(0,Math.min(100,h+move));
    e.trend=Math.round(move*10)/10;
    e.history.push(e.health);if(e.history.length>14)e.history.shift();
    e.rentIndex=Math.max(.72,Math.min(1.9,e.rentIndex*.96+((1+(60-e.health)/180)+activeEffect('rent')*.04)*.04));
    e.wageIndex=Math.max(.80,Math.min(1.7,e.wageIndex*.97+(1+(60-e.health)/240)*.03));
    e.demandIndex=Math.max(.70,Math.min(1.35,e.demandIndex*.93+(1+(e.health-60)/220)*.07));
    e.supplyIndex=Math.max(.80,Math.min(1.6,e.supplyIndex*.94+activeEffect('supply')*.06));
    e.loanRate=Math.max(.045,Math.min(.22,e.loanRate*.9+.08*.1+(60-e.health)/2000));
    applyEvents();
    e.health=Math.max(0,Math.min(100,e.health));
  }
  function businessUpdate(){
    let total=0;
    (state.businesses||[]).forEach(b=>{
      const profit=businessProfit(b);
      b.financialBalance=(b.financialBalance||0)+profit;
      total+=profit;
      const r=riskFor(b);
      const popMove=(Math.random()-.5)*(5+r.vol*8)*(1+tier()*.08);
      b.popularity=Math.max(5,Math.min(100,(b.popularity||55)+popMove));
      if(b.locations)b.locations.forEach(l=>{l.basePopularity=Math.max(5,Math.min(100,(l.basePopularity||b.popularity)+popMove*.35))});
      /* Individual companies can accumulate losses, but the global Financial Recovery popup
         only activates when the player's largest company reaches its own loss threshold. */
      const biggest=(state.businesses||[]).reduce((largest,x)=>{
        const xCost=Math.abs(x.originalCost||BUSINESS_TYPES.find(t=>t.id===x.type)?.cost||0);
        const lCost=largest?Math.abs(largest.originalCost||BUSINESS_TYPES.find(t=>t.id===largest.type)?.cost||0):0;
        return xCost>lCost?x:largest;
      },null);
      const threshold=biggest?Math.abs(biggest.originalCost||BUSINESS_TYPES.find(t=>t.id===biggest.type)?.cost||1):0;
      if(biggest===b && threshold>0 && b.financialBalance<=-threshold && !b.bankruptcyPending){
        b.bankruptcyPending=true;
        state.news.push('FINANCIAL SYSTEM — A major company has reached its maximum loss threshold. Financial recovery procedures are now available.');
      }
    });
    return total;
  }
  function majorUpdate(){
    let total=0;
    (state.majorCompanies||[]).forEach(c=>{const p=majorDaily(c);c.financialBalance=(c.financialBalance||0)+p;total+=p});
    return total;
  }
  function processLoans(){
    state.loans=(state.loans||[]).filter(l=>l.balance>0);
    state.loans.forEach(l=>{l.daysLeft=Math.max(0,(l.dueDay||state.day)-state.day);if(state.day>l.dueDay&&!l.defaulted){l.defaulted=true;l.defaultedDay=state.day;state.penaltyDays=3;state.news.push('Credit Default — a loan payment deadline has passed. Lenders have placed the account into a legal recovery period.');}});
    if(state.penaltyDays>0)state.penaltyDays--;
  }
  function recovery(){
    if(state.penaltyDays>0)return;
    const def=(state.loans||[]).find(l=>l.defaulted&&l.balance>0&&!l.recoveryOffered);
    if(!def)return;
    def.recoveryOffered=true;
    const modal=document.getElementById('economyModal')||makeModal();
    modal.querySelector('.economy-modal-content').innerHTML='<span class="eyebrow">FINANCIAL RECOVERY</span><h2>Recovery opportunity</h2><p class="modal-sub">A legal recovery opportunity is available while your account is in default. Choose a way to rebuild cash and address the debt.</p><div class="recovery-grid"><button class="recovery-choice" data-recovery="work"><b>Temporary Contract</b><small>Earn a guaranteed recovery payment through a short-term contract.</small></button><button class="recovery-choice" data-recovery="negotiate"><b>Negotiate a Payment Plan</b><small>Reduce the immediate pressure and extend the repayment schedule.</small></button><button class="recovery-choice" data-recovery="sell"><b>Liquidate Remaining Assets</b><small>Convert part of your remaining assets into cash.</small></button></div>';
    modal.classList.remove('hidden');
    modal.querySelectorAll('[data-recovery]').forEach(b=>b.onclick=()=>{const kind=b.dataset.recovery;if(kind==='work'){state.cash+=Math.min(50000,Math.max(2500,def.balance*.08));def.balance=Math.max(0,def.balance*.92)}else if(kind==='negotiate'){def.dueDay=state.day+10;def.balance=Math.max(0,def.balance*.95);def.defaulted=false;def.recoveryOffered=false}else{const assets=(state.businesses||[]).reduce((s,x)=>s+businessValue2(x),0)*.35;state.cash+=Math.round(assets);state.businesses=[];def.balance=Math.max(0,def.balance-assets*.2)}save();render();modal.classList.add('hidden')});
  }
  function makeModal(){
    let m=document.getElementById('economyModal');if(m)return m;
    m=document.createElement('div');m.id='economyModal';m.className='modal hidden';m.innerHTML='<div class="modal-card wide economy-modal-content"></div>';document.body.appendChild(m);return m;
  }
  function bankruptcyModal(index){
    const b=state.businesses[index];if(!b)return;
    const m=makeModal(),t=BUSINESS_TYPES.find(x=>x.id===b.type);
    const liquidationValue=Math.max(0,businessValue2(b)+Math.min(0,b.financialBalance||0));
    const recoveryPayout=Math.round(liquidationValue*.05);
    m.querySelector('.economy-modal-content').innerHTML='<span class="eyebrow">FINANCIAL RECOVERY</span><h2>'+t.icon+' Financial recovery required</h2><p class="modal-sub">'+b.name+' has reached its maximum loss threshold of '+money(b.originalCost)+'. This is the largest company in your empire, so your empire has entered financial recovery.</p><div class="recovery-summary"><div><small>ESTIMATED LIQUIDATION VALUE</small><b>'+money(liquidationValue)+'</b></div><div><small>ESTIMATED OWNER RECOVERY</small><b>'+money(recoveryPayout)+'</b></div></div><p class="tutorial-tip">The recovery amount is variable, not a fixed $100. ProfitLands estimates owner recovery at 5% of the business\'s remaining liquidation value. This is a game approximation; real bankruptcy outcomes can vary and creditors may receive the proceeds first.</p><div class="bankruptcy-actions"><button class="secondary-button" id="continueRisk">Continue Temporarily</button><button class="primary-button danger-primary" id="fileBankruptcy">File for Bankruptcy</button></div>';
    m.classList.remove('hidden');
    document.getElementById('continueRisk').onclick=()=>{b.financialBalance-=Math.round(b.originalCost*.15);m.classList.add('hidden');save();render()};
    document.getElementById('fileBankruptcy').onclick=()=>{
      state.cash=recoveryPayout;
      state.businesses=[];
      Object.keys(state.stocks||{}).forEach(id=>{state.stocks[id].shares=0});
      state.property=0;
      state.majorCompanies=[];
      state.loans=[];
      state.bankruptcyCount++;
      state.news.push('Bankruptcy Filed — the company has been liquidated and operations have been reset. Owner recovery: '+money(recoveryPayout)+'.');
      m.classList.add('hidden');save();render();
    };
  }
  function checkBankruptcies(){
    const businesses=state.businesses||[];
    const biggest=businesses.reduce((largest,x)=>{
      const xCost=Math.abs(x.originalCost||BUSINESS_TYPES.find(t=>t.id===x.type)?.cost||0);
      const lCost=largest?Math.abs(largest.originalCost||BUSINESS_TYPES.find(t=>t.id===largest.type)?.cost||0):0;
      return xCost>lCost?x:largest;
    },null);
    if(!biggest)return;
    const threshold=Math.abs(biggest.originalCost||BUSINESS_TYPES.find(t=>t.id===biggest.type)?.cost||1);
    if(biggest.financialBalance<=-threshold && !biggest.bankruptcyPending)biggest.bankruptcyPending=true;
    const i=businesses.indexOf(biggest);
    if(i>=0 && biggest.bankruptcyPending)setTimeout(()=>bankruptcyModal(i),0);
  }
  function majorPanel(){
    let panel=document.getElementById('majorCompaniesPanel');if(panel)return panel;
    panel=document.createElement('div');panel.id='majorCompaniesPanel';panel.className='panel major-companies-panel';
    const target=document.querySelector('.dashboard-grid');target?.parentNode.insertBefore(panel,target.nextSibling);
    return panel;
  }
  function renderMajor(){
    const p=majorPanel();if(!p)return;
    const n=calcNetWorth(),t=tier();
    p.innerHTML='<div class="panel-head"><div><span class="eyebrow">CORPORATE LADDER</span><h3>Major Companies</h3></div><span class="live-tag">SCALE '+t+'</span></div><p class="modal-sub">Major corporations unlock at net-worth thresholds. Larger companies generate more money, but their exposure to the economy and major events increases.</p><div class="major-grid">'+MAJOR.map((d,i)=>{const owned=state.majorCompanies.some(c=>c.type===d.id),unlocked=n>=d.req,active=i<t;return '<div class="major-card '+(unlocked?'unlocked ':'locked ')+'"><div><span class="major-tier">TIER '+(i+1)+'</span><h4>'+d.name+'</h4><small>'+d.desc+'</small></div><div class="major-meta"><span>Unlock '+money(d.req)+'</span><span>Risk '+['Low','Moderate','High','Very High','Extreme','Severe','Maximum'][i]+'</span></div><button class="major-buy" data-major="'+d.id+'" '+((!unlocked||owned||state.cash<d.price)?'disabled':'')+'>'+ (owned?'OWNED':unlocked?'Buy for '+money(d.price):'Locked until '+money(d.req))+'</button></div>'}).join('')+'</div>';
    p.querySelectorAll('[data-major]').forEach(b=>b.onclick=()=>buyMajor(b.dataset.major));
  }
  function buyMajor(id){
    const d=MAJOR.find(x=>x.id===id);if(!d)return;
    if(calcNetWorth()<d.req)return toast('Reach the required net worth first.');
    if(state.majorCompanies.some(c=>c.type===id))return toast('You already own this corporation.');
    if(state.cash<d.price)return toast('You need enough cash to purchase this corporation.');
    if(state.actions<=0)return toast('No actions left.');
    state.cash-=d.price;state.actions--;
    state.majorCompanies.push({type:id,name:d.name,value:d.price,financialBalance:0});
    state.news.push('CORPORATE LANDSCAPE — '+d.name+' has entered the ProfitLands economy, adding another major competitor to the corporate market.');
    save();render();
  }
  function economyUI(){
    let box=document.getElementById('economyPanel');if(!box){box=document.createElement('div');box.id='economyPanel';box.className='panel economy-panel';const target=document.querySelector('.dashboard-grid');target?.parentNode.insertBefore(box,target)} 
    const e=state.economy,t=tier(),events=e.activeEvents.map(a=>EVENTS.find(x=>x.id===a.id)?.title+' ('+a.days+'d)').filter(Boolean);
    box.innerHTML='<div class="panel-head"><div><span class="eyebrow">WORLD ECONOMY</span><h3>Economic Conditions</h3></div><span class="live-tag">'+economyLabel(e.health).toUpperCase()+'</span></div><div class="economy-meter"><div><strong>'+Math.round(e.health)+'</strong><small>/ 100</small></div><div class="economy-bar"><i style="width:'+e.health+'%"></i></div></div><div class="economy-stats"><div><small>RENT INDEX</small><b>'+e.rentIndex.toFixed(2)+'×</b></div><div><small>WAGE INDEX</small><b>'+e.wageIndex.toFixed(2)+'×</b></div><div><small>DEMAND</small><b>'+Math.round(e.demandIndex*100)+'%</b></div><div><small>LOAN RATE</small><b>'+((e.loanRate)*100).toFixed(1)+'%</b></div></div><div class="economy-events"><small>ACTIVE EVENTS</small><b>'+(events.length?events.join(' · '):'No major active events')+'</b></div><div class="economy-tier">Corporate scale: <b>'+(['Starting','Local','Regional','National','Global','Conglomerate','Mega','Empire'][t]||'Starting')+'</b> · Event intensity increases as your empire grows.</div>';
    renderMajor();
  }
  function bankPanel(){
    let b=document.getElementById('bankPanel');if(!b){b=document.createElement('div');b.id='bankPanel';b.className='panel bank-panel';const target=document.querySelector('.bottom-grid');target?.parentNode.insertBefore(b,target.nextSibling)}
    const debt=state.loans.reduce((s,l)=>s+(l.balance||0),0),loan=state.loans.find(l=>!l.defaulted&&l.balance>0),can=state.cash<=0&&!loan&&state.penaltyDays<=0;
    b.innerHTML='<div class="panel-head"><div><span class="eyebrow">BANK & CREDIT</span><h3>Financial Recovery</h3></div><span class="live-tag">'+(loan?'LOAN ACTIVE':'BANK')+'</span></div><div class="finance-row"><span>Total debt</span><b>'+money(debt)+'</b></div><div class="finance-row"><span>Credit status</span><b class="'+(state.penaltyDays?'danger':'good')+'">'+(state.penaltyDays?'LEGAL RECOVERY PERIOD':'ACTIVE')+'</b></div><div class="finance-row"><span>Loan terms</span><b>15 days · '+(state.economy.loanRate*100).toFixed(1)+'% interest</b></div><button class="primary-button" id="borrowLoan" '+(can?'':'disabled')+'>Borrow Emergency Loan</button><small class="bank-note">'+(state.cash>0?'Emergency loans become available when cash reaches $0.':state.penaltyDays?'Borrowing is paused during the recovery period.':loan?'A loan is already active.':'A loan is available now.')+'</small>';
    b.querySelector('#borrowLoan')?.addEventListener('click',borrowLoan);
  }
  function borrowLoan(){
    if(state.cash>0||state.loans.some(l=>!l.defaulted&&l.balance>0)||state.penaltyDays>0)return;
    const amount=Math.max(1000,Math.min(100000000,Math.round(Math.max(1000,Math.abs(totalBusinessProfit())*3+5000))));
    const balance=Math.round(amount*(1+state.economy.loanRate));
    state.cash+=amount;state.loans.push({principal:amount,balance,dueDay:state.day+15,daysLeft:15,defaulted:false,recoveryOffered:false});
    state.news.push('CREDIT MARKETS — Emergency lending activity increased today as several companies sought short-term financing to cover operating costs.');
    save();render();
  }
  function reset(mode,type){
    window.resetProfitLandsMarket?.();
    state.mode=mode;state.playType=type;state.day=1;state.cash=1000;state.stocks=Object.fromEntries(STOCKS.map(s=>[s.id,{shares:0}]));state.businesses=[];state.property=0;state.actions=MODES[mode].actions;state.timeLeft=MODES[mode].daySeconds;state.dayEndsAt=Date.now()+MODES[mode].daySeconds*1000;state.news=[];state.trend=null;state.started=true;state.lastDayProfit=0;state.bankrupt=false;state.economy={health:60,history:[60],trend:0,rentIndex:1,wageIndex:1,demandIndex:1,supplyIndex:1,loanRate:.08,activeEvents:[],lastEventId:''};state.loans=[];state.penaltyDays=0;state.bankruptcyCount=0;state.majorCompanies=[];state.news.push('MARKET OPEN — ProfitLands begins the day with a stable economy and $1,000 in starting capital.');save();
  }
  function doEndDay(auto){
    if(!state.started)return;
    ensure();
    const previous=state.day;
    const profit=businessUpdate()+majorUpdate()+((state.property||0)*12);
    state.cash+=profit;state.lastDayProfit=profit;
    updateEconomy();
    stockUpdate();
    processLoans();
    state.day++;
    state.actions=MODES[state.mode].actions;
    state.timeLeft=MODES[state.mode].daySeconds;
    state.dayEndsAt=Date.now()+MODES[state.mode].daySeconds*1000;
    state.trend=null;
    const e=state.economy;
    state.news.push('MARKET REPORT — The economy is '+economyLabel(e.health).toLowerCase()+' at '+Math.round(e.health)+'/100. '+(e.trend>=0?'Economic activity strengthened':'Economic activity weakened')+' during the latest cycle.');
    if(e.activeEvents.length){
      const active=e.activeEvents.map(a=>{const ev=EVENTS.find(x=>x.id===a.id);return ev?ev.title+' ('+a.days+' day'+(a.days===1?'':'s')+' left)':''}).filter(Boolean);
      if(active.length)state.news.push('WORLD DESK — '+active.join(' · ')+'. Businesses are adjusting to the changing conditions.');
    }
    if(profit<0)state.news.push('CORPORATE RESULTS — Companies across ProfitLands are reporting pressure on margins as operating costs and demand continue to shift.');
    else state.news.push('CORPORATE RESULTS — Businesses across ProfitLands reported a '+(profit>=0?'stronger':'weaker')+' operating cycle as demand, costs, and market conditions shifted.');
    save();render();checkBankruptcies();setTimeout(recovery,100);if(!auto)toast('Day '+previous+' ended. Welcome to Day '+state.day+'!');
  }
  function renderOverride(){
    if(typeof window.__profitBaseRender==='function')window.__profitBaseRender();
    ensure();economyUI();bankPanel();renderMajor();
    const banner=document.getElementById('eventBanner');
    if(banner){
      const e=state.economy,ev=e.activeEvents.map(a=>{const x=EVENTS.find(y=>y.id===a.id);return x?x.title+' · '+a.days+'d':''}).filter(Boolean);
      banner.classList.toggle('hidden',!ev.length);
      banner.textContent=ev.length?'World events: '+ev.join('  •  '):'';
    }
  }
  function startTimer2(){
    clearInterval(window.__profitTimer);
    const tick=()=>{if(!state.started)return;const left=Math.max(0,Math.ceil((state.dayEndsAt-Date.now())/1000));state.timeLeft=left;const el=document.getElementById('timer');if(el)el.textContent=formatTime(left);if(left<=0&&!window.__profitEnding){window.__profitEnding=true;doEndDay(true);window.__profitEnding=false}};
    tick();window.__profitTimer=setInterval(tick,250);
  }
  function bind(){
    window.__profitBaseRender=window.render;
    window.render=renderOverride;
    window.businessDailyProfit=businessProfit;
    window.businessValue=businessValue2;
    window.totalBusinessProfit=()=>state.businesses.reduce((s,b)=>s+businessProfit(b),0);
    window.netWorth=calcNetWorth;
    window.endDay=doEndDay;
    window.startTimer=startTimer2;
    window.startProfitLands=()=>{reset(state.mode,state.playType);document.getElementById('homeScreen')?.classList.remove('active');document.getElementById('gameScreen')?.classList.add('active');render();startTimer2();window.profitLandsPlatform?.gameplayStart()};
    const end=document.getElementById('endDay');if(end)end.addEventListener('click',e=>{e.stopImmediatePropagation();doEndDay(false)},true);
    ensure();setTimeout(()=>{render();startTimer2()},100);
  }
  function init(){if(typeof state==='undefined'||typeof BUSINESS_TYPES==='undefined')return;bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.ProfitLandsEconomy={MAJOR,EVENTS,RISK,LOCS};
})();