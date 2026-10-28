/* ProfitLands Empire Systems Preview v1.
 * Opt-in store simulation, persisted inside the current empire save.
 * The shared market is LOCAL SIMULATION; no real multiplayer or remote trades.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id), money=window.ProfitLandsMoney;
const TYPES={
 coffee:['Coffee beans','Milk','Pastries'],restaurant:['Ingredients','Drinks','Meals'],
 gamestore:['Game copies','Consoles','Accessories'],hotel:['Room supplies','Amenities','Meals'],
 dealership:['Vehicles','Parts','Accessories'],factory:['Materials','Components','Products'],
 software:['Subscriptions','Licenses','Cloud units'],logistics:['Parcels','Fuel','Shipping slots']
};
const REGIONS=[
 {id:'local',label:'Local districts',price:0,demand:1,rent:1,tax:0},
 {id:'la',label:'Los Angeles',price:4500,demand:1.12,rent:1.25,tax:.03},
 {id:'ny',label:'New York',price:28000,demand:1.36,rent:1.75,tax:.07},
 {id:'london',label:'London',price:125000,demand:1.45,rent:1.9,tax:.09},
 {id:'tokyo',label:'Tokyo',price:450000,demand:1.6,rent:2,tax:.10},
 {id:'global',label:'International network',price:1800000,demand:1.7,rent:2.3,tax:.13}
];
const RIVALS=[
 {id:'r1',name:'Metro Retail Group',type:'restaurant',value:3400,share:.12},
 {id:'r2',name:'Pacific Logistics',type:'logistics',value:12500,share:.17},
 {id:'r3',name:'Atlas Technologies',type:'software',value:45000,share:.22},
 {id:'r4',name:'Summit Hospitality',type:'hotel',value:89000,share:.16}
];
const RESEARCH=[
 {id:'inventory',label:'Inventory forecasting',cost:1300,info:'Reduces supplier stock costs 15%.'},
 {id:'routes',label:'Logistics networks',cost:2400,info:'Reduces warehouse delivery costs 40%.'},
 {id:'customers',label:'Customer analytics',cost:4300,info:'Raises store demand 8%.'},
 {id:'automation',label:'Corporate automation',cost:6500,info:'Allows managed branches to auto-adjust prices.'}
];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const fmt=v=>window.ProfitLandsMoney?.format(v)||window.money?.(v)||'$'+Number(v).toLocaleString('en-US');
const clean=t=>String(t??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const amount=n=>Number.isFinite(Number(n))?Number(n):0;
let currentTab='store',currentSite=null,lastTick=0,lastSave=0;
function game(){return window.state}
function companyType(b){return(window.BUSINESS_TYPES||[]).find(x=>x.id===b.type)}
function ensure(){
 const state=game();if(!state)return null;
 let p=state.empireLab;
 if(!p||p.version!==1){
   p={version:1,warehouse:0,warehouseStock:0,route:null,regions:['local'],hq:0,research:[],rivals:RIVALS.map(x=>({...x})),publicCompanies:[],trades:[],reputation:0,lastTick:0,nextId:1,log:[]};
   state.empireLab=p;
 }
 p.regions=Array.isArray(p.regions)?p.regions:['local'];
 p.research=Array.isArray(p.research)?p.research:[];
 p.rivals=Array.isArray(p.rivals)?p.rivals:RIVALS.map(x=>({...x}));
 p.trades=Array.isArray(p.trades)?p.trades:[];
 p.publicCompanies=Array.isArray(p.publicCompanies)?p.publicCompanies:[];
 p.log=Array.isArray(p.log)?p.log:[];
 if(!Number.isFinite(p.nextId))p.nextId=1;
 window.ProfitLandsLocationOps?.normalizeAll?.();
 for(const b of state.businesses||[])for(const l of b.locations||[]){
   if(!l.labId)l.labId='site_'+p.nextId++;
   if(!l.lab||typeof l.lab!=='object')l.lab={enabled:false,stock:24,price:1,roles:{sales:0,production:0,logistics:0},sold:0,autoRestock:false,autoPrice:false,region:'local'};
   const a=l.lab;
   if(!a.roles)a.roles={sales:0,production:0,logistics:0};
   a.stock=clamp(amount(a.stock),0,1000000);
   a.price=clamp(amount(a.price)||1,.65,1.75);
   if(!p.regions.includes(a.region))a.region='local';
 }
 return p;
}
function allSites(){
 const s=game();if(!s)return[];
 const a=[];
 for(let i=0;i<s.businesses.length;i++)for(let j=0;j<(s.businesses[i].locations||[]).length;j++){
   const b=s.businesses[i],l=b.locations[j];a.push({b,l,bi:i,li:j,id:l.labId});
 }
 return a;
}
function chosen(){const list=allSites();return list.find(x=>x.id===currentSite)||list[0]||null}
function selectSite(id){currentSite=typeof id==='object'?id.labId:id;currentTab='store';render();$('empireLab')?.scrollIntoView?.({behavior:'smooth',block:'start'})}
function have(n){return money?money.canAfford(n):game().cash>=n}
function charge(cost,usesAction=false){
 const s=game();
 if(!(cost>=0&&Number.isFinite(cost))||!have(cost)||(usesAction&&s.actions<1))return false;
 if(money){if(!money.spend(cost))return false}else s.cash-=cost;
 if(usesAction)s.actions--;
 return true;
}
function earn(n){if(money)money.gain(n);else game().cash+=n}
function log(s){
 const p=ensure();p.log.push(String(s));if(p.log.length>18)p.log.shift();
 game().news?.push('EMPIRE LAB — '+String(s));
 if(game().news?.length>150)game().news.splice(0,game().news.length-150);
}
function commit(note){
 if(note)log(note);
 window.save?.();window.render?.();render();
}
function products(b){return TYPES[b?.type]||['Inventory','Supplies','Orders']}
function region(id){return REGIONS.find(r=>r.id===id)||REGIONS[0]}
function forecast(site){
 const lab=site?.l.lab;if(!lab?.enabled)return{factor:1,bonus:0,region:REGIONS[0]};
 const r=region(lab.region),price=lab.price;
 const demand=clamp(1-(price-1)*1.15,.35,1.3);
 const staffed=Math.max(0,amount(lab.roles.sales));
 const productive=Math.max(0,amount(lab.roles.production));
 const rival=ensure().rivals.filter(x=>x.type===site.b.type).reduce((n,x)=>n+x.share*.15,0);
 const customerBoost=ensure().research.includes('customers')?.08:0;
 const stocked=lab.stock>=1?1:.25;
 const factor=clamp((price*demand)*(1+Math.min(.15,staffed*.025))*(1+Math.min(.2,productive*.025))*(1+customerBoost)*(1+r.demand*.06)*stocked*(1-rival),.05,2.5);
 return{factor,bonus:r.tax,region:r};
}
function delta(b,l,revenue,runningCost){
 if(!l.lab?.enabled)return 0;
 const s={b,l};const f=forecast(s),equity=ensure().publicCompanies.find(x=>x.companyId===b.labCompanyId);
 const afterEquity=equity?.8:1;
 return revenue*(f.factor*afterEquity-1)-runningCost*f.bonus;
}
function act(action,opt={}){
 const p=ensure(),s=game(),site=chosen(),lab=site?.l.lab,qty=clamp(Math.trunc(amount(opt.qty)||1),1,100);
 let message='',ok=false;
 const requireSite=()=>site&&lab;
 if(action==='enable'){
   if(!requireSite())return false;
   lab.enabled=true;ok=true;message='Store operations activated for '+site.l.name+'.';
 }else if(action==='buyStock'){
   if(!requireSite())return false;
   const cost=Math.round(qty*8*(p.research.includes('inventory')?.85:1));
   if(!charge(cost))return false;
   lab.stock+=qty;ok=true;message=site.l.name+': purchased '+qty+' product units for '+fmt(cost)+'.';
 }else if(action==='price'){
   if(!requireSite())return false;
   lab.price=clamp(Math.round((lab.price+amount(opt.delta)) *100)/100,.65,1.75);
   ok=true;message=site.l.name+': price multiplier changed to '+lab.price.toFixed(2)+'×.';
 }else if(action==='role'){
   if(!requireSite())return false;
   const role=opt.role;if(!['sales','production','logistics'].includes(role))return false;
   const workers=Math.max(0,Math.floor(amount(site.l.workers)));
   for(const k of Object.keys(lab.roles))lab.roles[k]=Math.max(0,Math.floor(amount(lab.roles[k])));
   let assigned=Object.values(lab.roles).reduce((a,b)=>a+b,0);
   const change=opt.delta>0?1:-1;
   if(change>0&&assigned>=workers||change<0&&lab.roles[role]<1)return false;
   lab.roles[role]+=change;ok=true;message=site.l.name+': '+role+' staffing updated.';
 }else if(action==='buyWarehouse'){
   const cost=Math.round(1400*2**p.warehouse);if(!charge(cost,true))return false;
   p.warehouse++;ok=true;message='Warehouse level '+p.warehouse+' built.';
 }else if(action==='warehouseStock'){
   if(!p.warehouse)return false;
   const cost=Math.round(qty*7*(p.research.includes('inventory')?.85:1));if(!charge(cost))return false;
   p.warehouseStock=clamp(p.warehouseStock+qty,0,p.warehouse*1200);ok=true;message='Warehouse received '+qty+' units.';
 }else if(action==='route'){
   if(!requireSite()||!p.warehouse)return false;
   p.route={siteId:site.id,auto:false};ok=true;message='Supply route linked to '+site.l.name+'.';
 }else if(action==='dispatch'){
   const target=allSites().find(x=>x.id===p.route?.siteId);if(!target||p.warehouseStock<qty)return false;
   const fee=Math.max(1,Math.round((9+qty*.5)*(p.research.includes('routes')?.6:1)));
   if(!charge(fee))return false;
   p.warehouseStock-=qty;target.l.lab.stock+=qty;ok=true;
   message=qty+' units shipped to '+target.l.name+' for '+fmt(fee)+'.';
 }else if(action==='autoRoute'){
   if(!p.route)return false;
   p.route.auto=!p.route.auto;ok=true;message='Automated warehouse deliveries '+(p.route.auto?'enabled':'paused')+'.';
 }else if(action==='autoRestock'){
   if(!requireSite()||!site.l.manager)return false;
   lab.autoRestock=!lab.autoRestock;ok=true;message=site.l.name+' automatic restocking '+(lab.autoRestock?'enabled':'paused')+'.';
 }else if(action==='autoPrice'){
   if(!requireSite()||!site.l.manager||!p.research.includes('automation'))return false;
   lab.autoPrice=!lab.autoPrice;ok=true;message=site.l.name+' automatic pricing '+(lab.autoPrice?'enabled':'paused')+'.';
 }else if(action==='unlockRegion'){
   const r=REGIONS.find(x=>x.id===opt.region);
   if(!r||p.regions.includes(r.id)||!charge(r.price,true))return false;
   p.regions.push(r.id);ok=true;message=r.label+' expansion market unlocked.';
 }else if(action==='openRegion'){
   if(!requireSite()||!p.regions.includes(opt.region))return false;
   const r=region(opt.region),base=companyType(site.b)?.cost||500;
   const cost=Math.round(base*3*r.demand*(1+(site.b.locations.length-1)*.5));
   if(!charge(cost,true))return false;
   const l={id:r.id+'_'+Date.now(),name:r.label,icon:'🌍',rent:r.rent,demand:r.demand,
     basePopularity:55,level:1,marketing:0,efficiency:0,workers:0,manager:false};
   site.b.locations.push(l);site.b.chainCount=site.b.locations.length-1;
   ensure();l.lab.region=r.id;ok=true;message='New '+r.label+' branch opened for '+fmt(cost)+'.';
 }else if(action==='buyHQ'){
   const cost=Math.round(6000*3**p.hq);if(!charge(cost,true))return false;
   p.hq++;ok=true;message='Corporate HQ upgraded to level '+p.hq+'.';
 }else if(action==='research'){
   const x=RESEARCH.find(y=>y.id===opt.research);
   if(!x||!p.hq||p.research.includes(x.id)||!charge(x.cost,true))return false;
   p.research.push(x.id);ok=true;message=x.label+' research completed.';
 }else if(action==='ipo'){
   if(!requireSite()||!p.hq||!site.b||!have(0))return false;
   if(!site.b.labCompanyId)site.b.labCompanyId='co_'+p.nextId++;
   if(p.publicCompanies.some(x=>x.companyId===site.b.labCompanyId))return false;
   const value=window.ProfitLandsEconomy?.businessValue?.(site.b)||companyType(site.b)?.cost||500;
   const proceeds=Math.round(value*.2);earn(proceeds);
   p.publicCompanies.push({companyId:site.b.labCompanyId,companyName:site.b.name,equitySold:.2});
   ok=true;message=site.b.name+' IPO raised '+fmt(proceeds)+'; investors receive 20% of future site operating revenue.';
 }else if(action==='acquire'){
   const rival=p.rivals.find(x=>x.id===opt.rival);if(!rival||!charge(rival.value,true))return false;
   const btype=companyType({type:rival.type});if(!btype)return false;
   const count=s.businesses.filter(b=>b.type===rival.type).length+1;
   const acquired={type:rival.type,name:rival.name+' (Acquired)',level:1,marketing:0,efficiency:0,
     popularity:65,workers:0,manager:false,chainCount:0,originalCost:rival.value,financialBalance:0,
     locations:[{id:'downtown',name:'Acquired Headquarters',icon:'🏢',rent:1.1,demand:1.15,basePopularity:65}]};
   s.businesses.push(acquired);p.rivals=p.rivals.filter(x=>x.id!==rival.id);
   ok=true;message=rival.name+' acquired for '+fmt(rival.value)+'.';
 }else if(action==='marketSell'){
   if(!requireSite()||lab.stock<qty)return false;
   lab.stock-=qty;
   const index=1+(p.reputation||0)*.01;const proceeds=Math.round(qty*13*index);
   earn(proceeds);p.reputation=Math.min(1000,p.reputation+1);
   p.trades.push({type:'SELL',site:site.l.name,qty,proceeds,time:Date.now(),simulated:true});
   p.trades=p.trades.slice(-15);ok=true;
   message='SIMULATED MARKET: sold '+qty+' units for '+fmt(proceeds)+'. No real players involved.';
 }
 if(ok)commit(message);
 return ok;
}
function tick(now=Date.now()){
 const p=ensure(),s=game();if(!p||!s.started||document.visibilityState==='hidden'||!$('gameScreen')?.classList.contains('active')){lastTick=now;return}
 if(!lastTick){lastTick=now;return}
 const elapsed=clamp((now-lastTick)/1000,0,5);lastTick=now;
 if(!elapsed)return;
 for(const site of allSites()){
   const l=site.l,a=l.lab;if(!a?.enabled)continue;
   const roles=a.roles||{},units=elapsed*(.09+Math.min(1,(roles.sales||0)*.04));
   if(a.stock>0){const sold=Math.min(a.stock,units);a.stock=Math.max(0,a.stock-sold);a.sold+=sold;}
   if(a.autoPrice&&l.manager&&p.research.includes('automation')){
     a.price=clamp(Math.round((a.price+(a.stock<8?-.002:.002))*1000)/1000,.8,1.25);
   }
   if(a.autoRestock&&l.manager&&a.stock<8){
     const n=20,cost=Math.round(n*8*(p.research.includes('inventory')?.85:1));
     if(have(cost)&&charge(cost)){a.stock+=n;p.log.push('Auto-replenished '+l.name+' for '+fmt(cost));}
   }
 }
 if(p.route?.auto&&p.warehouseStock>=10){
   const target=allSites().find(x=>x.id===p.route.siteId);
   if(target&&target.l.lab.stock<15){
     const fee=Math.round(15*(p.research.includes('routes')?.6:1));
     if(charge(fee)){p.warehouseStock-=10;target.l.lab.stock+=10;p.log.push('Auto-route supplied '+target.l.name)}
   }
 }
 p.lastTick=now;
 if(now-lastSave>15000){lastSave=now;window.save?.()}
 renderStats();
}
function optionsSite(){
 const list=allSites();return list.length?list.map(x=>'<option value="'+clean(x.id)+'" '+(chosen()?.id===x.id?'selected':'')+'>'+clean(x.b.name)+' · '+clean(x.l.name)+'</option>').join(''):'<option value="">No businesses yet</option>';
}
function button(name,label,disabled=false,opt=''){
 return '<button type="button" data-lab-action="'+clean(name)+'" '+opt+' '+(disabled?'disabled':'')+'>'+label+'</button>';
}
function render(){
 const box=$('empireLabContent');if(!box)return;
 const p=ensure(),s=game(),site=chosen(),lab=site?.l.lab,has=!!site;
 for(const tab of document.querySelectorAll('[data-lab-tab]')){tab.classList.toggle('active',tab.dataset.labTab===currentTab);tab.setAttribute('aria-selected',String(tab.dataset.labTab===currentTab))}
 let content='';
 if(currentTab==='store'){
   const b=site?.b,l=site?.l,roles=lab?.roles||{sales:0,production:0,logistics:0},assigned=Object.values(roles).reduce((a,v)=>a+amount(v),0),workers=amount(l?.workers);
   content='<h3>Store Operations</h3><p>Manage local products, staffing roles, prices, and inventory. Enable a location to activate these optional operating mechanics.</p>'+
     '<label>Business location <select id="labSite">'+optionsSite()+'</select></label>';
   if(!has)content+='<p>Purchase a business first to try store operations.</p>';
   else content+='<div class="lab-metrics"><span>Business <b>'+clean(b.name)+'</b></span><span>Stock <b>'+lab.stock.toFixed(1)+' units</b></span><span>Price <b>'+lab.price.toFixed(2)+'×</b></span><span>Staff assigned <b>'+assigned+'/'+workers+'</b></span></div>'+
     '<p>Products: '+products(b).map(clean).join(' · ')+'</p>'+
     (!lab.enabled?button('enable','Activate store simulation (free)'):'<p class="lab-status">Store simulation active · Inventory shortages will reduce local revenue.</p>')+
     '<div class="lab-actions">'+button('buyStock','Buy 20 units · '+fmt(p.research.includes('inventory')?136:160),false,'data-qty="20"')+
     button('priceDown','Lower prices 5%')+button('priceUp','Raise prices 5%')+'</div>'+
     '<h4>Employee roles</h4><p>Assign your existing employees. Hire more through the location-management window. Assignments are free.</p>'+
     '<div class="lab-role-grid">'+['sales','production','logistics'].map(role=>'<div><b>'+role+'</b><span>'+amount(roles[role])+' employees</span>'+
       button('roleDown','−',amount(roles[role])<1,'data-role="'+role+'"')+
       button('roleUp','+',assigned>=workers,'data-role="'+role+'"')+'</div>').join('')+'</div>'+
     '<h4>Managed automation</h4><div class="lab-actions">'+button('autoRestock',lab.autoRestock?'Pause automatic replenishment':'Enable automatic replenishment',!l.manager)+
     button('autoPrice',lab.autoPrice?'Pause automatic pricing':'Enable automatic pricing',!l.manager||!p.research.includes('automation'))+'</div>';
 }else if(currentTab==='logistics'){
   const route=allSites().find(x=>x.id===p.route?.siteId);
   content='<h3>Warehouses & Supply Lines</h3><p>Buy stock centrally and ship it to your locations. Delivery fees consume cash; researched logistics lowers the cost.</p>'+
     '<div class="lab-metrics"><span>Warehouse level <b>'+p.warehouse+'</b></span><span>Warehouse stock <b>'+Math.floor(p.warehouseStock)+'</b></span><span>Route <b>'+clean(route?.l.name||'Unassigned')+'</b></span></div>'+
     '<div class="lab-actions">'+button('buyWarehouse','Build / upgrade warehouse · '+fmt(1400*2**p.warehouse),!have(1400*2**p.warehouse))+
     button('warehouseStock','Buy 50 warehouse units · '+fmt(50*7*(p.research.includes('inventory')?.85:1)),!p.warehouse,'data-qty="50"')+'</div>'+
     '<label>Delivery destination <select id="labSite">'+optionsSite()+'</select></label>'+
     '<div class="lab-actions">'+button('route','Link selected location to warehouse',!p.warehouse||!has)+
     button('dispatch','Send 10 units · pay delivery fee',!p.route||p.warehouseStock<10,'data-qty="10"')+
     button('autoRoute',p.route?.auto?'Pause supply deliveries':'Auto-deliver when stock is low',!p.route)+'</div>';
 }else if(currentTab==='world'){
   content='<h3>Cities, Countries & AI Rivals</h3><p>Expand into new markets with their own rent, demand, and taxes. Rival businesses compete for customers; you can acquire them.</p>'+
     '<h4>Regional markets</h4><div class="lab-cards">'+REGIONS.map(r=>'<div class="lab-card"><strong>'+clean(r.label)+'</strong><span>Demand '+r.demand.toFixed(2)+'× · Rent '+r.rent.toFixed(2)+'× · Tax '+Math.round(r.tax*100)+'%</span>'+
       (p.regions.includes(r.id)?button('openRegion','Open branch in this market',!has,'data-region="'+r.id+'"'):button('unlockRegion','Unlock · '+fmt(r.price),!have(r.price),'data-region="'+r.id+'"'))+'</div>').join('')+'</div>'+
     '<h4>Rival companies (simulated AI)</h4><div class="lab-cards">'+p.rivals.map(r=>'<div class="lab-card"><strong>'+clean(r.name)+'</strong><span>Sector '+clean(r.type)+' · Market pressure '+Math.round(r.share*100)+'%</span>'+button('acquire','Acquire · '+fmt(r.value),!have(r.value),'data-rival="'+r.id+'"')+'</div>').join('')+'</div>';
 }else if(currentTab==='hq'){
   content='<h3>Corporate HQ, Research & IPOs</h3><p>Build headquarters to unlock research and raise investment capital. An IPO exchanges 20% of future operating revenue for cash.</p>'+
     '<div class="lab-metrics"><span>HQ level <b>'+p.hq+'</b></span><span>Completed research <b>'+p.research.length+'/'+RESEARCH.length+'</b></span><span>Public companies <b>'+p.publicCompanies.length+'</b></span></div>'+
     button('buyHQ','Build / upgrade HQ · '+fmt(6000*3**p.hq),!have(6000*3**p.hq))+
     '<h4>Corporate research</h4><div class="lab-cards">'+RESEARCH.map(r=>'<div class="lab-card"><strong>'+clean(r.label)+'</strong><span>'+clean(r.info)+'</span>'+button('research',p.research.includes(r.id)?'Researched':'Research · '+fmt(r.cost),!p.hq||p.research.includes(r.id)||!have(r.cost),'data-research="'+r.id+'"')+'</div>').join('')+'</div>'+
     '<label>Company for an IPO <select id="labSite">'+optionsSite()+'</select></label>'+
     button('ipo','Launch this company IPO (sell 20% of future revenue)',!p.hq||!has);
 }else if(currentTab==='market'){
   content='<h3>Shared Market Concept Demo</h3><p><strong>Offline simulation only.</strong> No other players are connected, no real-world payments occur, and these orders only change your local empire. This previews what a server-backed multiplayer market might feel like.</p>'+
     '<div class="lab-metrics"><span>Reputation <b>'+p.reputation+'</b></span><span>Simulated transactions <b>'+p.trades.length+'</b></span><span>Demo participants <b>4 AI firms</b></span></div>'+
     '<label>Sell stock from <select id="labSite">'+optionsSite()+'</select></label>'+
     button('marketSell','List & simulate a sale of 5 product units',!has||!(lab?.stock>=5),'data-qty="5"')+
     '<h4>Recent simulated trades</h4><div class="lab-events">'+(p.trades.length?p.trades.slice(-8).reverse().map(x=>'<p>'+clean(x.site)+' · '+x.qty+' units · '+fmt(x.proceeds)+' · SIMULATED</p>').join(''):'<p>No simulated transactions yet.</p>')+'</div>';
 }
 box.innerHTML=content;
 box.querySelector('#labSite')?.addEventListener('change',e=>{currentSite=e.target.value;render()});
 renderStats();
}
function renderStats(){
 const p=game()?.empireLab;if(!p)return;
 const t=$('empireLabStats');if(t)t.textContent='HQ '+p.hq+' · '+p.regions.length+' regions · '+p.rivals.length+' rival companies · '+p.trades.length+' demo trades';
}
function bind(){
 const root=$('empireLab');if(!root)return;
 root.addEventListener('click',e=>{
   const tab=e.target.closest('[data-lab-tab]');
   if(tab){currentTab=tab.dataset.labTab;render();return}
   const el=e.target.closest('[data-lab-action]');if(!el)return;
   const name=el.dataset.labAction;
   const map={priceDown:['price',{delta:-.05}],priceUp:['price',{delta:.05}],
     roleDown:['role',{role:el.dataset.role,delta:-1}],roleUp:['role',{role:el.dataset.role,delta:1}]};
   const [action,opt]=map[name]||[name,{}];
   const ok=act(action,{...opt,qty:Number(el.dataset.qty||1),region:el.dataset.region,rival:el.dataset.rival,research:el.dataset.research});
   if(!ok){window.toast?.('This action requires more cash, actions, inventory, staff, or an unlocked feature.');render()}
 });
 ensure();render();
 // Only run during visible active play; no offline passive profits.
 window.setInterval(()=>tick(Date.now()),5000);
 window.addEventListener('beforeunload',()=>window.save?.());
}
window.ProfitLandsEmpire={ensure,allSites,selectSite,forecast,delta,act,tick,render,products,region,REGIONS,RESEARCH};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();