/* WtvI ProfitLands: Executive Briefing. Read-only management insights. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>window.ProfitLandsMoney?.format?.(n)||(Number.isFinite(n)?'$'+Math.round(n).toLocaleString('en-US'):'$0');
const cap=n=>Math.max(0,Number.isFinite(Number(n))?Number(n):0);
function evaluate(){
 const s=window.state||{},businesses=s.businesses||[],sites=[];
 const period=window.ProfitLandsRealtime?.period||60;
 let totalWorkers=0;
 businesses.forEach((b,bi)=>(b.locations||[]).forEach((l,li)=>{
  const rate=Number(window.ProfitLandsEconomy?.locationProfit?.(b,l,li));
  const p=Number.isFinite(rate)?rate/period:0;
  const level=cap(l.level||1),workers=cap(l.workers||0);
  totalWorkers+=workers;
  const next=(window.ProfitLandsAdvancements?.CATALOG||[]).find(x=>x.level>level);
  sites.push({b,bi,l,li,rate:p,level,workers,next});
 }));
 const best=sites.slice().sort((a,b)=>b.rate-a.rate)[0]||null;
 const worst=sites.slice().sort((a,b)=>a.rate-b.rate)[0]||null;
 const earning=sites.reduce((a,x)=>a+x.rate,0);
 const actions=cap(s.actions||0);
 const economy=Number(s.economy?.health)||50;
 const events=s.economy?.activeEvents||[];
 const tasks=[];
 if(!sites.length)tasks.push({title:'Start your first business',detail:'Choose a company to begin building a business portfolio.',view:'businesses',action:'Open marketplace'});
 else{
  if(worst&&worst.rate<0)tasks.push({title:'Review a loss-making branch',detail:worst.l.name+' is operating at '+fmt(worst.rate)+'/sec. Check staffing, pricing and upgrades.',view:'businesses',action:'Manage branch',bi:worst.bi});
  const advancing=sites.filter(x=>x.next).sort((a,b)=>(a.next.level-a.level)-(b.next.level-b.level))[0];
  if(advancing)tasks.push({title:'Next upgrade milestone',detail:advancing.l.name+' is Level '+advancing.level+'. Next advancement: '+advancing.next.name+' at Level '+advancing.next.level+'.',view:'advances',action:'View advances',bi:advancing.bi,li:advancing.li});
  if(actions<5)tasks.push({title:'Rebuilding management actions',detail:'Actions regenerate automatically during active play. Cash flow continues while you manage other screens.',view:'overview',action:'Economy overview'});
  if(economy<45)tasks.push({title:'Market conditions under pressure',detail:'Economic health is '+Math.round(economy)+'/100. Monitor demand and operating expenses before expanding.',view:'overview',action:'Review economy'});
  if(!tasks.length)tasks.push({title:'Your empire is running',detail:'Review new opportunities in the business portfolio and keep improving locations.',view:'businesses',action:'Review businesses'});
 }
 return{businesses:businesses.length,locations:sites.length,workers:totalWorkers,perSecond:earning,actions,economy,events:events.length,best,worst,tasks:tasks.slice(0,3)};
}
function render(){
 const root=$('executiveContent'),s=window.state;
 if(!root||!s)return;
 const o=evaluate();
 const money=n=>(n>=0?'+':'')+fmt(n);
 root.innerHTML='<div class="pl-executive-intro"><div><span>WtvI / PROFITLANDS COMMAND</span><h3>Executive Briefing</h3><p>Decide what to improve next. Updated from your active empire, not a static demo.</p></div><button type="button" data-executive-view="businesses">Business portfolio →</button></div>'+
 '<div class="pl-executive-kpis">'+[
 ['BUSINESSES',o.businesses.toLocaleString('en-US')],['BRANCHES',o.locations.toLocaleString('en-US')],
 ['EMPLOYEES',o.workers.toLocaleString('en-US')],['NET CASH FLOW',money(o.perSecond)+'/sec']
 ].map(a=>'<div><small>'+a[0]+'</small><strong>'+esc(a[1])+'</strong></div>').join('')+'</div>'+
 '<div class="pl-executive-lower"><section><header><h4>Priority Actions</h4><span>'+o.tasks.length+' recommendations</span></header>'+
 o.tasks.map(t=>'<article class="pl-executive-task"><div><strong>'+esc(t.title)+'</strong><p>'+esc(t.detail)+'</p></div>'+
 '<button type="button" data-executive-view="'+t.view+'" '+(t.bi===undefined?'':'data-executive-business="'+t.bi+'"')+' '+(t.li===undefined?'':'data-executive-location="'+t.li+'"')+'>'+esc(t.action)+' →</button></article>').join('')+'</section>'+
 '<section class="pl-executive-pulse"><header><h4>Operating Pulse</h4><span>Live overview</span></header>'+
 '<div><span>Market health</span><strong>'+Math.round(o.economy)+'/100</strong></div>'+
 '<div><span>Available actions</span><strong>'+o.actions+'</strong></div>'+
 '<div><span>Active market events</span><strong>'+o.events+'</strong></div>'+
 '<div><span>Top earning branch</span><strong>'+esc(o.best?.l.name||'—')+'</strong></div>'+
 '<p>Financial values are calculated from active branches; taxes and investments may affect your total empire earnings.</p></section></div>';
 root.querySelectorAll('[data-executive-view]').forEach(btn=>btn.addEventListener('click',()=>{
  const view=btn.dataset.executiveView;
  if(view==='advances'&&btn.dataset.executiveBusiness!==undefined){
   window.ProfitLandsAdvancements?.select?.(Number(btn.dataset.executiveBusiness),Number(btn.dataset.executiveLocation)||0);
   return;
  }
  window.ProfitLandsWorkspace?.show?.(view);
  if(view==='businesses'&&btn.dataset.executiveBusiness!==undefined){
   window.openManage?.(Number(btn.dataset.executiveBusiness));
  }
 }));
}
function init(){
 if(!$('executiveContent'))return;
 render();
 window.addEventListener('profitlands:viewchange',e=>{if(e.detail?.view==='overview')render()});
 window.setInterval(()=>{if(window.ProfitLandsWorkspace?.active?.()==='overview'&&document.visibilityState==='visible')render()},12000);
}
window.ProfitLandsExecutive={evaluate,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();