/* ProfitLands starting-country economy.
   Tax percentages are simplified game inputs based on broadly representative 2026
   corporate headline rates. Rent, wage, demand, inflation and industry modifiers
   are gameplay balance values, not real-world financial advice or forecasts. */
(function(){
'use strict';
const COUNTRIES=Object.freeze([
  {id:'us',name:'United States',flag:'US',taxRate:.21,rent:1.00,wage:1.00,demand:1.03,revenue:1.00,loanRate:.082,inflation:1.00,marketVol:.98,
   note:'Large consumer market with balanced costs and strong technology demand.',industry:{software:1.08,dealership:1.05,restaurant:1.02}},
  {id:'ca',name:'Canada',flag:'CA',taxRate:.265,rent:.95,wage:1.02,demand:.99,revenue:.98,loanRate:.078,inflation:.98,marketVol:.92,
   note:'Stable market with moderate costs and strong logistics and technology sectors.',industry:{software:1.05,logistics:1.07,hotel:1.02}},
  {id:'gb',name:'United Kingdom',flag:'UK',taxRate:.25,rent:1.08,wage:1.05,demand:1.02,revenue:1.02,loanRate:.080,inflation:1.02,marketVol:1.00,
   note:'Higher operating costs, but strong service, tourism and technology demand.',industry:{software:1.06,hotel:1.08,restaurant:1.03}},
  {id:'de',name:'Germany',flag:'DE',taxRate:.299,rent:.98,wage:1.10,demand:1.04,revenue:1.01,loanRate:.072,inflation:.96,marketVol:.88,
   note:'Expensive labor is offset by strong industrial and logistics productivity.',industry:{factory:1.12,logistics:1.10,dealership:1.07}},
  {id:'jp',name:'Japan',flag:'JP',taxRate:.306,rent:1.12,wage:1.06,demand:1.03,revenue:1.01,loanRate:.055,inflation:.92,marketVol:.90,
   note:'High urban costs, lower borrowing pressure, and strong consumer technology markets.',industry:{gamestore:1.10,dealership:1.08,software:1.04}},
  {id:'cn',name:'China',flag:'CN',taxRate:.25,rent:.78,wage:.72,demand:1.08,revenue:.78,loanRate:.070,inflation:1.03,marketVol:1.05,
   note:'Lower operating costs and very strong demand, especially for manufacturing and logistics.',industry:{factory:1.13,logistics:1.12,software:1.04}},
  {id:'au',name:'Australia',flag:'AU',taxRate:.30,rent:1.05,wage:1.12,demand:.99,revenue:1.05,loanRate:.085,inflation:1.04,marketVol:.96,
   note:'High wages with a stable consumer market and strong travel and logistics activity.',industry:{hotel:1.10,logistics:1.06,restaurant:1.03}},
  {id:'sg',name:'Singapore',flag:'SG',taxRate:.17,rent:1.35,wage:1.10,demand:1.08,revenue:1.15,loanRate:.060,inflation:.97,marketVol:.92,
   note:'Low corporate tax and strong demand, balanced by very high property and staffing costs.',industry:{software:1.12,logistics:1.12,hotel:1.04}},
  {id:'br',name:'Brazil',flag:'BR',taxRate:.34,rent:.70,wage:.60,demand:1.04,revenue:.64,loanRate:.115,inflation:1.18,marketVol:1.15,
   note:'Lower operating costs and healthy demand, but higher financing and inflation pressure.',industry:{restaurant:1.08,hotel:1.07,logistics:1.03}},
  {id:'in',name:'India',flag:'IN',taxRate:.25,rent:.58,wage:.48,demand:1.08,revenue:.52,loanRate:.095,inflation:1.10,marketVol:1.10,
   note:'Low operating costs and fast demand growth, with somewhat higher financing and market volatility.',industry:{software:1.12,logistics:1.08,restaurant:1.05}}
]);
const DEFAULT_DISTRICT=Object.freeze({
  coffee:'university',
  restaurant:'downtown',
  gamestore:'tech',
  hotel:'tourist',
  dealership:'suburbs',
  factory:'industrial',
  software:'tech',
  logistics:'industrial'
});
const byId=id=>COUNTRIES.find(x=>x.id===id)||COUNTRIES[0];
const current=()=>byId(window.state?.country||'us');
const industry=type=>current().industry?.[type]||1;
const costIndex=profile=>{
  const p=profile||current();
  return p.rent*.55+p.wage*.45;
};
const pct=v=>(v*100).toFixed(v*100%1?1:0)+'%';
function ensure(){
  if(!window.state)return null;
  if(!COUNTRIES.some(x=>x.id===state.country))state.country='us';
  if(!state.fiscal||typeof state.fiscal!=='object'||Array.isArray(state.fiscal)){
    state.fiscal={year:1,nextTaxDay:366,taxableProfit:0,lastBill:0,totalTaxPaid:0};
  }
  const f=state.fiscal;
  if(!Number.isFinite(Number(f.year))||f.year<1)f.year=1;
  if(!Number.isFinite(Number(f.nextTaxDay))||f.nextTaxDay<366)f.nextTaxDay=f.year*365+1;
  if(!Number.isFinite(Number(f.taxableProfit)))f.taxableProfit=0;
  if(!Number.isFinite(Number(f.lastBill)))f.lastBill=0;
  if(!Number.isFinite(Number(f.totalTaxPaid)))f.totalTaxPaid=0;
  return f;
}
function resetFiscal(){
  if(!window.state)return;
  state.fiscal={year:1,nextTaxDay:366,taxableProfit:0,lastBill:0,totalTaxPaid:0};
}
function recordOperatingProfit(amount){
  const f=ensure(),n=Number(amount);
  if(!f||!Number.isFinite(n))return;
  // Losses offset operating profit inside the same in-game tax year.
  f.taxableProfit+=n;
}
function estimateTax(){
  const f=ensure();
  return Math.max(0,Number(f?.taxableProfit)||0)*current().taxRate;
}
function deduct(amount){
  const n=Math.max(0,Number(amount)||0);
  if(!n)return;
  if(window.ProfitLandsMoney)window.ProfitLandsMoney.gain(-n);
  else state.cash-=n;
}
function settleAnnualTax(day=state?.day||1){
  const f=ensure();
  if(!f)return 0;
  let total=0;
  while(Number(day)>=f.nextTaxDay){
    const profile=current();
    const taxable=Math.max(0,f.taxableProfit);
    const bill=Math.round(taxable*profile.taxRate*100)/100;
    deduct(bill);
    total+=bill;
    f.lastBill=bill;
    f.totalTaxPaid+=bill;
    state.news=Array.isArray(state.news)?state.news:[];
    state.news.push(
      bill>0
        ?'TAX YEAR '+f.year+' — '+profile.name+' corporate tax of '+pct(profile.taxRate)+' was assessed on positive operating profit. Tax paid: '+money(bill)+'.'
        :'TAX YEAR '+f.year+' — No corporate income tax was due because annual taxable operating profit was not positive.'
    );
    f.year++;
    f.nextTaxDay+=365;
    f.taxableProfit=0;
  }
  return total;
}
function startingDistrict(type){return DEFAULT_DISTRICT[type]||'downtown'}
function setCountry(id){
  if(!window.state||window.state.started)return false;
  const profile=byId(id);
  state.country=profile.id;
  renderSetup();
  renderPanel();
  return true;
}
function renderSetup(){
  const select=document.getElementById('startCountry');
  if(!select)return;
  if(!select.options.length){
    for(const c of COUNTRIES){
      const o=document.createElement('option');
      o.value=c.id;o.textContent=c.name;select.appendChild(o);
    }
  }
  select.value=current().id;
  const c=current();
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set('countryTax',pct(c.taxRate));
  set('countryDemand',Math.round(c.demand*100)+'%');
  set('countryCosts',Math.round(costIndex(c)*100)+'%');
  set('countryLoan',(c.loanRate*100).toFixed(1)+'%');
  set('countrySummary',c.note);
}
function renderPanel(){
  const c=current(),f=ensure();
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set('economyCountry',c.name);
  set('economyCountryTax',pct(c.taxRate));
  set('economyCountryCosts',Math.round(costIndex(c)*100)+'%');
  set('economyFiscalYear','Year '+(f?.year||1));
  set('economyTaxableProfit',money(Math.max(0,Number(f?.taxableProfit)||0)));
  set('economyTaxEstimate',money(estimateTax()));
  set('economyTaxDueDay','Day '+(f?.nextTaxDay||366));
}
function init(){
  if(typeof state==='undefined')return;
  ensure();
  renderSetup();
  renderPanel();
  const select=document.getElementById('startCountry');
  select?.addEventListener('change',()=>setCountry(select.value));
}
window.ProfitLandsCountry={
  COUNTRIES,current,byId,industry,costIndex,startingDistrict,setCountry,
  ensure,resetFiscal,recordOperatingProfit,estimateTax,settleAnnualTax,
  renderSetup,renderPanel,pct
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();