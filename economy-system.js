/* ProfitLands dynamic economy, major corporations, risk, bankruptcy and world news */
(function(){
  // Every 60 real gameplay seconds pays one existing daily-profit unit.
  // This makes cash flow continuous and faster without turning fixed expenses
  // into free revenue or paying a second daily lump sum.
  const INCOME_UNIT_SECONDS=60;
  let lastIncomeTick=0,lastLiveSave=0,lastLiveDetails=0;
  const rateMoney=n=>{
    if(!Number.isFinite(n))return '$0.00';
    const a=Math.abs(n),sign=n<0?'-':'';
    return sign+'$'+(a>=1e6?(a/1e6).toFixed(2)+'M':a>=1e3?Math.round(a).toLocaleString():a.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));
  };
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
    {id:'empire',req:1e12,name:'Global Empire',desc:'A world-scale corporation and a launching point for further empire expansion.',price:850000000000,rev:40000000000,expense:35000000000,vol:.50}
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
    if(!Number.isFinite(state.liveDayProfit))state.liveDayProfit=0;
    if(!Number.isFinite(state.liveTotalProfit))state.liveTotalProfit=0;
    if(!Number.isFinite(state.lastDayProfit))state.lastDayProfit=0;
    if(!Number.isFinite(state.realtimeEconomyVersion))state.realtimeEconomyVersion=1;
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
  function locationProfit(b,l,i){
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(!t)return 0;
    const r=riskFor(b), e=state.economy, scale=1+tier()*.045;
    const independent=b.locationManagementVersion===1;
    const lvl=1+((independent?(l.level||1):(b.level||1))-1)*.22;
    const marketing=independent?(l.marketing||0):(b.marketing||0);
    const efficiency=independent?(l.efficiency||0):(b.efficiency||0);
    const basePop=Math.max(5,Math.min(100,b.popularity||55));
    const loc=LOCS[l.id]||{demand:l.demand||1,rent:l.rent||1};
    const pop=Math.max(0,Math.min(100,(l.basePopularity??basePop)+marketing*1.5))/100;
    const seeded=Math.sin((state.day*97+i*31+String(l.id).length*17)+b.type.length)*43758.5453;
    const noise=(seeded-Math.floor(seeded))-.5;
    const random=1+noise*(r.vol*(1+tier()*.22)+.08);
    const demand=e.demandIndex*loc.demand*activeEffect('demand')*(1+(e.health-60)/250*r.econ);
    const revenue=t.baseRevenue*lvl*demand*(.45+pop*.8)*(1+marketing*.08)*Math.max(.55,random)*scale;
    const runningCost=t.baseExpense*lvl*loc.rent*e.rentIndex*e.wageIndex*e.supplyIndex*r.cost*activeEffect('supply')*(1+(100-e.health)/280*r.econ)*Math.max(.75,1-noise*.15) / (1+efficiency*.1);
    let profit=revenue-runningCost;
    if(b.type==='software')profit*=activeEffect('tech');
    if(b.type==='hotel')profit*=activeEffect('travel');
    profit*=activeEffect('weather')>1?(1-(activeEffect('weather')-1)*.10*r.weather):1;
    if(independent){
      profit+=window.ProfitLandsLocationOps?.staffingAdjustment?.(b,l,revenue,runningCost)||0;
      if(Number.isFinite(b.initiativeUntilTime)&&b.initiativeUntilTime>Date.now())profit+=revenue*.12;
    }
    profit+=window.ProfitLandsEmpire?.delta?.(b,l,revenue,runningCost)||0;
    return profit;
  }
  function businessProfit(b){
    const locs=locationList(b);
    const total=locs.reduce((sum,l,i)=>sum+locationProfit(b,l,i),0);
    const legacyBonus=b.locationManagementVersion===1?0:(window.ProfitLandsGrowth?.adjustProfit?.(b)||0);
    return Math.round(total+legacyBonus);
  }
  function businessValue2(b){
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(!t)return 0;
    const locs=locationList(b);
    if(b.locationManagementVersion===1){
      return Math.round(locs.reduce((sum,l,i)=>{
        const level=Math.max(1,Number(l.level)||1);
        const locationBase=i===0?t.cost:t.cost*10*(1+(i-1)*.35)*.55;
        return sum+locationBase+t.cost*(level-1)*.15;
      },0));
    }
    let v=t.cost*(1+(b.level||1)*.15);
    for(let i=1;i<locs.length;i++)v+=t.cost*10*(1+(i-1)*.35)*.55;
    return Math.round(v);
  }
  function majorValue(c){return c.value||0}
  function calcNetWorth(){
    const stockValue=STOCKS.reduce((s,x)=>s+x.price*(state.stocks?.[x.id]?.shares||0),0);
    const extra=stockValue+(state.businesses||[]).reduce((s,b)=>s+businessValue2(b),0)+(state.property||0)*750+(state.majorCompanies||[]).reduce((s,c)=>s+majorValue(c),0)-state.loans.reduce((s,l)=>s+(l.balance||0),0);
    if(window.ProfitLandsMoney)return window.ProfitLandsMoney.number(window.ProfitLandsMoney.netWorth(extra));
    return Math.max(0,state.cash)+extra;
  }
  function majorDaily(c){
    const d=MAJOR.find(x=>x.id===c.type);if(!d)return 0;
    const e=state.economy,vol=d.vol*(1+tier()*.15),noise=(Math.random()-.5)*2*vol;
    const econ=1+(e.health-60)/180;
    const event=activeEffect('demand')*activeEffect('supply');
    return Math.round((d.rev*econ*event*(1+noise)-d.expense*(1+(60-e.health)/220)*(1+Math.max(0,noise)*.35))* (1+Math.min(3,tier())*.02));
  }
  function stockUpdate(){
    STOCKS.forEach(s=>{
      const anchor=window.ProfitLandsStockBase?.[s.id]||s.price||10;
      const floor=anchor*.30;
      const ceiling=anchor*5;
      const old=Math.max(floor,Number(s.price)||anchor);
      const riskVol=s.risk==='High'?.05:s.risk==='Low'?.025:.035;
      const riskSensitivity=s.risk==='High'?1.2:s.risk==='Low'?.75:1;

      let sector=0;
      if(s.id==='nova')sector=activeEffect('tech')-1;
      if(s.id==='harbor')sector=activeEffect('demand')-1;
      if(s.id==='atlas')sector=(activeEffect('supply')-1)*-.35;
      if(s.id==='skyline')sector=(activeEffect('demand')-1)*.7;

      const random=(Math.random()-.5)*2*riskVol;
      const econ=((state.economy.health-60)/40)*.012*riskSensitivity;
      const event=Math.max(-.08,Math.min(.08,activeEffect('stocks')-1));
      const sectorMove=Math.max(-.03,Math.min(.03,sector*.16));
      const reversion=Math.max(-.012,Math.min(.012,((anchor-old)/anchor)*.015));
      const majorEvent=Math.abs(event)>.03;
      const maxMove=majorEvent?.12:.06;
      let move=Math.max(-maxMove,Math.min(maxMove,random+econ+event+sectorMove+reversion));

      let next=Math.max(floor,Math.min(ceiling,old*(1+move)));
      if(old<=floor*1.002&&next<=old)next=old*1.01;
      s.price=+next.toFixed(2);
      s._change=(s.price/old-1)*100;
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

    const conflicts={
      consumer_boom:['consumer_slowdown'],
      consumer_slowdown:['consumer_boom'],
      rent_crisis:['rent_relief'],
      rent_relief:['rent_crisis'],
      market_panic:['investor_confidence'],
      investor_confidence:['market_panic']
    };
    const chosen=[];
    const pickType=type=>{
      const used=new Set(chosen.map(x=>x.id));
      const blocked=new Set(chosen.flatMap(x=>conflicts[x.id]||[]));
      const pool=EVENTS.filter(x=>x.type===type&&x.id!==e.lastEventId&&!used.has(x.id)&&!blocked.has(x.id));
      if(!pool.length)return null;
      const total=pool.reduce((sum,x)=>sum+x.weight,0),r=Math.random()*total;
      let n=0,pick=pool[0];
      for(const x of pool){n+=x.weight;if(r<=n){pick=x;break}}
      chosen.push(pick);
      return pick;
    };

    events.forEach(pickType);

    /* Occasionally stack a second economic condition on the same day.
       The chance rises as the player's empire grows, making later games less predictable. */
    const doubleEconomicChance=Math.min(.34,.10+t*.035);
    if(chosen.some(x=>x.type==='economic')&&Math.random()<doubleEconomicChance){
      pickType('economic');
    }

    const baseLimit=Math.min(3,1+Math.floor(t/3));
    const limit=Math.max(baseLimit,chosen.filter(x=>x.type==='economic').length>=2?2:1);
    return chosen.slice(0,limit);
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
  // Market and popularity are adjusted at a day boundary. Cash and company
  // balances are now settled in the real-time loop instead of here.
  function businessUpdate(){
    (state.businesses||[]).forEach(b=>{
      const r=riskFor(b);
      const popMove=(Math.random()-.5)*(5+r.vol*8)*(1+tier()*.08);
      b.popularity=Math.max(5,Math.min(100,(b.popularity||55)+popMove));
      if(b.locations)b.locations.forEach(l=>{l.basePopularity=Math.max(5,Math.min(100,(l.basePopularity||b.popularity)+popMove*.35))});
    });
  }
  function projectedProfit(){
    const business=(state.businesses||[]).reduce((sum,b)=>sum+businessProfit(b),0);
    const majors=(state.majorCompanies||[]).reduce((sum,c)=>{
      if(!Number.isFinite(c.liveDayRate))c.liveDayRate=majorDaily(c);
      return sum+c.liveDayRate;
    },0);
    return business+majors+(state.property||0)*12;
  }
  function perSecond(){return projectedProfit()/INCOME_UNIT_SECONDS}
  function showLiveCash(){
    const cash=document.getElementById('cash'),worth=document.getElementById('netWorth'),rate=document.getElementById('dailyIncome'),floatCash=document.getElementById('floatCash');
    if(cash)cash.textContent=money(window.ProfitLandsMoney?.balance?.()||state.cash);
    if(floatCash)floatCash.textContent=money(window.ProfitLandsMoney?.balance?.()||state.cash);
    if(worth)worth.textContent=money(window.ProfitLandsMoney?.netWorth?.(calcNetWorth()-state.cash)||calcNetWorth());
    const flow=perSecond();
    if(rate)rate.textContent=(flow>=0?'+':'')+rateMoney(flow);
    window.ProfitLandsProgression?.render(window.ProfitLandsMoney?.netWorth?.(calcNetWorth()-state.cash)||calcNetWorth());
  }
  function settleIncome(now=Date.now()){
    if(!state.started||!document.getElementById('gameScreen')?.classList.contains('active')){
      lastIncomeTick=now;
      return 0;
    }
    // Paused/background tabs earn no catch-up lump sum. This avoids huge
    // earnings after sleep or a throttled browser resumes.
    if(document.visibilityState==='hidden'){lastIncomeTick=now;return 0}
    if(!lastIncomeTick){lastIncomeTick=now;return 0}
    const elapsed=Math.min(2,Math.max(0,(now-lastIncomeTick)/1000));
    lastIncomeTick=now;
    if(!elapsed)return 0;
    const multiplier=elapsed/INCOME_UNIT_SECONDS;
    let realized=0;
    (state.businesses||[]).forEach(b=>{
      const amount=businessProfit(b)*multiplier;
      realized+=amount;
      b.financialBalance=(Number(b.financialBalance)||0)+amount;
    });
    (state.majorCompanies||[]).forEach(c=>{
      if(!Number.isFinite(c.liveDayRate))c.liveDayRate=majorDaily(c);
      const amount=c.liveDayRate*multiplier;
      realized+=amount;
      c.financialBalance=(Number(c.financialBalance)||0)+amount;
    });
    realized+=((state.property||0)*12)*multiplier;
    if(!Number.isFinite(realized))return 0;
    if(window.ProfitLandsMoney){window.ProfitLandsMoney.gain(realized);if(window.ProfitLandsMoney.cmp(window.ProfitLandsMoney.balance(),-1e15)<0)window.ProfitLandsMoney.set(-1e15)}
    else state.cash=Math.max(-1e15,(Number(state.cash)||0)+realized);
    state.liveDayProfit+=realized;
    state.liveTotalProfit+=realized;
    return realized;
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
    modal.querySelectorAll('[data-recovery]').forEach(b=>b.onclick=()=>{const kind=b.dataset.recovery;if(kind==='work'){(window.ProfitLandsMoney?window.ProfitLandsMoney.gain(Math.min(50000,Math.max(2500,def.balance*.08))):state.cash+=Math.min(50000,Math.max(2500,def.balance*.08)));def.balance=Math.max(0,def.balance*.92)}else if(kind==='negotiate'){def.dueDay=state.day+10;def.balance=Math.max(0,def.balance*.95);def.defaulted=false;def.recoveryOffered=false}else{const assets=(state.businesses||[]).reduce((s,x)=>s+businessValue2(x),0)*.35;(window.ProfitLandsMoney?window.ProfitLandsMoney.gain(Math.round(assets)):state.cash+=Math.round(assets));state.businesses=[];def.balance=Math.max(0,def.balance-assets*.2)}save();render();modal.classList.add('hidden')});
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
      if(window.ProfitLandsMoney)window.ProfitLandsMoney.set(recoveryPayout);else state.cash=recoveryPayout;
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
  function renderMajor(){
    const grid=document.getElementById('majorCompaniesGrid');
    if(!grid)return;
    const n=calcNetWorth(),t=tier();
    const tag=document.getElementById('majorScale');
    if(tag)tag.textContent='SCALE '+t;
    // Corporation cards are a data-driven collection; only these repeat.
    grid.innerHTML=MAJOR.map((d,i)=>{const owned=state.majorCompanies.some(c=>c.type===d.id),unlocked=n>=d.req,active=i<t;return '<div class="major-card '+(unlocked?'unlocked ':'locked ')+'"><div><span class="major-tier">TIER '+(i+1)+'</span><h4>'+d.name+'</h4><small>'+d.desc+'</small></div><div class="major-meta"><span>Unlock '+money(d.req)+'</span><span>Risk '+['Low','Moderate','High','Very High','Extreme','Severe','Maximum'][i]+'</span></div><button class="major-buy" data-major="'+d.id+'" '+((!unlocked||owned||state.cash<d.price)?'disabled':'')+'>'+ (owned?'OWNED':unlocked?'Buy for '+money(d.price):'Locked until '+money(d.req))+'</button></div>'}).join('');
    grid.querySelectorAll('[data-major]').forEach(b=>b.onclick=()=>buyMajor(b.dataset.major));
  }
  function buyMajor(id){
    const d=MAJOR.find(x=>x.id===id);if(!d)return;
    if(window.ProfitLandsMoney?window.ProfitLandsMoney.cmp(window.ProfitLandsMoney.netWorth(calcNetWorth()-state.cash),d.req)<0:calcNetWorth()<d.req)return toast('Reach the required net worth first.');
    if(state.majorCompanies.some(c=>c.type===id))return toast('You already own this corporation.');
    if(window.ProfitLandsMoney?!window.ProfitLandsMoney.canAfford(d.price):state.cash<d.price)return toast('You need enough cash to purchase this corporation.');
    if(state.actions<=0)return toast('No actions left.');
    if(window.ProfitLandsMoney)window.ProfitLandsMoney.spend(d.price);else state.cash-=d.price;state.actions--;
    state.majorCompanies.push({type:id,name:d.name,value:d.price,financialBalance:0});
    state.news.push('CORPORATE LANDSCAPE — '+d.name+' has entered the ProfitLands economy, adding another major competitor to the corporate market.');
    save();render();
  }
  // Structural HTML lives in /play/index.html; these functions only bind values.
  function setPanelText(id,value){const el=document.getElementById(id);if(el)el.textContent=String(value)}
  function economyUI(){
    const e=state.economy,t=tier(),events=e.activeEvents.map(a=>EVENTS.find(x=>x.id===a.id)?.title+' ('+a.days+'d)').filter(Boolean);
    setPanelText('economyCondition',economyLabel(e.health).toUpperCase());
    setPanelText('economyHealth',Math.round(e.health));
    const bar=document.getElementById('economyHealthBar');if(bar)bar.style.width=e.health+'%';
    setPanelText('economyRent',e.rentIndex.toFixed(2)+'×');
    setPanelText('economyWages',e.wageIndex.toFixed(2)+'×');
    setPanelText('economyDemand',Math.round(e.demandIndex*100)+'%');
    setPanelText('economyLoanRate',(e.loanRate*100).toFixed(1)+'%');
    setPanelText('economyActiveEvents',events.length?events.join(' · '):'No major active events');
    setPanelText('economyScale',['Starting','Local','Regional','National','Global','Conglomerate','Mega','Empire'][t]||'Starting');
    renderMajor();
  }
  function bankPanel(){
    const debt=state.loans.reduce((s,l)=>s+(l.balance||0),0);
    const loan=state.loans.find(l=>!l.defaulted&&l.balance>0);
    const can=state.cash<=0&&!loan&&state.penaltyDays<=0;
    setPanelText('bankStatusTag',loan?'LOAN ACTIVE':'BANK');
    setPanelText('bankTotalDebt',money(debt));
    const credit=document.getElementById('bankCreditStatus');
    if(credit){
      credit.textContent=state.penaltyDays?'LEGAL RECOVERY PERIOD':'ACTIVE';
      credit.classList.toggle('danger',!!state.penaltyDays);
      credit.classList.toggle('good',!state.penaltyDays);
    }
    setPanelText('bankTerms','15 days · '+(state.economy.loanRate*100).toFixed(1)+'% interest');
    const button=document.getElementById('borrowLoan');
    if(button){button.disabled=!can;button.onclick=borrowLoan}
    setPanelText('bankNote',state.cash>0?'Emergency loans become available when cash reaches $0.':state.penaltyDays?'Borrowing is paused during the recovery period.':loan?'A loan is already active.':'A loan is available now.');
  }
  function borrowLoan(){
    if(state.cash>0||state.loans.some(l=>!l.defaulted&&l.balance>0)||state.penaltyDays>0)return;
    const amount=Math.max(1000,Math.min(100000000,Math.round(Math.max(1000,Math.abs(totalBusinessProfit())*3+5000))));
    const balance=Math.round(amount*(1+state.economy.loanRate));
    if(window.ProfitLandsMoney)window.ProfitLandsMoney.gain(amount);else state.cash+=amount;state.loans.push({principal:amount,balance,dueDay:state.day+15,daysLeft:15,defaulted:false,recoveryOffered:false});
    state.news.push('CREDIT MARKETS — Emergency lending activity increased today as several companies sought short-term financing to cover operating costs.');
    save();render();
  }
  function reset(mode,type){
    window.resetProfitLandsMarket?.();
    state.mode=mode;state.playType=type;state.day=1;state.cash=1000;state.cashHuge='1000';window.ProfitLandsMoney?.attach?.(state);state.stocks=Object.fromEntries(STOCKS.map(s=>[s.id,{shares:0}]));state.businesses=[];state.property=0;state.actions=MODES[mode].actions;state.actionCapacityVersion=2;state.timeLeft=MODES[mode].daySeconds;state.dayEndsAt=Date.now()+MODES[mode].daySeconds*1000;state.news=[];state.trend=null;state.started=true;state.lastDayProfit=0;state.liveDayProfit=0;state.liveTotalProfit=0;state.realtimeEconomyVersion=1;state.bankrupt=false;state.economy={health:60,history:[60],trend:0,rentIndex:1,wageIndex:1,demandIndex:1,supplyIndex:1,loanRate:.08,activeEvents:[],lastEventId:''};state.loans=[];state.penaltyDays=0;state.bankruptcyCount=0;state.majorCompanies=[];state.empireLab=null;state.growth={history:[],milestones:[],lastSample:0};state.actionRegenAt=Date.now();state.news.push('MARKET OPEN — ProfitLands begins the day with a stable economy and $1,000 in starting capital.');save();
  }
  function doEndDay(auto){
    if(!state.started)return;
    ensure();
    const previous=state.day;
    settleIncome(Date.now());
    const profit=state.liveDayProfit;
    state.lastDayProfit=profit;
    state.liveDayProfit=0;
    businessUpdate();
    updateEconomy();
    (state.majorCompanies||[]).forEach(c=>{c.liveDayRate=majorDaily(c);c.lastProfit=c.liveDayRate});

    stockUpdate();
    processLoans();
    state.day++;
    window.ProfitLandsGrowth?.onCycle?.();
    state.actions=MODES[state.mode].actions;
    window.ProfitLandsBalance?.reset?.();
    state.timeLeft=MODES[state.mode].daySeconds;
    state.dayEndsAt=Date.now()+MODES[state.mode].daySeconds*1000;
    state.trend=null;
    const e=state.economy;
    state.news.push('MARKET REPORT — The economy is '+economyLabel(e.health).toLowerCase()+' at '+Math.round(e.health)+'/100. '+(e.trend>=0?'Economic activity strengthened':'Economic activity weakened')+' during the latest cycle.');
    if(e.activeEvents.length){
      const active=e.activeEvents.map(a=>{const ev=EVENTS.find(x=>x.id===a.id);return ev?ev.title+' ('+a.days+' day'+(a.days===1?'':'s')+' left)':''}).filter(Boolean);
      if(active.length)state.news.push('WORLD DESK — '+active.join(' · ')+'. Businesses are adjusting to the changing conditions.');
    }
    if(profit<0)state.news.push('CORPORATE RESULTS — Running costs exceeded revenue during the last cycle.');
    else state.news.push('CORPORATE RESULTS — Your businesses generated '+money(profit)+' during the last cycle. Continuous cash flow remains active.');
    lastIncomeTick=Date.now();save();render();showLiveCash();checkBankruptcies();setTimeout(recovery,100);if(!auto)toast('Market cycle '+previous+' ended. Cash keeps earning every second!');
  }
  function renderOverride(){
    if(typeof window.__profitBaseRender==='function')window.__profitBaseRender();
    ensure();economyUI();bankPanel();showLiveCash();
    window.ProfitLandsGrowth?.render?.();
    window.ProfitLandsBalance?.status?.();
    const banner=document.getElementById('eventBanner');
    if(banner){
      const e=state.economy,ev=e.activeEvents.map(a=>{const x=EVENTS.find(y=>y.id===a.id);return x?x.title+' · '+a.days+'d':''}).filter(Boolean);
      banner.classList.toggle('hidden',!ev.length);
      banner.textContent=ev.length?'World events: '+ev.join('  •  '):'';
    }
  }
  function startTimer2(){
    clearInterval(window.__profitTimer);
    lastIncomeTick=Date.now();
    lastLiveDetails=0;
    lastLiveSave=Date.now();
    let lastShown=-1;
    const tick=()=>{
      if(!state.started)return;
      const now=Date.now();
      settleIncome(now);
      window.ProfitLandsBalance?.tick?.(now);
      showLiveCash();
      if(now-lastLiveDetails>=5000){
        lastLiveDetails=now;
        // Refresh company balances and other detailed numbers only occasionally
        // to avoid a full DOM rebuild, lost focus, or scroll jumps each second.
        window.renderBusinesses?.();
        window.renderFinance?.();
        window.ProfitLandsGrowth?.sample?.();
        window.ProfitLandsBalance?.status?.();
      }
      if(now-lastLiveSave>=15000){
        lastLiveSave=now;
        save();
      }
      const left=Math.max(0,Math.ceil((state.dayEndsAt-now)/1000));
      state.timeLeft=left;
      if(left!==lastShown){
        lastShown=left;
        const el=document.getElementById('timer');
        if(el)el.textContent=formatTime(left);
      }
      if(left<=0&&!window.__profitEnding){
        window.__profitEnding=true;
        try{doEndDay(true)}finally{window.__profitEnding=false}
      }
    };
    tick();
    window.__profitTimer=setInterval(tick,500);
  }
  function bind(){
    window.__profitBaseRender=window.render;
    window.render=renderOverride;
    window.ProfitLandsEconomy={locationProfit:(b,l,i)=>Math.round(locationProfit(b,l,i)),businessProfit,businessValue:businessValue2};
    window.businessDailyProfit=businessProfit;
    window.businessValue=businessValue2;
    window.totalBusinessProfit=()=>state.businesses.reduce((s,b)=>s+businessProfit(b),0);
    window.netWorth=calcNetWorth;
    window.ProfitLandsRealtime={rate:perSecond,settle:settleIncome,formatRate:rateMoney,period:INCOME_UNIT_SECONDS};
    window.endDay=()=>false; // Manual market advances are disabled.
    window.startTimer=startTimer2;
    window.startProfitLands=()=>{reset(state.mode,state.playType);document.getElementById('homeScreen')?.classList.remove('active');document.getElementById('gameScreen')?.classList.add('active');render();startTimer2();window.profitLandsPlatform?.gameplayStart()};
    // Market cycles advance only when the countdown reaches zero.
    ensure();setTimeout(()=>{render();if(state.started)startTimer2()},100);
  }
  function init(){if(typeof state==='undefined'||typeof BUSINESS_TYPES==='undefined')return;bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.ProfitLandsEconomy={MAJOR,EVENTS,RISK,LOCS};
})();