/* ProfitLands v0.9: per-location operations; site-specific expenses and staffing. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const safe=x=>Math.max(0,Math.floor(num(x)));
const moneyText=x=>money(x);
const type=b=>BUSINESS_TYPES.find(t=>t.id===b?.type);
const canPay=amount=>window.ProfitLandsMoney?window.ProfitLandsMoney.canAfford(amount):state.cash>=amount;
const siteNames={downtown:'Downtown',suburbs:'Suburbs',tourist:'Tourist District',university:'University District',waterfront:'Waterfront',tech:'Tech District',industrial:'Industrial Park'};
const icons={downtown:'🏙️',suburbs:'🏘️',tourist:'🌴',university:'🎓',waterfront:'🌊',tech:'💻',industrial:'🏭'};
const minimizedLocations=new Set();
const siteKey=(b,l,index)=>b.name+'|'+(l.labId||l.id||index)+'|'+index;

function locations(b){return Array.isArray(b?.locations)?b.locations:[]}
function normalize(b){
  if(!b||!type(b))return b;
  if(!locations(b).length)b.locations=[{id:'downtown',name:'Downtown',icon:'🏙️',demand:1.22,rent:1.3,basePopularity:num(b.popularity)||55}];
  const migrating=b.locationManagementVersion!==1;
  const oldWorkers=migrating?safe(b.workers):0;
  // Fill defaults on every pass, including newly opened branches on an already
  // migrated company. New branches start at level 1 with no staff/manager.
  for(let i=0;i<b.locations.length;i++){
    const l=b.locations[i];
    l.name=l.name||siteNames[l.id]||'Location '+(i+1);
    l.icon=l.icon||icons[l.id]||'🏢';
    l.level=Math.max(1,safe(l.level??(migrating?b.level:1)??1));
    l.marketing=safe(l.marketing??(migrating?b.marketing:0)??0);
    l.efficiency=safe(l.efficiency??(migrating?b.efficiency:0)??0);
    l.workers=safe(l.workers??(migrating&&i===0?oldWorkers:0));
    l.manager=typeof l.manager==='boolean'?l.manager:(migrating&&i===0&&b.manager===true);
    l.basePopularity=clamp(num(l.basePopularity??b.popularity??55),5,100);
    l.rent=num(l.rent)||1;l.demand=num(l.demand)||1;
  }
  b.locationManagementVersion=1;
  if(migrating){b.workers=0;b.manager=false}
  b.chainCount=b.locations.length-1;
  return b;
}
function normalizeAll(){(state.businesses||[]).forEach(normalize)}
function cap(l){return clamp(6+(Math.max(1,safe(l.level))-1)*6,6,5000)}
function allWorkers(){return(state.businesses||[]).reduce((n,b)=>n+locations(b).reduce((sum,l)=>sum+safe(l.workers),0),0)}
function empireCap(){return window.ProfitLandsGrowth?.workforceTier?.().cap||12}
function room(l){return Math.max(0,Math.min(cap(l)-safe(l.workers),empireCap()-allWorkers()))}
function price(b,l,kind,quantity=1){
  const t=type(b);if(!t||!l)return Infinity;
  const rent=clamp(num(l.rent)||1,.5,3),demand=clamp(num(l.demand)||1,.5,3);
  const level=Math.max(1,safe(l.level));
  if(kind==='upgrade')return Math.round(t.cost*(1+level*.75)*(.75+rent*.25));
  if(kind==='marketing')return Math.round(t.cost*.65*(safe(l.marketing)+1)*demand);
  if(kind==='efficiency')return Math.round(t.cost*.7*(safe(l.efficiency)+1)*rent);
  if(kind==='manager')return Math.round(t.cost*1.5*(.75+rent*.25));
  if(kind==='hire'){
    const count=Math.floor(Number(quantity));
    if(!Number.isInteger(count)||count<1||count>25)return Infinity;
    let cost=0;
    for(let i=0;i<count;i++)cost+=Math.round(t.cost*.38*(.8+rent*.2)*(1+(safe(l.workers)+i)*.025));
    return cost;
  }
  if(kind==='sell'){
    const investment=t.cost*(1+(level-1)*.25)+Math.max(0,locations(b).indexOf(l))*(t.cost*2);
    return Math.round(investment*.65*(.8+demand*.2));
  }
  return Infinity;
}
function staffingAdjustment(b,l,revenue,cost){
  const workers=safe(l.workers),manager=l.manager===true;
  const wageBase=workers*(type(b)?.baseExpense||0)*.055*(num(l.rent)||1);
  const benefit=revenue*(workers*.12/(1+workers*.025)+(manager?.18:0));
  const payroll=(wageBase+(manager?cost*.23:0))*(window.ProfitLandsAdvancements?.modifiers?.(l)?.payroll||1);
  return benefit-payroll;
}
function spend(cost){
  if(!Number.isFinite(cost)||cost<0||state.actions<=0||!canPay(cost))return false;
  return spendAction(cost);
}
function doAction(bIndex,lIndex,kind,quantity=1){
  const b=state.businesses[bIndex];if(!b)return false;
  normalize(b);
  const l=b.locations[lIndex];if(!l)return false;
  if(kind==='hire'&&(!Number.isInteger(quantity)||quantity<1||quantity>25||quantity>room(l))){toast('Not enough staff positions. Upgrade this location or grow your empire.');return false}
  if(kind==='manager'&&l.manager){toast('This location already has a manager.');return false}
  if(kind==='sell'&&!(window.confirm?.('Sell '+l.name+'? This removes this location and its staff permanently.')??true))return false;
  const cost=price(b,l,kind,quantity);
  if(kind==='sell'){
    // Selling is not an action cost; revenue is credited to the huge ledger.
    if(window.ProfitLandsMoney)window.ProfitLandsMoney.gain(cost);
    else state.cash+=cost;
    b.locations.splice(lIndex,1);
    b.chainCount=b.locations.length-1;
    if(!b.locations.length){state.businesses.splice(bIndex,1);$('manageModal')?.classList.add('hidden')}
    state.news.push('LOCATION SALE — '+b.name+' sold '+l.name+' for '+moneyText(cost)+'.');
    toast('Location sold for '+moneyText(cost)+'.');
  }else{
    if(!spend(cost)){toast(state.actions<=0?'No actions remaining.':'Not enough cash for this location.');return false}
    if(kind==='upgrade')l.level++;
    else if(kind==='marketing'){l.marketing++;l.basePopularity=clamp(l.basePopularity+8,5,100)}
    else if(kind==='efficiency')l.efficiency++;
    else if(kind==='hire')l.workers+=quantity;
    else if(kind==='manager')l.manager=true;
    else return false;
    const metric={upgrade:'upgrades',marketing:'campaigns',efficiency:'optimizations',hire:'hired'}[kind];
    if(metric)window.ProfitLandsBadges?.record?.(b.type,metric,kind==='hire'?quantity:1);
    state.news.push('LOCATION OPERATIONS — '+b.name+' · '+l.name+': '+kind+(kind==='hire'?' '+quantity:'')+'.');
    toast(kind==='hire'?quantity+' employee(s) hired at '+l.name+'.':l.name+': '+kind+' completed.');
  }
  save();render();window.ProfitLandsGrowth?.render?.();
  if(b.locations.length&&state.businesses.includes(b))open(state.businesses.indexOf(b),Math.min(lIndex,b.locations.length-1));
  return true;
}
function view(b,l,index){
  const actual=window.ProfitLandsEconomy?.locationProfit?.(b,l,index)??0;
  const rate=window.ProfitLandsRealtime?.period||60;
  const sign=actual>=0?'+':'';
  const hireCost=price(b,l,'hire',1);
  const level=safe(l.level)||1;
  const actions=state.actions>0;
  const minimized=minimizedLocations.has(siteKey(b,l,index));
  const button=(kind,label,description,disabled=false)=>'<button type="button" class="upgrade-button" data-site-action="'+kind+'" data-site="'+index+'" '+(disabled?'disabled':'')+'><b>'+label+'</b><small>'+description+'</small></button>';
  return '<section class="site-operation" data-site-section="'+index+'">'+
    '<div class="site-operation-head"><div><h3>'+l.icon+' '+l.name+'</h3><span>Location '+(index+1)+' · Level '+level+' · '+safe(l.workers)+'/'+cap(l)+' employees</span></div>'+
    '<strong class="'+(actual<0?'danger':'good')+'">'+sign+moneyText(actual/rate)+'/sec</strong>'+
    '<button type="button" class="site-section-toggle" data-site-toggle="'+index+'" aria-expanded="'+(!minimized)+'">'+(minimized?'+ Expand':'− Minimize')+'</button></div>'+
    '<div class="site-operation-body" '+(minimized?'hidden':'')+'>'+
    '<div class="site-lab-link"><button type="button" data-site-lab="'+index+'">Products & Operations →</button> <button type="button" data-site-advances="'+index+'">Advancements & Milestones →</button></div>'+  
    '<div class="site-operation-actions">'+
    button('upgrade','⬆ Upgrade location','Level '+(level+1)+' · '+moneyText(price(b,l,'upgrade')),!actions||!canPay(price(b,l,'upgrade')))+
    button('marketing','📢 Local marketing','+8 local popularity · '+moneyText(price(b,l,'marketing')),!actions||!canPay(price(b,l,'marketing')))+
    button('efficiency','⚙ Improve efficiency','Lower local operating costs · '+moneyText(price(b,l,'efficiency')),!actions||!canPay(price(b,l,'efficiency')))+
    button('sell','💰 Sell this location','Receive '+moneyText(price(b,l,'sell')))+
    '</div><div class="site-staff-box"><div><b>👥 Staff & management</b><small>Payroll affects this location only. '+safe(l.workers)+' employed · '+room(l)+' openings available · manager: '+(l.manager?'hired':'none')+'</small></div>'+
    '<label>Hire <select data-site-qty="'+index+'" aria-label="Staff to hire at '+l.name+'"><option value="1">1 employee</option><option value="5">5 employees</option><option value="10">10 employees</option><option value="25">25 employees</option></select></label>'+
    '<div class="site-staff-actions">'+
    button('hire','Hire employees',moneyText(hireCost)+' for 1 employee',!actions||room(l)<1||!canPay(hireCost))+
    button('manager',l.manager?'Manager employed':'Hire manager',l.manager?'Maintains local popularity':moneyText(price(b,l,'manager'))+' plus salary',l.manager||!actions||!canPay(price(b,l,'manager')))+
    '</div></div></div></section>';
}
function open(index,focused=0){
  normalizeAll();
  const b=state.businesses[index];if(!b)return;
  const t=type(b);if(!t)return;
  const e=$('manageContent'),modal=$('manageModal');if(!e||!modal)return;
  const locs=b.locations;
  const period=window.ProfitLandsRealtime?.period||60;
  const total=window.businessDailyProfit?.(b)||0;
  const bBalance=num(b.financialBalance);
  const expansion=Math.round(t.cost*10*(1+(locs.length-1)*.35));
  const actions=state.actions>0;
  e.innerHTML='<div class="manage-head"><div><span class="eyebrow">COMPANY & LOCATION MANAGEMENT</span><h2>'+t.icon+' '+b.name+'</h2><p class="modal-sub">'+t.desc+'</p></div>'+
    '<strong class="'+(total<0?'danger':'good')+'">'+(total>=0?'+':'')+moneyText(total/period)+'/sec</strong></div>'+
    '<div class="manage-stats"><div class="mini-stat"><small>LOCATIONS</small><b>'+locs.length+'</b></div>'+
    '<div class="mini-stat"><small>EMPLOYEES</small><b>'+locs.reduce((n,l)=>n+safe(l.workers),0)+'</b></div>'+
    '<div class="mini-stat"><small>EMPIRE EMPLOYEES</small><b>'+allWorkers()+'/'+empireCap()+'</b></div>'+
    '<div class="mini-stat"><small>ACTIONS</small><b>'+state.actions+'</b></div></div>'+
    '<div class="finance-row"><span>Company balance</span><b class="'+(bBalance<0?'danger':'good')+'">'+moneyText(bBalance)+'</b></div>'+
    '<p class="site-help">Each location has separate upgrades, marketing, efficiency, staffing, and resale value. Costs depend on location rent and demand.</p>'+
    '<div class="site-list-toolbar"><button type="button" data-site-bulk="collapse">− Minimize locations</button><button type="button" data-site-bulk="expand">+ Expand locations</button></div>'+
    '<div class="site-operation-list">'+locs.map((l,i)=>view(b,l,i)).join('')+'</div>'+
    '<div class="chain-box"><b>🏢 Chain expansion</b><p class="modal-sub">Choose a new district and add another independently managed location.</p>'+
    '<button class="chain-button" id="siteExpand" '+(!actions||!canPay(expansion)?'disabled':'')+'>Choose Location #'+(locs.length+1)+' · '+moneyText(expansion)+'</button></div>';
  modal.classList.remove('hidden');
  e.querySelectorAll('[data-site-bulk]').forEach(button=>{
    button.onclick=()=>{
      const collapse=button.dataset.siteBulk==='collapse';
      for(let i=0;i<locs.length;i++){
        const key=siteKey(b,locs[i],i);
        if(collapse)minimizedLocations.add(key);else minimizedLocations.delete(key);
      }
      open(index);
    };
  });
  e.querySelectorAll('[data-site-toggle]').forEach(button=>{
    button.onclick=()=>{
      const i=Number(button.dataset.siteToggle),l=locs[i];
      if(!l)return;
      const key=siteKey(b,l,i),collapse=!minimizedLocations.has(key);
      if(collapse)minimizedLocations.add(key);else minimizedLocations.delete(key);
      const section=e.querySelector('[data-site-section="'+i+'"]');
      const content=section?.querySelector('.site-operation-body');
      if(content)content.hidden=collapse;
      button.setAttribute('aria-expanded',String(!collapse));
      button.textContent=collapse?'+ Expand':'− Minimize';
    };
  });
  e.querySelectorAll('[data-site-action]').forEach(button=>{
    button.onclick=()=>{
      const n=Number(button.dataset.site),kind=button.dataset.siteAction,qty=e.querySelector('[data-site-qty="'+n+'"]');
      doAction(index,n,kind,kind==='hire'?Number(qty?.value||1):1);
    };
  });
  e.querySelectorAll('[data-site-qty]').forEach(select=>{
    const refresh=()=>{
      const i=Number(select.dataset.siteQty),branch=locs[i];
      const hire=e.querySelector('[data-site-action="hire"][data-site="'+i+'"]');
      if(!branch||!hire)return;
      const quantity=Number(select.value)||1,cost=price(b,branch,'hire',quantity);
      const note=hire.querySelector('small');
      if(note)note.textContent=quantity+' employee'+(quantity===1?'':'s')+' · '+moneyText(cost);
      hire.disabled=!state.actions||room(branch)<quantity||!canPay(cost);
    };
    select.addEventListener('change',refresh);
    refresh();
  });
  e.querySelectorAll('[data-site-advances]').forEach(button=>{
    button.onclick=()=>{
      const i=Number(button.dataset.siteAdvances);
      modal.classList.add('hidden');
      window.ProfitLandsAdvancements?.select?.(index,i);
    };
  });
  e.querySelectorAll('[data-site-lab]').forEach(button=>{
    button.onclick=()=>{
      const i=Number(button.dataset.siteLab),l=locs[i];
      if(!l)return;
      modal.classList.add('hidden');
      window.ProfitLandsEmpire?.selectSite?.(l);
    };
  });
  const expand=$('siteExpand');
  if(expand)expand.onclick=()=>window.manageAction?.(index,'chain');
  // A small opt-in focus can make the selected location easy to find.
  if(focused>0&&locs[focused])e.querySelector('[data-site-section="'+focused+'"]')?.scrollIntoView?.({block:'nearest'});
}
function init(){normalizeAll();window.openManage=open;window.ProfitLandsLocationOps={normalize,normalizeAll,price,cap,allWorkers,empireCap,room,staffingAdjustment,doAction,open,locations};}
init();
})();