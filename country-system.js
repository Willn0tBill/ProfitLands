/* ProfitLands country economy model.
   Real inputs:
   - 2026 representative corporate-income-tax rates (PwC/OECD style statutory inputs)
   - latest observed CPI inflation (mostly 2025 World Bank/IMF IFS; US latest listed 2024)
   - 2025 GDP per capita at PPP (World Bank)
   - 2024 OECD comparative price levels where available; otherwise a World Bank
     nominal-GDP-per-capita / PPP-GDP-per-capita proxy normalized to the US.
   Derived gameplay inputs are explicitly calculated below instead of hand-tuned. */
(function(){
'use strict';

const US_PPP=90026.5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const COUNTRIES_RAW=Object.freeze([
  {id:'us',region:'North America',name:'United States',taxRate:.255,taxDetail:'21% federal + 4.5% representative state corporate tax',inflationPct:2.9,inflationYear:2024,priceLevel:1.000,gdpPpp:90026.5,industry:{software:1.06,dealership:1.04,restaurant:1.02}},
  {id:'ca',region:'North America',name:'Canada',taxRate:.265,taxDetail:'15% federal + 11.5% representative provincial corporate tax',inflationPct:2.1,inflationYear:2025,priceLevel:.836,gdpPpp:66745.8,industry:{software:1.04,logistics:1.05,hotel:1.02}},
  {id:'mx',region:'North America',name:'Mexico',taxRate:.30,taxDetail:'30% federal corporate income tax',inflationPct:3.8,inflationYear:2025,priceLevel:.540,gdpPpp:25868.5,industry:{factory:1.07,logistics:1.06,dealership:1.04}},
  {id:'br',region:'Latin America',name:'Brazil',taxRate:.34,taxDetail:'34% representative combined IRPJ + CSLL headline burden',inflationPct:5.0,inflationYear:2025,priceLevel:.457,gdpPpp:23433.3,industry:{restaurant:1.05,hotel:1.05,logistics:1.03}},
  {id:'cl',region:'Latin America',name:'Chile',taxRate:.27,taxDetail:'27% 2026 general corporate rate',inflationPct:4.2,inflationYear:2025,priceLevel:.460,gdpPpp:37774.1,industry:{hotel:1.04,logistics:1.04,software:1.03}},
  {id:'co',region:'Latin America',name:'Colombia',taxRate:.35,taxDetail:'35% general corporate income tax',inflationPct:5.1,inflationYear:2025,priceLevel:.353,gdpPpp:22640.4,industry:{restaurant:1.05,hotel:1.04,logistics:1.03}},

  {id:'gb',region:'Europe',name:'United Kingdom',taxRate:.25,taxDetail:'25% main corporation tax rate',inflationPct:3.9,inflationYear:2025,priceLevel:.844,gdpPpp:64606.5,industry:{software:1.05,hotel:1.05,restaurant:1.03}},
  {id:'de',region:'Europe',name:'Germany',taxRate:.298,taxDetail:'15.825% corporate/solidarity + ~14% representative municipal trade tax',inflationPct:2.2,inflationYear:2025,priceLevel:.756,gdpPpp:75406.7,industry:{factory:1.09,logistics:1.07,dealership:1.05}},
  {id:'fr',region:'Europe',name:'France',taxRate:.25,taxDetail:'25% standard corporate income tax',inflationPct:.9,inflationYear:2025,priceLevel:.735,gdpPpp:63975.4,industry:{hotel:1.05,restaurant:1.05,software:1.02}},
  {id:'nl',region:'Europe',name:'Netherlands',taxRate:.258,taxDetail:'25.8% top corporate income tax rate',inflationPct:3.2,inflationYear:2025,priceLevel:.789,gdpPpp:87320.1,industry:{logistics:1.08,software:1.05,hotel:1.02}},
  {id:'ie',region:'Europe',name:'Ireland',taxRate:.125,taxDetail:'12.5% trading-income corporate tax rate',inflationPct:2.2,inflationYear:2025,priceLevel:.797,gdpPpp:155089.4,industry:{software:1.10,logistics:1.04,hotel:1.02}},
  {id:'es',region:'Europe',name:'Spain',taxRate:.25,taxDetail:'25% standard corporate income tax',inflationPct:2.7,inflationYear:2025,priceLevel:.606,gdpPpp:59867.7,industry:{hotel:1.09,restaurant:1.05,logistics:1.02}},
  {id:'it',region:'Europe',name:'Italy',taxRate:.279,taxDetail:'24% IRES + 3.9% representative IRAP',inflationPct:1.5,inflationYear:2025,priceLevel:.647,gdpPpp:62802.5,industry:{restaurant:1.07,hotel:1.06,dealership:1.03}},
  {id:'pl',region:'Europe',name:'Poland',taxRate:.19,taxDetail:'19% standard corporate income tax',inflationPct:3.8,inflationYear:2025,priceLevel:.488,gdpPpp:54262.4,industry:{factory:1.06,logistics:1.06,software:1.03}},
  {id:'se',region:'Europe',name:'Sweden',taxRate:.206,taxDetail:'20.6% corporate income tax',inflationPct:.7,inflationYear:2025,priceLevel:.805,gdpPpp:72528.9,industry:{software:1.06,logistics:1.03,hotel:1.02}},
  {id:'ch',region:'Europe',name:'Switzerland',taxRate:.146,taxDetail:'14.6% representative combined rate within the roughly 11.66%–20.54% cantonal range',inflationPct:.2,inflationYear:2025,priceLevel:1.078,gdpPpp:102513.3,industry:{software:1.06,hotel:1.03,logistics:1.03}},

  {id:'cn',region:'Asia',name:'China',taxRate:.25,taxDetail:'25% standard enterprise income tax',inflationPct:.1,inflationYear:2025,priceLevel:.473,gdpPpp:29333.3,industry:{factory:1.10,logistics:1.08,software:1.03}},
  {id:'jp',region:'Asia',name:'Japan',taxRate:.306,taxDetail:'~30.6% representative combined national/local corporate burden',inflationPct:3.2,inflationYear:2025,priceLevel:.622,gdpPpp:55421.9,industry:{gamestore:1.08,dealership:1.07,software:1.03}},
  {id:'kr',region:'Asia',name:'South Korea',taxRate:.275,taxDetail:'25% top national corporate rate + representative local corporate income tax',inflationPct:2.1,inflationYear:2025,priceLevel:.591,gdpPpp:63124.9,industry:{software:1.07,gamestore:1.07,factory:1.04}},
  {id:'in',region:'Asia',name:'India',taxRate:.2517,taxDetail:'25.17% representative effective rate under the 22% concessional domestic-company regime including surcharge/cess',inflationPct:2.4,inflationYear:2025,priceLevel:.230,gdpPpp:11747.9,industry:{software:1.10,logistics:1.06,restaurant:1.03}},
  {id:'sg',region:'Asia',name:'Singapore',taxRate:.17,taxDetail:'17% headline corporate income tax before exemptions/incentives',inflationPct:.9,inflationYear:2025,priceLevel:.605,gdpPpp:163354.0,industry:{software:1.10,logistics:1.08,hotel:1.03}},
  {id:'id',region:'Asia',name:'Indonesia',taxRate:.22,taxDetail:'22% standard corporate income tax',inflationPct:1.9,inflationYear:2025,priceLevel:.287,gdpPpp:17659.8,industry:{factory:1.06,logistics:1.06,hotel:1.03}},
  {id:'vn',region:'Asia',name:'Vietnam',taxRate:.20,taxDetail:'20% standard corporate income tax',inflationPct:3.3,inflationYear:2025,priceLevel:.280,gdpPpp:18088.5,industry:{factory:1.08,logistics:1.06,software:1.03}},
  {id:'th',region:'Asia',name:'Thailand',taxRate:.20,taxDetail:'20% standard corporate income tax',inflationPct:-.1,inflationYear:2025,priceLevel:.307,gdpPpp:26250.1,industry:{hotel:1.09,restaurant:1.05,logistics:1.03}},
  {id:'my',region:'Asia',name:'Malaysia',taxRate:.24,taxDetail:'24% standard corporate income tax',inflationPct:1.4,inflationYear:2025,priceLevel:.316,gdpPpp:41497.7,industry:{factory:1.05,software:1.05,logistics:1.05}},
  {id:'ph',region:'Asia',name:'Philippines',taxRate:.25,taxDetail:'25% standard corporate income tax',inflationPct:1.7,inflationYear:2025,priceLevel:.332,gdpPpp:12577.0,industry:{restaurant:1.05,software:1.04,hotel:1.03}},

  {id:'au',region:'Oceania',name:'Australia',taxRate:.30,taxDetail:'30% standard company tax; qualifying base-rate entities may pay 25%',inflationPct:2.9,inflationYear:2025,priceLevel:.898,gdpPpp:71934.4,industry:{hotel:1.06,logistics:1.05,restaurant:1.03}},
  {id:'nz',region:'Oceania',name:'New Zealand',taxRate:.28,taxDetail:'28% company tax rate',inflationPct:2.8,inflationYear:2025,priceLevel:.883,gdpPpp:57350.4,industry:{hotel:1.05,restaurant:1.04,logistics:1.03}},

  {id:'ae',region:'Middle East',name:'United Arab Emirates',taxRate:.09,taxDetail:'9% standard federal corporate tax above the taxable-income threshold',inflationPct:1.3,inflationYear:2025,priceLevel:.634,gdpPpp:79343.8,industry:{logistics:1.09,hotel:1.07,software:1.05}},
  {id:'sa',region:'Middle East',name:'Saudi Arabia',taxRate:.20,taxDetail:'20% general corporate income tax for non-Saudi/non-GCC ownership; Zakat rules can differ',inflationPct:2.0,inflationYear:2025,priceLevel:.468,gdpPpp:73783.6,industry:{logistics:1.07,hotel:1.05,factory:1.04}},
  {id:'tr',region:'Middle East',name:'Türkiye',taxRate:.25,taxDetail:'25% standard corporate income tax',inflationPct:34.9,inflationYear:2025,priceLevel:.346,gdpPpp:45288.5,industry:{factory:1.05,hotel:1.04,logistics:1.04}},
  {id:'eg',region:'Middle East',name:'Egypt',taxRate:.225,taxDetail:'22.5% standard corporate income tax',inflationPct:14.1,inflationYear:2025,priceLevel:.153,gdpPpp:20204.0,industry:{hotel:1.07,logistics:1.04,restaurant:1.03}},

  {id:'za',region:'Africa',name:'South Africa',taxRate:.27,taxDetail:'27% corporate income tax',inflationPct:3.2,inflationYear:2025,priceLevel:.415,gdpPpp:15905.7,industry:{factory:1.05,logistics:1.05,hotel:1.03}},
  {id:'ke',region:'Africa',name:'Kenya',taxRate:.30,taxDetail:'30% resident corporate income tax',inflationPct:4.1,inflationYear:2025,priceLevel:.337,gdpPpp:7015.9,industry:{logistics:1.05,restaurant:1.04,hotel:1.03}},
  {id:'ng',region:'Africa',name:'Nigeria',taxRate:.30,taxDetail:'30% large-company rate; small-company rules can be lower or zero',inflationPct:23.0,inflationYear:2025,priceLevel:.128,gdpPpp:9531.6,industry:{logistics:1.05,factory:1.04,restaurant:1.03}}
]);

function derived(raw){
  const income=Math.sqrt(clamp(raw.gdpPpp/US_PPP,.02,3));
  const price=clamp(raw.priceLevel,.10,1.35);
  const wage=clamp(price*(.72+.28*income),.10,1.30);
  const demand=clamp(.84+.30*income,.88,1.15);
  const inflationRatio=1+(raw.inflationPct/100);
  const developmentSpread=Math.max(0,1-income)*.035;
  const loanRate=clamp(.045+Math.max(0,raw.inflationPct)/100+developmentSpread,.045,.45);
  const marketVol=clamp(.86+Math.max(0,raw.inflationPct)*.012+Math.max(0,1-income)*.12,.85,1.65);
  return Object.freeze({...raw,rent:price,wage,demand,revenue:price,loanRate,inflation:inflationRatio,marketVol});
}
const COUNTRIES=Object.freeze(COUNTRIES_RAW.map(derived));

const DEFAULT_DISTRICT=Object.freeze({
  coffee:'university',restaurant:'downtown',gamestore:'tech',hotel:'tourist',
  dealership:'suburbs',factory:'industrial',software:'tech',logistics:'industrial'
});
const byId=id=>COUNTRIES.find(x=>x.id===id)||COUNTRIES[0];
const current=()=>byId(window.state?.country||'us');
const industry=type=>current().industry?.[type]||1;
const costIndex=profile=>{
  const p=profile||current();
  return p.rent*.55+p.wage*.45;
};
const pct=v=>(v*100).toFixed((v*100)%1?1:0)+'%';
const moneyCompact=n=>{
  const x=Number(n)||0;
  if(x>=1e6)return '$'+(x/1e6).toFixed(1)+'M';
  if(x>=1e3)return '$'+Math.round(x/1e3)+'K';
  return '$'+Math.round(x);
};

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
        ?'TAX YEAR '+f.year+' — '+profile.name+' assessed '+pct(profile.taxRate)+' corporate income tax on positive annual operating profit. Tax paid: '+money(bill)+'.'
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
  state.country=byId(id).id;
  renderSetup();renderPanel();
  return true;
}
function fillSelect(select){
  if(!select||select.options.length)return;
  const groups=[...new Set(COUNTRIES.map(c=>c.region))];
  for(const region of groups){
    const g=document.createElement('optgroup');g.label=region;
    for(const c of COUNTRIES.filter(x=>x.region===region)){
      const o=document.createElement('option');o.value=c.id;o.textContent=c.name;g.appendChild(o);
    }
    select.appendChild(g);
  }
}
function renderSetup(){
  const select=document.getElementById('startCountry');
  if(!select)return;
  fillSelect(select);
  select.value=current().id;
  const c=current();
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set('countryTax',pct(c.taxRate));
  set('countryInflation',c.inflationPct.toFixed(1)+'%');
  set('countryPriceLevel',Math.round(c.priceLevel*100));
  set('countryLoan',(c.loanRate*100).toFixed(1)+'%');
  set('countryGdpPpp',moneyCompact(c.gdpPpp));
  set('countryDemand',Math.round(c.demand*100)+'%');
  set('countrySummary',c.taxDetail+'. Latest CPI input: '+c.inflationYear+' · '+c.inflationPct.toFixed(1)+'%. Price level and GDP inputs determine operating costs, local prices, demand and the simulated business-loan APR.');
}
function renderPanel(){
  const c=current(),f=ensure();
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set('economyCountry',c.name);
  set('economyCountryTax',pct(c.taxRate));
  set('economyCountryCosts',Math.round(costIndex(c)*100)+'% of US');
  set('economyCountryInflation',c.inflationPct.toFixed(1)+'% ('+c.inflationYear+')');
  set('economyCountryApr',(c.loanRate*100).toFixed(1)+'% est.');
  set('economyCountryPriceLevel',Math.round(c.priceLevel*100)+' / US 100');
  set('economyFiscalYear','Year '+(f?.year||1));
  set('economyTaxableProfit',money(Math.max(0,Number(f?.taxableProfit)||0)));
  set('economyTaxEstimate',money(estimateTax()));
  set('economyTaxDueDay','Day '+(f?.nextTaxDay||366));
  set('economyTaxMethod',c.taxDetail);
}
function init(){
  if(typeof state==='undefined')return;
  ensure();renderSetup();renderPanel();
  const select=document.getElementById('startCountry');
  select?.addEventListener('change',()=>setCountry(select.value));
}
window.ProfitLandsCountry={
  COUNTRIES,current,byId,industry,costIndex,startingDistrict,setCountry,
  ensure,resetFiscal,recordOperatingProfit,estimateTax,settleAnnualTax,
  renderSetup,renderPanel,pct,modelVersion:'real-data-2026-v2'
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();