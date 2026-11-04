/* ProfitLands economy-aware business and finance rendering */
(function(){
  if(typeof state==='undefined'||!window.ProfitLandsEconomy)return;
  const RISK=window.ProfitLandsEconomy.RISK||{};
  const locs=window.ProfitLandsEconomy.LOCS||{};
  const moneyF=n=>money(n);
  const perSec=n=>window.ProfitLandsRealtime?.formatRate?.(n/(window.ProfitLandsRealtime.period||60))||money(n/60);
  const showFlow=n=>(n>=0?'+':'')+perSec(n)+'/sec';
  function riskLabel(b){const r=RISK[b.type]||{econ:1,cost:1,weather:.7,vol:.15};const score=(r.econ+r.cost+r.weather+r.vol*2)/4;return score<.85?'Low':score<1.1?'Moderate':score<1.35?'High':score<1.65?'Very High':'Extreme'}
  function profit(b,factors){return window.businessDailyProfit?window.businessDailyProfit(b,factors):0}
  // Render only the visible portfolio window, not hundreds of hidden cards.
  // Controls live OUTSIDE businessList, so periodic updates cannot steal input focus.
  const PAGE_SIZE=36;
  let portfolioQuery='',portfolioLimit=PAGE_SIZE,portfolioControls=null,portfolioInput=null;
  let portfolioSort='original',attentionOnly=false;
  const needsAttention=b=>Boolean(b.bankruptcyPending)||Number(b.financialBalance||0)<0;
  const locationCount=b=>Array.isArray(b.locations)&&b.locations.length?b.locations.length:(Number(b.chainCount)||0)+1;
  const sorting={
    original:(a,b)=>a-b,
    newest:(a,b)=>b-a,
    name:(a,b)=>String(state.businesses[a].name||'').localeCompare(String(state.businesses[b].name||''))||a-b,
    locations:(a,b)=>locationCount(state.businesses[b])-locationCount(state.businesses[a])||a-b,
    balance:(a,b)=>(Number(state.businesses[a].financialBalance)||0)-(Number(state.businesses[b].financialBalance)||0)||a-b
  };
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function setupPortfolio(box){
    if(portfolioControls?.isConnected)return portfolioControls;
    if(!box.parentElement||!document.createElement)return null;
    const controls=document.createElement('div');
    controls.className='pl-portfolio-controls';
    const label=document.createElement('label');
    label.className='pl-portfolio-search-label';
    label.textContent='Search companies';
    const input=document.createElement('input');
    input.type='search';input.className='pl-portfolio-search';
    input.placeholder='Company or industry';input.setAttribute('aria-label','Search your business portfolio');
    input.autocomplete='off';input.value=portfolioQuery;
    input.addEventListener('input',()=>{
      portfolioQuery=String(input.value||'').trim().toLocaleLowerCase();
      portfolioLimit=PAGE_SIZE;
      renderBusinesses();
    });
    label.appendChild(input);
    const sortLabel=document.createElement('label');
    sortLabel.className='pl-portfolio-option-label';sortLabel.textContent='Sort by';
    const sort=document.createElement('select');
    sort.className='pl-portfolio-sort';sort.setAttribute('aria-label','Sort businesses');
    for(const [id,title] of [['original','Original order'],['newest','Newest first'],['name','Company A–Z'],['locations','Most locations'],['balance','Lowest balance']]){
      const option=document.createElement('option');option.value=id;option.textContent=title;sort.appendChild(option);
    }
    sort.value=portfolioSort;
    sort.addEventListener('change',()=>{
      portfolioSort=Object.hasOwn(sorting,sort.value)?sort.value:'original';
      portfolioLimit=PAGE_SIZE;renderBusinesses();
    });
    sortLabel.appendChild(sort);
    const attentionLabel=document.createElement('label');
    attentionLabel.className='pl-portfolio-attention-label';
    const attention=document.createElement('input');
    attention.type='checkbox';attention.checked=attentionOnly;
    attention.setAttribute('aria-label','Show companies with negative balances or bankruptcy warnings only');
    attention.addEventListener('change',()=>{
      attentionOnly=Boolean(attention.checked);portfolioLimit=PAGE_SIZE;renderBusinesses();
    });
    const attentionText=document.createElement('span');attentionText.textContent='Needs attention only';
    attentionLabel.append(attention,attentionText);
    const clear=document.createElement('button');
    clear.type='button';clear.className='pl-portfolio-clear';clear.textContent='Clear filters';
    clear.addEventListener('click',()=>{
      portfolioQuery='';portfolioSort='original';attentionOnly=false;portfolioLimit=PAGE_SIZE;
      input.value='';sort.value='original';attention.checked=false;renderBusinesses();input.focus?.();
    });
    const count=document.createElement('span');
    count.className='pl-portfolio-count';count.setAttribute('aria-live','polite');
    const more=document.createElement('button');
    more.type='button';more.className='pl-portfolio-more';
    more.textContent='Show more companies';
    more.addEventListener('click',()=>{portfolioLimit+=PAGE_SIZE;renderBusinesses()});
    controls.append(label,sortLabel,attentionLabel,clear,count,more);
    box.parentElement.insertBefore(controls,box);
    portfolioControls=controls;portfolioInput=input;
    controls._count=count;controls._more=more;controls._clear=clear;controls._sort=sort;controls._attention=attention;
    return controls;
  }
  function renderBusinesses(){
    const box=document.getElementById('businessList');if(!box)return;
    const controls=setupPortfolio(box);
    const all=state.businesses||[];
    const matched=[];
    for(let i=0;i<all.length;i++){
      const b=all[i];
      if(attentionOnly&&!needsAttention(b))continue;
      if(!portfolioQuery||String(b.name||'').toLocaleLowerCase().includes(portfolioQuery)||
        String(BUSINESS_TYPES.find(t=>t.id===b.type)?.name||b.type||'').toLocaleLowerCase().includes(portfolioQuery))matched.push(i);
    }
    if(controls)matched.sort(sorting[portfolioSort]||sorting.original);
    const visible=controls?matched.slice(0,portfolioLimit):matched;
    const profitContext=visible.length?window.ProfitLandsEconomy?.profitFactors?.():null;
    if(controls){
      controls.hidden=all.length<9&&!portfolioQuery&&!attentionOnly&&portfolioSort==='original';
      const flagged=all.reduce((n,b)=>n+(needsAttention(b)?1:0),0);
      controls._count.textContent=(matched.length?'Showing '+visible.length+' of '+matched.length+' companies':'No matching companies')+
        (flagged?' · '+flagged+' need attention':'');
      controls._clear.hidden=!portfolioQuery&&!attentionOnly&&portfolioSort==='original';
      controls._more.hidden=visible.length>=matched.length;
      controls._more.disabled=visible.length>=matched.length;
    }
    const html=!all.length?
      '<div class="empty">No businesses yet. Buy one to start building your empire.</div>':
      !matched.length?'<div class="empty">No companies match those filters. Clear filters to see your full portfolio.</div>':
      visible.map(i=>{
        const b=all[i],t=BUSINESS_TYPES.find(x=>x.id===b.type);
        if(!t)return '';
        const p=profit(b,profitContext),r=riskLabel(b),bal=b.financialBalance||0;
        const sites=b.locations||[];
        // Avoid spreading a growing location list into Math.max arguments.
        const highest=b.locationManagementVersion===1?
          sites.reduce((max,l)=>Math.max(max,Number(l.level)||1),1):b.level;
        const staff=b.locationManagementVersion===1?sites.reduce((sum,l)=>sum+(Number(l.workers)||0),0):(b.workers||0);
        const count=b.locations?.length||b.chainCount+1;
        const safeName=escapeHtml(b.name),safeType=escapeHtml(t.name);
        return '<div class="business-card" data-business="'+i+'" role="button" tabindex="0" aria-label="Manage '+safeName+'">'+
          '<div class="business-top"><div><div class="business-name">'+t.icon+' '+safeName+'</div>'+
          '<div class="business-type">'+safeType+' · '+count+' locations · Highest Lv '+highest+' · '+staff+' staff</div></div>'+
          '<div class="business-profit '+(p<0?'danger':'')+'">'+showFlow(p)+'</div></div>'+
          '<div class="business-meta"><div class="mini-stat"><small>POPULARITY</small><b>'+Math.round(b.popularity||55)+
          '%</b><div class="popbar"><i style="width:'+Math.max(0,Math.min(100,b.popularity||55))+'%"></i></div></div>'+
          '<div class="mini-stat"><small>RISK</small><b>'+r+'</b></div>'+
          '<div class="mini-stat"><small>BUSINESS BALANCE</small><b class="'+(bal<0?'danger':'')+'">'+moneyF(bal)+'</b></div>'+
          '<div class="mini-stat"><small>STATUS</small><b class="'+(b.bankruptcyPending?'danger':p<0?'danger':'good')+'">'+
          (b.bankruptcyPending?'BANKRUPTCY':p<0?'LOSS':'PROFIT')+'</b></div></div></div>';
      }).join('');
    // Preserve DOM nodes, scroll position and keyboard focus when nothing changed.
    if(box.innerHTML!==html)box.innerHTML=html;
    if(!box._plPortfolioEvents){
      box._plPortfolioEvents=true;
      const openFrom=target=>{
        const card=target?.closest?.('.business-card');
        if(!card||!box.contains(card))return;
        const i=Number(card.dataset.business);
        if(Number.isSafeInteger(i)&&i>=0&&i<state.businesses.length)window.openManage?.(i);
      };
      box.addEventListener('click',event=>openFrom(event.target));
      box.addEventListener('keydown',event=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        if(!event.target?.closest?.('.business-card'))return;
        event.preventDefault();openFrom(event.target);
      });
    }
  }
  function renderHoldings(){
    const box=document.getElementById('holdings');if(!box)return;const items=[];
    STOCKS.forEach(s=>{const h=state.stocks?.[s.id];if(h?.shares)items.push('<div class="holding"><div><b>'+s.ticker+'</b><small>'+h.shares+' share'+(h.shares===1?'':'s')+'</small></div><strong>'+moneyF(h.shares*s.price)+'</strong></div>')});
    if(state.businesses.length)items.push('<div class="holding"><div><b>Businesses</b><small>'+state.businesses.length+' companies · '+state.businesses.reduce((n,b)=>n+(b.locations?.length||b.chainCount+1),0)+' locations</small></div><strong>'+moneyF(state.businesses.reduce((n,b)=>n+(window.ProfitLandsEconomy?.businessValue?.(b)||window.businessValue(b)),0))+'</strong></div>');
    if(state.majorCompanies?.length)items.push('<div class="holding"><div><b>Major Corporations</b><small>'+state.majorCompanies.length+' corporate tier'+(state.majorCompanies.length===1?'':'s')+'</small></div><strong>'+moneyF(state.majorCompanies.reduce((n,c)=>n+(c.value||0),0))+'</strong></div>');
    if(state.property)items.push('<div class="holding"><div><b>Property</b><small>'+state.property+' owned</small></div><strong>'+moneyF(state.property*750)+'</strong></div>');
    const debt=(state.loans||[]).reduce((n,l)=>n+(l.balance||0),0);if(debt)items.push('<div class="holding"><div><b>Debt</b><small>Outstanding loans</small></div><strong class="danger">-'+moneyF(debt)+'</strong></div>');
    box.innerHTML=items.length?items.join(''):'<div class="empty">Nothing here yet. Start building your empire.</div>';
  }
  function renderFinance(){
    const box=document.getElementById('financeInfo');if(!box)return;
    const profitContext=state.businesses.length?window.ProfitLandsEconomy?.profitFactors?.():null;
    const p=state.businesses.reduce((s,b)=>s+profit(b,profitContext),0)+((state.majorCompanies||[]).reduce((s,c)=>s+(c.liveDayRate||c.lastProfit||0),0))+(state.property||0)*12;const debt=(state.loans||[]).reduce((s,l)=>s+(l.balance||0),0);
    box.innerHTML='<div class="finance-row"><span>Net cash flow /sec</span><b class="'+(p>=0?'good':'danger')+'">'+showFlow(p)+'</b></div><div class="finance-row"><span>Businesses</span><b>'+state.businesses.length+'</b></div><div class="finance-row"><span>Major corporations</span><b>'+((state.majorCompanies||[]).length)+'</b></div><div class="finance-row"><span>Total locations</span><b>'+state.businesses.reduce((n,b)=>n+(b.locations?.length||b.chainCount+1),0)+'</b></div><div class="finance-row"><span>Debt</span><b class="'+(debt?'danger':'good')+'">'+moneyF(debt)+'</b></div><div class="finance-row"><span>Financial status</span><b class="'+(state.penaltyDays?'danger':'good')+'">'+(state.penaltyDays?'LEGAL RECOVERY PERIOD':p<0?'UNDER PRESSURE':'HEALTHY')+'</b></div><div class="finance-row"><span>Next wealth milestone</span><b>'+(window.ProfitLandsProgression?.milestone(window.ProfitLandsMoney?.netWorth?.(window.netWorth()-state.cash)||window.netWorth())?.targetLabel||'Keep growing')+'</b></div>';
  }
  function openManage(index){
    const b=state.businesses[index];if(!b)return;const t=BUSINESS_TYPES.find(x=>x.id===b.type),p=profit(b),r=RISK[b.type]||{econ:1,cost:1,weather:.7,vol:.15};
    const upgradeCost=Math.round(t.cost*(1+b.level*.75)),marketingCost=Math.round(t.cost*.65*(b.marketing+1)),efficiencyCost=Math.round(t.cost*.7*(b.efficiency+1)),chainCost=Math.round(t.cost*10*(1+((b.locations?.length||1)-1)*.35)),bal=b.financialBalance||0,limit=-(b.originalCost||t.cost);
    const c=document.getElementById('manageContent');c.innerHTML='<div class="manage-head"><div><span class="eyebrow">COMPANY MANAGEMENT</span><h2>'+t.icon+' '+b.name+'</h2><p class="modal-sub">'+t.desc+'</p></div><div class="business-profit '+(p<0?'danger':'')+'">' +showFlow(p)+'</div></div><div class="manage-stats"><div class="mini-stat"><small>LEVEL</small><b>'+b.level+'</b></div><div class="mini-stat"><small>POPULARITY</small><b>'+Math.round(b.popularity||55)+'%</b></div><div class="mini-stat"><small>LOCATIONS</small><b>'+(b.locations?.length||1)+'</b></div><div class="mini-stat"><small>RISK</small><b>'+riskLabel(b)+'</b></div></div><div class="location-summary">'+(b.locations||[{name:'Downtown',icon:'🏙️'}]).map((l,i)=>'<div><span>'+l.icon+'</span><b>Location '+(i+1)+'</b><small>'+l.name+'</small><strong>'+showFlow((function(){const x={...b,locations:[l]};return window.businessDailyProfit(x)})())+'</strong></div>').join('')+'</div><div class="finance-row"><span>Business balance</span><b class="'+(bal<0?'danger':'good')+'">'+moneyF(bal)+'</b></div><div class="finance-row"><span>Bankruptcy threshold</span><b class="danger">'+moneyF(limit)+'</b></div><div class="manage-actions"><button class="upgrade-button" data-econ-manage="upgrade"><b>⬆ Upgrade Business</b><small>Level '+(b.level+1)+' · '+moneyF(upgradeCost)+'</small></button><button class="upgrade-button" data-econ-manage="marketing"><b>📢 Marketing</b><small>+8 popularity · '+moneyF(marketingCost)+'</small></button><button class="upgrade-button" data-econ-manage="efficiency"><b>⚙ Improve Efficiency</b><small>Lower operating expenses · '+moneyF(efficiencyCost)+'</small></button><button class="upgrade-button" data-econ-manage="sell"><b>💰 Sell Business</b><small>Recover part of its current value</small></button></div><div class="chain-box"><b>🏢 Chain Expansion</b><p class="modal-sub">Open another location. Higher-demand areas can earn more, but their rent is also higher.</p><button class="chain-button" data-econ-manage="chain">Choose Location #'+((b.locations?.length||1)+1)+' · '+moneyF(chainCost)+'</button></div>';
    document.getElementById('manageModal').classList.remove('hidden');
    c.querySelectorAll('[data-econ-manage]').forEach(el=>el.onclick=()=>window.manageAction?.(index,el.dataset.econManage));
  }
  window.renderBusinesses=renderBusinesses;window.renderHoldings=renderHoldings;window.renderFinance=renderFinance;window.openManage=openManage;
  setTimeout(()=>window.render?.(),0);
})();