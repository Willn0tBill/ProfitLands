/* ProfitLands v0.8 — bounded growth history, staff, business initiatives,
   achievements and HTML-driven controls. Existing save key/schema retained. */
(function(){
  'use strict';
  const HISTORY_LIMIT=120, SAMPLE_MS=5000, MAX_WORKERS=6;
  const $=id=>document.getElementById(id);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const typeFor=b=>BUSINESS_TYPES.find(t=>t.id===b.type);
  const validNumber=n=>Number.isFinite(Number(n))?Number(n):0;
  const fmt=n=>typeof money==='function'?money(n):'$'+Math.round(n).toLocaleString();
  const INDUSTRIES={
    coffee:['Loyalty program','Offer regulars a loyalty card and targeted promotions.'],
    restaurant:['New seasonal menu','Test a seasonal menu to bring back customers.'],
    gamestore:['Community launch event','Host a local release event for gamers.'],
    hotel:['Guest experience package','Improve guest services and premium bookings.'],
    dealership:['Showroom promotion','Run a limited showroom sales campaign.'],
    factory:['Production optimization','Reorganize production to improve throughput.'],
    software:['Feature launch','Release a new product feature and market it.'],
    logistics:['Route optimization','Improve dispatch planning and delivery reliability.']
  };
  const MILESTONES=[
    {id:'first',title:'First investment',text:'Buy your first business.',reward:75,test:(s,n)=>s.businesses.length>=1},
    {id:'staff',title:'Growing team',text:'Hire your first employee.',reward:100,test:s=>s.businesses.some(b=>validNumber(b.workers)>0)},
    {id:'manager',title:'Managed operations',text:'Hire your first manager.',reward:200,test:s=>s.businesses.some(b=>b.manager===true)},
    {id:'tenK',title:'Five figures',text:'Reach $10,000 in empire value.',reward:250,test:(s,n)=>n>=10000},
    {id:'fiveLocations',title:'Regional expansion',text:'Own five business locations.',reward:500,test:s=>s.businesses.reduce((v,b)=>v+(Array.isArray(b.locations)?b.locations.length:1),0)>=5},
    {id:'hundredK',title:'Six figures',text:'Reach $100,000 in empire value.',reward:1500,test:(s,n)=>n>=100000},
    {id:'million',title:'Millionaire',text:'Reach $1 million in empire value.',reward:5000,test:(s,n)=>n>=1e6},
    {id:'billion',title:'Billion-dollar empire',text:'Reach $1 billion in empire value.',reward:100000,test:(s,n)=>n>=1e9},
    {id:'trillion',title:'Trillion-dollar empire',text:'Reach $1 trillion in empire value.',reward:1000000,test:(s,n)=>n>=1e12}
  ];
  function ensure(){
    if(!state.growth||typeof state.growth!=='object'||Array.isArray(state.growth))state.growth={};
    const g=state.growth;
    if(!Array.isArray(g.history))g.history=[];
    if(!Array.isArray(g.milestones))g.milestones=[];
    g.history=g.history.filter(h=>h&&Number.isFinite(h.cash)&&Number.isFinite(h.netWorth)&&Number.isFinite(h.flow)).slice(-HISTORY_LIMIT);
    g.milestones=g.milestones.filter(x=>typeof x==='string').slice(0,MILESTONES.length);
    if(!Number.isFinite(g.lastSample))g.lastSample=0;
    if(!Number.isFinite(g.lastManagerTick))g.lastManagerTick=0;
    if(!Number.isFinite(g.managerElapsed))g.managerElapsed=0;
    return g;
  }
  function adjustProfit(b){
    const t=typeFor(b);if(!t)return 0;
    const workers=clamp(Math.floor(validNumber(b.workers)),0,MAX_WORKERS),manager=b.manager===true;
    const locations=Array.isArray(b.locations)?Math.max(1,b.locations.length):1;
    const level=Math.max(1,Math.floor(validNumber(b.level)||1));
    const revenue=t.baseRevenue*(1+(level-1)*.22)*locations;
    const expense=t.baseExpense*(1+(level-1)*.22)*locations;
    const wages=workers*expense*.14+(manager?expense*.23:0);
    const workBoost=workers*.13+(manager?.18:0);
    const active=Number.isFinite(b.initiativeUntilTime)&&b.initiativeUntilTime>Date.now();
    const bonus=active?.12:0;
    return Math.round(revenue*(workBoost+bonus)-wages);
  }
  function staffCost(b,role){
    const t=typeFor(b);if(!t)return Infinity;
    return Math.round(t.cost*(role==='manager'?1.5:.38));
  }
  function initiativeCost(b){const t=typeFor(b);return t?Math.round(t.cost*.45):Infinity}
  function businessIndex(){return clamp(Math.floor(Number($('growthBusiness')?.value)||0),0,Math.max(0,state.businesses.length-1))}
  function selectedBusiness(){return state.businesses[businessIndex()]}
  function pushHistory(force=false){
    if(!state.started||!$('gameScreen')?.classList.contains('active'))return false;
    const g=ensure(),now=Date.now();
    if(!force&&now-g.lastSample<SAMPLE_MS)return false;
    const flow=window.ProfitLandsRealtime?.rate?.()||0;
    const worth=window.netWorth?.()||state.cash;
    const last=g.history.at(-1);
    const item={t:now,cash:validNumber(state.cash),netWorth:validNumber(worth),flow:validNumber(flow)};
    if(last&&Math.abs(now-last.t)<1000)g.history[g.history.length-1]=item;
    else g.history.push(item);
    if(g.history.length>HISTORY_LIMIT)g.history.splice(0,g.history.length-HISTORY_LIMIT);
    g.lastSample=now;
    return true;
  }
  function awards(){
    if(!state.started)return[];
    const g=ensure(),worth=window.netWorth?.()||state.cash,unlocked=[];
    for(const m of MILESTONES){
      if(g.milestones.includes(m.id)||!m.test(state,worth))continue;
      g.milestones.push(m.id);state.cash+=m.reward;
      state.news.push('MILESTONE — '+m.title+' completed. Reward: '+fmt(m.reward)+'.');
      unlocked.push(m.title);
    }
    if(unlocked.length&&window.toast)window.toast('Milestone unlocked: '+unlocked.join(', '));
    return unlocked;
  }
  // Manager reputation maintenance accrues during active play, not by
  // market-cycle count. This keeps Fast and Persistent worlds balanced.
  function managerTick(now=Date.now()){
    const g=ensure();
    if(!state.started||document.visibilityState==='hidden'){
      g.lastManagerTick=now;return false;
    }
    const elapsed=g.lastManagerTick?clamp(now-g.lastManagerTick,0,SAMPLE_MS):0;
    g.lastManagerTick=now;
    g.managerElapsed+=elapsed;
    if(g.managerElapsed<60000)return false;
    g.managerElapsed-=60000;
    for(const b of state.businesses||[]){
      if(b.manager!==true)continue;
      b.popularity=clamp((b.popularity||55)+.4,5,100);
      if(Array.isArray(b.locations))for(const l of b.locations){
        l.basePopularity=clamp((l.basePopularity||b.popularity)+.4,5,100);
      }
    }
    return true;
  }
  function onCycle(){awards();render()}
  function moneyLabel(n){return(Number(n)>=0?'+':'')+fmt(n)}
  function rateLabel(n){const formatted=window.ProfitLandsRealtime?.formatRate?.(n)||('$'+validNumber(n).toFixed(2));return(n>=0?'+':'')+formatted}
  function renderChart(){
    const svg=$('growthChart'),labels=$('growthChartLabels');if(!svg)return;
    const g=ensure(),points=g.history,metric=$('growthMetric')?.value||'netWorth';
    svg.replaceChildren();
    const ns='http://www.w3.org/2000/svg';
    function el(name,attrs){const x=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,String(v));svg.appendChild(x);return x}
    const values=points.map(p=>validNumber(p[metric]));
    if(!values.length){if(labels)labels.textContent='Cash history begins when you start playing.';return}
    let min=Math.min(...values),max=Math.max(...values),range=max-min;
    if(range<.0001){min-=Math.max(1,Math.abs(max)*.05);max+=Math.max(1,Math.abs(max)*.05);range=max-min}
    const w=600,h=195,pad=17;
    for(let i=0;i<5;i++)el('line',{x1:pad,y1:pad+i*(h-2*pad)/4,x2:w-pad,y2:pad+i*(h-2*pad)/4,stroke:'#40554a','stroke-width':1,'stroke-dasharray':'4 6'});
    const coords=values.map((v,i)=>[pad+(points.length===1?.5:i/(points.length-1))*(w-2*pad),h-pad-(v-min)/range*(h-2*pad)]);
    const d=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
    el('path',{d,fill:'none',stroke:metric==='flow'?'#e6bd78':'#adf26f','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
    const last=coords.at(-1);el('circle',{cx:last[0],cy:last[1],r:4,fill:'#f6f5e5'});
    if(labels)labels.textContent='Low '+(metric==='flow'?rateLabel(min):fmt(min))+' · Latest '+(metric==='flow'?rateLabel(values.at(-1)):moneyLabel(values.at(-1)))+' · High '+(metric==='flow'?rateLabel(max):fmt(max))+' · '+points.length+' samples';
  }
  function updateSelect(){
    const select=$('growthBusiness');if(!select)return;
    const prior=select.value;
    select.replaceChildren();
    for(let i=0;i<state.businesses.length;i++){
      const b=state.businesses[i],o=document.createElement('option');o.value=i;o.textContent=b.name||typeFor(b)?.name||'Business '+(i+1);select.appendChild(o)
    }
    select.value=state.businesses[Number(prior)]?prior:'0';
    select.disabled=!state.businesses.length;
  }
  function renderStaff(){
    const b=selectedBusiness(),empty=$('growthBusinessEmpty'),detail=$('growthBusinessDetails');
    if(empty)empty.hidden=!!b;
    if(detail)detail.hidden=!b;
    if($('growthRunDecision'))$('growthRunDecision').disabled=!b;
    if(!b)return;
    const t=typeFor(b),staff=Math.floor(validNumber(b.workers)),workerFee=staffCost(b,'worker'),managerFee=staffCost(b,'manager');
    const ownPrice=initiativeCost(b),sector=INDUSTRIES[b.type]||['Local campaign','Run a focused short-term promotion.'];
    const put=(id,str)=>{if($(id))$(id).textContent=String(str)};
    put('growthStaffCount',staff+' / '+MAX_WORKERS);
    put('growthManagerState',b.manager===true?'Employed — maintains popularity during active play':'Not hired');
    put('growthStaffEffect',rateLabel(adjustProfit(b)/60)+'/sec net change (productivity minus wages)');
    put('growthHireCost',fmt(workerFee)+' upfront + ongoing wages');
    put('growthManagerCost',fmt(managerFee)+' upfront + ongoing salary');
    put('growthDecisionName',sector[0]);put('growthDecisionDescription',sector[1]);
    put('growthDecisionCost',fmt(ownPrice)+' · 1 action');
    const now=Date.now(),active=Number.isFinite(b.initiativeUntilTime)&&b.initiativeUntilTime>now,cooldown=Number.isFinite(b.initiativeCooldownAt)&&b.initiativeCooldownAt>now;
    put('growthDecisionDuration',active?'Active · '+Math.ceil((b.initiativeUntilTime-now)/60000)+'m remaining':cooldown?'Cooldown · '+Math.ceil((b.initiativeCooldownAt-now)/60000)+'m remaining':'Ready now');
    const hire=$('growthHireWorker'),manager=$('growthHireManager'),decision=$('growthRunDecision');
    if(hire)hire.disabled=staff>=MAX_WORKERS||state.cash<workerFee||state.actions<=0;
    if(manager)manager.disabled=b.manager===true||state.cash<managerFee||state.actions<=0;
    if(decision)decision.disabled=state.actions<=0||state.cash<ownPrice||cooldown;
  }
  function renderMilestones(){
    const list=$('growthMilestones');if(!list)return;
    const g=ensure(),current=window.netWorth?.()||state.cash;
    list.replaceChildren();
    for(const m of MILESTONES){
      const done=g.milestones.includes(m.id),row=document.createElement('div');row.className='growth-milestone'+(done?' is-done':'');
      const name=document.createElement('strong');name.textContent=(done?'✓ ':'○ ')+m.title;
      const description=document.createElement('span');description.textContent=m.text;
      const reward=document.createElement('small');reward.textContent=(done?'Completed · ':'Reward ')+fmt(m.reward);
      row.append(name,description,reward);list.appendChild(row);
    }
    const completed=MILESTONES.filter(m=>g.milestones.includes(m.id)).length;
    const summary=$('growthMilestonesCount');if(summary)summary.textContent=completed+' / '+MILESTONES.length+' milestones completed';
  }
  function render(){
    if(!$('growthPanel'))return;
    ensure();
    updateSelect();renderChart();renderStaff();renderMilestones();
    const saved=$('growthSaveStatus');
    if(saved)saved.textContent='History and milestones are saved with your empire. Chart keeps the latest '+HISTORY_LIMIT+' samples.';
  }
  function spend(b,amount,action=true){
    if(!b||state.actions<(action?1:0)||state.cash<amount)return false;
    state.cash-=amount;if(action)state.actions--;return true;
  }
  function perform(id){
    const b=selectedBusiness();if(!b||!state.started)return;
    const say=s=>{if(window.toast)window.toast(s)};
    if(id==='growthHireWorker'){
      const count=clamp(Math.floor(validNumber(b.workers)),0,MAX_WORKERS);
      if(count>=MAX_WORKERS||!spend(b,staffCost(b,'worker')))return say('More cash or a new market cycle is needed.');
      b.workers=count+1;say('Employee hired. Productivity and wages updated.');
    }else if(id==='growthHireManager'){
      if(b.manager||!spend(b,staffCost(b,'manager')))return say('Unable to hire this manager.');
      b.manager=true;say('Manager hired. Popularity is now maintained during active play.');
    }else if(id==='growthRunDecision'){
      if((b.initiativeCooldownAt||0)>Date.now()||!spend(b,initiativeCost(b)))return say('Not enough resources or the campaign is on cooldown.');
      b.initiativeUntilTime=Date.now()+10*60*1000;
      b.initiativeCooldownAt=Date.now()+15*60*1000;
      say('Industry initiative active for 10 minutes with a 15-minute cooldown.');
    }else return;
    state.news.push('OPERATIONS — '+(b.name||typeFor(b)?.name||'Business')+' updated its management strategy.');
    awards();window.save?.();window.render?.();render();
  }
  function sample(){if(!state.started)return;ensure();managerTick();pushHistory();awards();renderChart();const section=$('growthPanel');if(section&&section.getBoundingClientRect().top<innerHeight&&section.getBoundingClientRect().bottom>0){renderMilestones();renderStaff()}}
  function init(){
    const panel=$('growthPanel');if(!panel)return;
    ensure();
    panel.addEventListener('click',e=>{
      const b=e.target.closest('button[data-growth-tab]');if(b){
        for(const node of panel.querySelectorAll('[data-growth-tab]')){
          node.classList.toggle('active',node===b);node.setAttribute('aria-selected',String(node===b));
        }
        for(const p of panel.querySelectorAll('[data-growth-page]'))p.hidden=p.dataset.growthPage!==b.dataset.growthTab;
        render();return;
      }
      const action=e.target.closest('button[data-growth-action]');if(action)perform(action.dataset.growthAction);
    });
    $('growthBusiness')?.addEventListener('change',renderStaff);
    $('growthMetric')?.addEventListener('change',renderChart);
    window.addEventListener('profitlands:resume',()=>{ensure();render();});
    window.addEventListener('profitlands:newgame',()=>{state.growth={history:[],milestones:[],lastSample:0};render()});
    render();
  }
  window.ProfitLandsGrowth={ensure,adjustProfit,pushHistory,awards,onCycle,managerTick,sample,render,staffCost,initiativeCost,init,
    reset(){state.growth={history:[],milestones:[],lastSample:0,lastManagerTick:0,managerElapsed:0};render();},
    stats(){return{milestones:ensure().milestones.length,samples:ensure().history.length}}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();