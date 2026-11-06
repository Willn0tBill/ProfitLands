/* ProfitLands advanced online economy controls.
 * Renders the authoritative server snapshot only; does not mutate local solo cash.
 */
(function(){
 'use strict';
 let tab='operations',chosenCompany=0,chosenSite=0,pending=false;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=value=>window.ProfitLandsMoney?.format?.(value)||'$'+Number(value||0).toLocaleString('en-US');
 const btn=(op,label,args={},disabled=false,subtitle='')=>
  '<button type="button" class="pl-advanced-action" data-enterprise-op="'+esc(op)+'"'+
  Object.entries(args).map(([k,v])=>' data-param-'+k.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())+'="'+esc(v)+'"').join('')+
  (disabled?' disabled':'')+'><strong>'+esc(label)+'</strong>'+
  (subtitle?'<small>'+esc(subtitle)+'</small>':'')+'</button>';
 const summary=(name,value)=>'<span class="pl-advanced-metric"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></span>';
 const baseActions=(p,s,i)=>{
  const b=p.businesses[i],t=window.ProfitLandsOnline?.getCatalog?.().find(x=>x.id===b?.type);
  if(!b)return '<p>Buy a business to manage a company.</p>';
  const sites=Array.isArray(b.sites)&&b.sites.length?b.sites:[{level:1,stock:0,price:100,autoRestock:false}];
  chosenSite=Math.min(Math.max(0,chosenSite),sites.length-1);
  const site=sites[chosenSite]||sites[0];
  const siteOptions=sites.map((x,idx)=>'<option value="'+idx+'" '+(idx===chosenSite?'selected':'')+'>Branch '+(idx+1)+' · Level '+esc(x.level||1)+'</option>').join('');
  return '<div class="pl-advanced-company"><label for="plAdvancedCompany">Company</label><select id="plAdvancedCompany">'+
   p.businesses.map((x,idx)=>'<option value="'+idx+'" '+(idx===i?'selected':'')+'>'+
    esc(window.ProfitLandsOnline?.getCatalog?.().find(t=>t.id===x.type)?.name||'Business')+' '+(idx+1)+'</option>').join('')+
   '</select></div>'+
   '<div class="pl-advanced-metrics">'+summary('Workers',b.workers||0)+summary('Manager',b.manager?'Hired':'None')+
   summary('Marketing',b.marketing||0)+summary('Efficiency',b.efficiency||0)+summary('Locations',sites.length)+'</div>'+
   '<div class="pl-advanced-grid">'+
   btn('hireStaff','Hire 1 employee',{index:i,quantity:1},false,'Paid from online wallet')+
   btn('hireStaff','Hire 10 employees',{index:i,quantity:10},false,'Scales wages and production')+
   btn('appointManager','Appoint manager',{index:i},!!b.manager,'Boost business output')+
   btn('runMarketing','Marketing campaign',{index:i},false,'Raises customer demand')+
   btn('upgradeEfficiency','Improve efficiency',{index:i},false,'Raises net earnings')+
   btn('openBranch','Open another location',{index:i},sites.length>=(s.siteCap||8),'Expands this company')+
   '</div><div class="pl-advanced-company"><label for="plAdvancedSite">Manage location</label><select id="plAdvancedSite">'+siteOptions+
   '</select></div><div class="pl-advanced-metrics">'+summary('Level',site.level||1)+summary('Inventory',site.stock||0)+
   summary('Auto restock',site.autoRestock?'On':'Off')+'</div><div class="pl-advanced-grid">'+
   btn('upgradeBranch','Upgrade branch',{index:i,site:chosenSite},Number(site.level)>=30,'Investment in this location')+
   btn('restockBranch','Order 100 stock',{index:i,site:chosenSite,quantity:100},Number(site.stock)>4900,'Funds deducted by server')+
   btn('setPrice','Value pricing (80%)',{index:i,site:chosenSite,percent:80},false,'Affects verified retail stock sales')+
   btn('setPrice','Premium pricing (120%)',{index:i,site:chosenSite,percent:120},false,'Affects verified retail stock sales')+
   btn('setAutoRestock',site.autoRestock?'Turn auto-restock off':'Turn auto-restock on',
    {index:i,site:chosenSite,enabled:!site.autoRestock},
    !site.autoRestock&&!(s.research||[]).includes('automation'),'Requires automation research to enable')+
   '</div>';
 };
 const sections={
  operations:(p,s)=>{
   const b=p.businesses[chosenCompany];
   return '<p class="pl-online-note">Manage real online companies, staff, marketing and locations. All purchases are verified by the regional server.</p>'+
    baseActions(p,s,chosenCompany);
  },
  supply:(p,s)=>{
   const companies=p.businesses||[];
   chosenCompany=Math.min(chosenCompany,Math.max(0,companies.length-1));
   const selected=companies[chosenCompany];
   const sites=Array.isArray(selected?.sites)&&selected.sites.length?selected.sites:[{stock:0,level:1}];
   chosenSite=Math.min(chosenSite,sites.length-1);
   return '<div class="pl-advanced-metrics">'+summary('Warehouses',s.warehouse||0)+
    summary('Trucks',s.trucks||0)+summary('Warehouse inventory',s.warehouseStock||0)+
    summary('Routes',(s.routes||(s.route?[s.route]:[])).length+' / '+(s.trucks||0))+'</div>'+
    '<div class="pl-advanced-grid">'+btn('buyWarehouse','Buy warehouse',{},(s.warehouse||0)>=20,'Adds 1,000-unit capacity')+
    btn('buyTruck','Buy delivery truck',{},(s.trucks||0)>=100,'Unlocks warehouse deliveries')+
    btn('warehouseOrder','Purchase 100 warehouse stock',{quantity:100},
     !(s.warehouse>0)||(s.warehouseStock||0)+100>s.warehouse*1000,'Costs $300 from server wallet')+
    '</div>'+
    (selected?'<div class="pl-advanced-company"><label for="plAdvancedCompany">Delivery company</label>'+
     '<select id="plAdvancedCompany">'+companies.map((b,i)=>'<option value="'+i+'" '+
      (i===chosenCompany?'selected':'')+'>'+
      esc(window.ProfitLandsOnline?.getCatalog?.().find(t=>t.id===b.type)?.name||'Business')+' '+(i+1)+'</option>').join('')+
     '</select><label for="plAdvancedSite">Destination</label><select id="plAdvancedSite">'+
     sites.map((site,i)=>'<option value="'+i+'" '+(i===chosenSite?'selected':'')+
      '>Branch '+(i+1)+' · Stock '+esc(site.stock||0)+'</option>').join('')+'</select></div>'+
     '<div class="pl-advanced-grid">'+
      btn('deliverWarehouseStock','Deliver 50 stock',{index:chosenCompany,site:chosenSite,quantity:50},
       !s.trucks||s.warehouseStock<50||sites[chosenSite].stock+50>5000,'Moves existing warehouse goods')+
      btn('setSupplyRoute','Auto-deliver 15/min',{index:chosenCompany,site:chosenSite,quantity:15},
       !s.trucks||!(s.research||[]).includes('logistics')||
       ((s.routes||(s.route?[s.route]:[])).length>=s.trucks&&
        !(s.routes||(s.route?[s.route]:[])).some(r=>r.index===chosenCompany&&r.site===chosenSite)),
       'One active route per paid truck')+
      btn('clearSupplyRoute','Stop selected branch route',{index:chosenCompany,site:chosenSite},
       !(s.routes||(s.route?[s.route]:[])).some(r=>r.index===chosenCompany&&r.site===chosenSite),
       'Other routes continue delivering')+
      btn('clearSupplyRoute','Stop all routes',{},
       !(s.routes||(s.route?[s.route]:[])).length,'Leave warehouse inventory intact')+
     '</div>':'<p>Buy a company to configure deliveries.</p>')+
    '<p class="pl-online-note">Each route uses one purchased truck. Routes move real warehouse stock and never create free items.</p>'+
    '<div class="pl-advanced-list">'+(s.routes||(s.route?[s.route]:[])).map(r=>
     '<p>Active: Company '+esc(r.index+1)+' / Branch '+esc(r.site+1)+
     ' · '+esc(r.quantity)+' stock/minute</p>').join('')+'</div>';
  },
  markets:(p,s)=>{
   const stocks=s.quotes||[];
   const holdingsValue=stocks.reduce((sum,q)=>
    sum+Math.floor(Number(s.stocks?.[q.id]||0)*Number(q.priceCents||0)/100),0);
   return '<div class="pl-advanced-metrics">'+
    summary('Current holdings value',fmt(holdingsValue))+
    summary('Available cash',fmt(p.cash))+'</div>'+
    '<p class="pl-online-note">Regional market prices are calculated by the server. Shares and sales are owned by your online account, not a local save.</p>'+
    '<div class="pl-advanced-list">'+stocks.map(t=>{
     const shares=Number(s.stocks?.[t.id]||0),price=Number(t.priceCents||0)/100;
     return '<article class="pl-advanced-market"><div><strong>'+esc(t.ticker)+' · '+esc(t.name)+'</strong>'+
      '<small>'+fmt(price)+' / share · '+shares+' owned</small></div><div>'+
      btn('buyShares','Buy 1',{stockId:t.id,quantity:1},p.cash<price)+
      btn('buyShares','Buy 10',{stockId:t.id,quantity:10},p.cash<price*10)+
      btn('sellShares','Sell 1',{stockId:t.id,quantity:1},shares<1)+'</div></article>';
    }).join('')+'</div>'+
    (p.businesses.length?'<div class="pl-advanced-company"><label for="plAdvancedCompany">Your company for sale</label>'+
     '<select id="plAdvancedCompany">'+p.businesses.map((b,i)=>'<option value="'+i+'" '+(chosenCompany===i?'selected':'')+'>'+
      esc(window.ProfitLandsOnline?.getCatalog?.().find(x=>x.id===b.type)?.name||'Business')+' '+(i+1)+'</option>').join('')+'</select></div>'+
      '<div class="pl-advanced-grid">'+
       btn('listCompany','List selected company',{index:chosenCompany,price:(()=>{
        const b=p.businesses[chosenCompany];const def=window.ProfitLandsOnline?.getCatalog?.().find(x=>x.id===b.type);
        const base=Math.round((def?.cost||500)*(1+(b.level-1)*.15));
        return base+Math.round((def?.cost||500)*1.5*Math.max(0,(b.sites?.length||1)-1))+
         (b.sites||[]).reduce((sum,s)=>sum+Math.max(0,(s.level||1)-1)*Math.round((def?.cost||500)*.12),0);
       })()},false,'Server validates the listing price')+
       btn('cancelCompanyListing','Cancel selected listing',{index:chosenCompany},
        !p.businesses[chosenCompany]?.listing,'Keep your business')+
      '</div>':'')+
    '<h4>Other players\' companies for sale</h4><div id="plCompanyListings" class="pl-advanced-list" role="status">Loading verified listings…</div>';
  },
  finance:(p,s)=>'<div class="pl-advanced-metrics">'+summary('Outstanding loan',fmt(s.loanDebt||0))+
   summary('Properties',(s.properties||[]).length)+summary('World cash',fmt(p.cash))+
   summary('Fiscal year',s.fiscal?.year||1)+summary('Taxable operating profit',fmt(s.fiscal?.taxableProfit||0))+
   summary('Tax rate',((s.fiscalRate||0)*100).toFixed(1)+'%')+
   summary('Tax bill outstanding',fmt(s.fiscal?.taxDue||0))+
   summary('Next fiscal close',s.fiscal?.nextTaxAt?new Date(s.fiscal.nextTaxAt).toLocaleDateString():'—')+'</div>'+
   '<div class="pl-advanced-grid">'+
   btn('borrowLoan','Borrow $5,000',{amount:5000},!!s.loanDebt,'10% fixed repayment premium')+
   btn('borrowLoan','Borrow $50,000',{amount:50000},!!s.loanDebt,'One loan at a time')+
   btn('borrowLoan','Borrow $500,000',{amount:500000},!!s.loanDebt,'One loan at a time')+
   btn('repayLoan','Repay up to $5,000',{amount:5000},!(s.loanDebt>0),'Repayment reduces outstanding debt')+
   btn('payTax','Pay up to $5,000 tax',{amount:5000},!(s.fiscal?.taxDue>0)||p.cash<1,'Pay a verified tax bill')+
   btn('payTax','Pay remaining tax',{amount:Math.min(s.fiscal?.taxDue||0,p.cash)},
    !(s.fiscal?.taxDue>0)||p.cash<1,'Tax liability cannot be paid twice')+
   btn('buyProperty','Buy $10k property',{amount:10000},p.cash<10000,'Build your asset portfolio')+
   btn('buyProperty','Buy $100k property',{amount:100000},p.cash<100000,'Generates rental income')+
   btn('buyProperty','Buy $1m property',{amount:1000000},p.cash<1000000,'Generates rental income')+'</div>'+
   '<p class="pl-online-note">Online corporate income tax is assessed once per 365 real UTC days on tracked operating profit. Unpaid bills remain liabilities; repayment is explicit. Singleplayer uses accelerated game days.</p>',
  corporations:(p,s)=>{
   const holdings=Array.isArray(s.majorCompanies)?s.majorCompanies:[];
   const catalog=Array.isArray(s.majorCatalog)?s.majorCatalog:[];
   const owned=new Set(holdings.map(x=>x.type));
   const profit=holdings.reduce((sum,x)=>{
    const corp=catalog.find(c=>c.id===x.type);
    return sum+(corp?.profitPerMinute||0);
   },0);
   return '<p class="pl-online-note">These are the original singleplayer corporate tiers with the same purchase prices, unlock requirements and baseline operating margins. The regional server verifies ownership and cash.</p>'+
    '<div class="pl-advanced-metrics">'+
    summary('Corporations owned',holdings.length+' / '+catalog.length)+
    summary('Baseline corporate profit',fmt(profit)+'/minute')+
    summary('Empire worth',fmt(p.netWorth))+'</div>'+
    '<div class="pl-advanced-list">'+catalog.map(c=>{
     const has=owned.has(c.id),unlocked=p.netWorth>=c.req;
     const unavailable=has||!unlocked||p.cash<c.price;
     const label=has?'Owned':!unlocked?'Requires '+fmt(c.req):'Acquire '+c.name;
     return '<article class="pl-advanced-market"><div><strong>'+esc(c.name)+
      '</strong><small>Unlock '+fmt(c.req)+' · Purchase '+fmt(c.price)+
      ' · Baseline profit '+fmt(c.profitPerMinute)+'/minute</small></div>'+
      btn('buyMajorCorporation',label,{corporationId:c.id},unavailable,
       has?'Already in your portfolio':'Funded by server-owned cash')+'</article>';
    }).join('')+'</div>';
  },
  growth:(p,s)=>{
   const research=s.researchCatalog||[];
   return '<div class="pl-advanced-metrics">'+summary('Completed contracts',s.contractsCompleted||0)+
    summary('Staff hired',s.metrics?.hires||0)+summary('Trades made',s.metrics?.trades||0)+
    summary('Online trophies',(p.achievements?.earned||0)+' / 131,072')+'</div>'+
    '<div class="pl-advanced-grid">'+research.map(r=>btn('buyResearch',r.name,{researchId:r.id},
     (s.research||[]).includes(r.id)||p.cash<r.cost,'One-time research · '+fmt(r.cost))).join('')+
    btn('claimContract','Claim daily city contract',{},
    s.lastContractDay===new Date().toISOString().slice(0,10)||
    s.lastQualifyingActionDay!==new Date().toISOString().slice(0,10),
    'Complete a paid business, hiring or trade action today')+'</div>'+
    '<p class="pl-online-note">Online achievement ranks are computed from server-owned activity, matching the 131,072 possible industry/track/tier combinations. Merging them with your singleplayer account trophies is still an independent task.</p>'+ 
    '<div class="pl-advanced-company"><label for="plCountrySelector">Home country</label><select id="plCountrySelector" '+(p.businesses.length?'disabled':'')+'>'+
    (s.countryCatalog||[]).map(c=>
     '<option value="'+esc(c.id)+'" '+(s.country===c.id?'selected':'')+'>'+
     esc(c.name)+' ('+esc(c.region)+')</option>').join('')+'</select>'+
     btn('setCountry','Confirm country',{country:s.country},
     p.businesses.length>0||Number(s.metrics?.trades||0)>0||Number(s.loanDebt||0)>0||
     (s.properties||[]).length>0||(s.majorCompanies||[]).length>0||
     Number(s.fiscal?.taxDue||0)>0||Number(s.fiscal?.taxableProfit||0)!==0,
     'Choose before opening businesses, investments or tax liabilities')+'</div>';
  }
 };
 const labels={operations:'Management',supply:'Supply & Logistics',markets:'Stock Market',finance:'Finance & Property',corporations:'Corporations',growth:'Research & Contracts'};
 async function transact(action,params,button){
  if(pending||window.ProfitLandsOnline?.isConnected?.()!==true)return;
  pending=true;const old=button?.textContent;
  if(button){button.disabled=true;button.textContent='Processing…'}
  const status=document.getElementById('plAdvancedStatus');
  try{
   const res=await window.ProfitLandsOnline.enterpriseAction(action,params);
   if(status)status.textContent='Transaction confirmed by server'+(res.cost?' · '+fmt(res.cost):'')+
    (res.reward?' · Reward '+fmt(res.reward):'');
   await window.ProfitLandsWorld?.refresh?.();
  }catch(e){
   if(status)status.textContent='Operation declined: '+String(e?.message||'Please try again').slice(0,150);
  }finally{pending=false;if(button){button.textContent=old;button.disabled=false}}
 }
 async function loadCompanyListings(player,section){
  const root=section.querySelector('#plCompanyListings');
  if(!root||!window.ProfitLandsOnline?.getListings)return;
  try{
   const listings=await window.ProfitLandsOnline.getListings();
   if(!root.isConnected)return;
   const other=(Array.isArray(listings)?listings:[]).filter(x=>x?.sellerUid&&x.sellerUid!==player.uid);
   if(!other.length){root.textContent='There are no other player listings in this region yet.';return}
   root.innerHTML=other.slice(0,30).map(entry=>{
    const type=window.ProfitLandsOnline.getCatalog?.().find(x=>x.id===entry.type);
    const canBuy=Number(entry.price)<=Number(player.cash)&&player.businesses.length<(player.enterprise?.companyCap||40);
    return '<article class="pl-advanced-market"><div><strong>'+esc(type?.name||'Company')+
     ' · Lv '+esc(entry.level)+'</strong><small>Seller '+esc(entry.displayName||'Tycoon')+
     ' · '+esc(entry.sites||1)+' location(s)</small></div><div><strong>'+fmt(entry.price)+'</strong>'+
     '<button type="button" class="pl-advanced-action" data-buy-listing="'+esc(entry.sellerUid)+
     '" data-listing-index="'+esc(entry.index)+'" data-listing-price="'+esc(entry.price)+
     '" '+(canBuy?'':'disabled')+'><strong>Acquire</strong></button></div></article>';
   }).join('');
   root.querySelectorAll('[data-buy-listing]').forEach(button=>button.onclick=async()=>{
    if(pending)return;pending=true;button.disabled=true;
    const status=section.querySelector('#plAdvancedStatus');
    try{
     await window.ProfitLandsOnline.buyListedCompany(button.dataset.buyListing,
      Number(button.dataset.listingIndex),Number(button.dataset.listingPrice));
     if(status)status.textContent='Company transferred successfully by the world server.';
     await window.ProfitLandsWorld?.refresh?.();
    }catch(error){
     if(status)status.textContent='Acquisition declined: '+String(error?.message||'Try again').slice(0,140);
     button.disabled=false;
    }finally{pending=false}
   });
  }catch(e){if(root.isConnected)root.textContent='Cannot load company listings: '+String(e?.message||'Try again')}
 }
 function render(player,host){
  if(!host||!player?.enterprise)return;
  chosenCompany=Math.min(Math.max(0,chosenCompany),Math.max(0,(player.businesses?.length||1)-1));
  const s=player.enterprise;
  const section=document.createElement('section');
  section.id='plAdvancedWorld';
  section.className='pl-advanced-world';
  const tabHtml=Object.entries(labels).map(([id,label])=>
   '<button type="button" role="tab" data-advanced-tab="'+id+'" aria-selected="'+(tab===id)+'">'+esc(label)+'</button>').join('');
  section.innerHTML='<header><span class="eyebrow">EXPANDED ONLINE ECONOMY</span><h3>Grow beyond your first shop</h3>'+
   '<p>Server-owned company management, logistics, markets, finance, and research.</p></header>'+
   '<div role="tablist" aria-label="Online economy systems" class="pl-advanced-tabs">'+tabHtml+'</div>'+
   '<div class="pl-advanced-body" role="tabpanel">'+(sections[tab]?.(player,s)||'')+'</div>'+
   '<p id="plAdvancedStatus" class="pl-advanced-status" role="status" aria-live="polite"></p>';
  host.appendChild(section);
  if(tab==='markets')void loadCompanyListings(player,section);
  section.querySelectorAll('[data-advanced-tab]').forEach(button=>{
   button.onclick=()=>{tab=button.dataset.advancedTab;replace(player,host)};
  });
  section.querySelector('#plAdvancedCompany')?.addEventListener('change',event=>{
   chosenCompany=Number(event.target.value)||0;chosenSite=0;replace(player,host);
  });
  section.querySelector('#plAdvancedSite')?.addEventListener('change',event=>{
   chosenSite=Number(event.target.value)||0;replace(player,host);
  });
  section.querySelector('#plCountrySelector')?.addEventListener('change',event=>{
   const choice=section.querySelector('[data-enterprise-op="setCountry"]');
   if(choice)choice.dataset.paramCountry=event.target.value;
  });
  section.querySelectorAll('[data-enterprise-op]').forEach(button=>{
   button.onclick=()=>{
    const params={};
    for(const [key,value] of Object.entries(button.dataset)){
     if(!key.startsWith('param'))continue;
     const attr=key.slice(5);const name=attr[0].toLowerCase()+attr.slice(1);
     params[name]=value==='true'?true:value==='false'?false:/^(0|[1-9]\d*)$/.test(value)?Number(value):value;
    }
    void transact(button.dataset.enterpriseOp,params,button);
   };
  });
 }
 function replace(player,host){
  const old=host?.querySelector?.('#plAdvancedWorld');
  if(old)old.remove();
  render(player,host);
 }
 window.ProfitLandsWorldExtended={render:replace};
})();
