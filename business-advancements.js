/* ProfitLands permanent per-location technology tree. */
(function(){
'use strict';
const CATALOG=Object.freeze([
{id:'workstations',level:10,name:'Professional Workstations',effect:'+2% revenue',mult:1,bonus:{revenue:.02}},
{id:'academy',level:25,name:'Employee Academy',effect:'−2% payroll',mult:1.2,bonus:{payroll:-.02}},
{id:'suppliers',level:50,name:'Supplier Contracts',effect:'−2% operating costs',mult:1.5,bonus:{expenses:-.02}},
{id:'equipment',level:100,name:'Advanced Equipment',effect:'+4% revenue',mult:2,bonus:{revenue:.04}},
{id:'scheduling',level:150,name:'Smart Scheduling',effect:'−4% payroll',mult:2,bonus:{payroll:-.04}},
{id:'regional',level:250,name:'Regional Headquarters',effect:'+5% revenue',mult:2.5,bonus:{revenue:.05}},
{id:'forecast',level:350,name:'Supply Forecasting',effect:'−5% local inventory purchase costs',mult:2.5,bonus:{stock:-.05}},
{id:'automation',level:500,name:'Automated Operations',effect:'Optional auto-hiring and auto-upgrades; +2% revenue',mult:3,bonus:{revenue:.02,automation:true}},
{id:'analytics',level:750,name:'Brand Analytics',effect:'+3% revenue',mult:3,bonus:{revenue:.03}},
{id:'specialization',level:1000,name:'Corporate Specialization',effect:'+6% revenue',mult:4,bonus:{revenue:.06}},
{id:'industrial',level:1500,name:'Industrial Efficiency',effect:'−4% operating costs',mult:4,bonus:{expenses:-.04}},
{id:'prestige',level:2500,name:'Prestige Network',effect:'+8% revenue',mult:5,bonus:{revenue:.08}},
{id:'global',level:5000,name:'Global Operations',effect:'+7% revenue and −3% operating costs',mult:6,bonus:{revenue:.07,expenses:-.03}},
{id:'legacy',level:10000,name:'Legacy Systems',effect:'+5% revenue',mult:8,bonus:{revenue:.05}}
]);
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=()=>window.state?.businesses||[];
const find=(bi,li)=>{const b=list()[bi],l=b?.locations?.[li];return b&&l?{b,l,bi,li}:null};
const owned=(l,id)=>Array.isArray(l?.advancements)&&l.advancements.includes(id);
const unlocked=(l,item)=>(Number(l?.level)||1)>=item.level;
const format=n=>window.ProfitLandsMoney?.format?.(n)||'$'+Math.round(n).toLocaleString('en-US');
let selected={bi:0,li:0},lastCheck=0;
function ensure(l){
 if(!l||typeof l!=='object')return null;
 if(!Array.isArray(l.advancements))l.advancements=[];
 if(!l.advancementAuto||typeof l.advancementAuto!=='object')
   l.advancementAuto={hire:false,upgrade:false,lastAt:0};
 return l;
}
function modifiers(l){
 const result={revenue:1,expenses:1,payroll:1,stock:1,automation:false};
 for(const item of CATALOG)if(owned(l,item.id)){
  for(const prop of ['revenue','expenses','payroll','stock'])
    if(Number.isFinite(item.bonus[prop]))result[prop]+=item.bonus[prop];
  if(item.bonus.automation)result.automation=true;
 }
 result.revenue=Math.min(1.5,Math.max(1,result.revenue));
 result.expenses=Math.max(.65,Math.min(1,result.expenses));
 result.payroll=Math.max(.65,Math.min(1,result.payroll));
 result.stock=Math.max(.75,Math.min(1,result.stock));
 return result;
}
function cost(b,l,item){
 const base=Number((window.BUSINESS_TYPES||[]).find(x=>x.id===b?.type)?.cost);
 if(!Number.isFinite(base)||base<=0)return Infinity;
 const p=base*(2+item.level*.08)*item.mult*Math.max(.5,Math.min(3,Number(l?.rent)||1));
 return Number.isFinite(p)?Math.round(p):Infinity;
}
function afford(n){return Number.isFinite(n)&&n>=0&&
  (window.ProfitLandsMoney?window.ProfitLandsMoney.canAfford(n):(window.state?.cash||0)>=n)}
function charge(n){
 if(!window.state||window.state.actions<1||!afford(n))return false;
 if(window.ProfitLandsMoney){if(!window.ProfitLandsMoney.spend(n))return false}
 else window.state.cash-=n;
 window.state.actions--;return true;
}
function sync(){
 window.save?.();window.render?.();window.ProfitLandsGrowth?.render?.();
}
function purchase(bi,li,id){
 const s=find(bi,li),item=CATALOG.find(x=>x.id===id);
 if(!s||!item||!unlocked(s.l,item)||owned(s.l,id)||!charge(cost(s.b,s.l,item)))return false;
 ensure(s.l).advancements.push(id);
 window.state.news?.push('ADVANCEMENT — '+s.b.name+' · '+s.l.name+': '+item.name+'.');
 sync();render();
 if($('manageModal')&&!$('manageModal').classList.contains('hidden'))
   window.ProfitLandsLocationOps?.open?.(bi,li);
 window.toast?.(item.name+' unlocked for '+s.l.name+'.');
 return true;
}
function setAutomation(bi,li,kind,value){
 const s=find(bi,li);
 if(!s||!owned(s.l,'automation')||!s.l.manager||!['hire','upgrade'].includes(kind))return false;
 ensure(s.l).advancementAuto[kind]=Boolean(value);
 sync();render();return true;
}
function select(bi,li){
 selected={bi:Number(bi)||0,li:Number(li)||0};
 window.ProfitLandsWorkspace?.show?.('advances');render();return true;
}
function chosen(){
 if(!list().length)return null;
 selected.bi=Math.max(0,Math.min(selected.bi,list().length-1));
 selected.li=Math.max(0,Math.min(selected.li,(list()[selected.bi].locations||[]).length-1));
 return find(selected.bi,selected.li);
}
function card(s,item){
 const purchased=owned(s.l,item.id),ready=unlocked(s.l,item),fee=cost(s.b,s.l,item);
 const disabled=purchased||!ready||!afford(fee)||window.state.actions<1;
 return '<article class="pl-adv-card '+(purchased?'pl-adv-owned':ready?'pl-adv-ready':'pl-adv-locked')+'">'+
  '<div class="pl-adv-card-top"><span>LEVEL '+item.level.toLocaleString('en-US')+'</span>'+
  '<span>'+ (purchased?'PURCHASED':ready?'AVAILABLE':'LOCKED')+'</span></div>'+
  '<h4>'+escape(item.name)+'</h4><p>'+escape(item.effect)+'</p>'+
  '<div class="pl-adv-card-bottom"><small>'+(purchased?'Permanent bonus':
   ready?format(fee)+' · 1 action':'Unlock at level '+item.level.toLocaleString('en-US'))+'</small>'+
  '<button type="button" data-adv-buy="'+item.id+'" '+(disabled?'disabled':'')+'>'+
   (purchased?'Owned':ready?'Purchase':'Locked')+'</button></div></article>';
}
function render(){
 const root=$('advancementsContent');if(!root)return;
 const s=chosen();
 if(!s){root.innerHTML='<div class="pl-adv-empty">Purchase a business to start unlocking advances.</div>';return}
 const {b,l}=s;
 ensure(l);
 const level=Math.max(1,Math.floor(Number(l.level)||1));
 const count=CATALOG.filter(x=>owned(l,x.id)).length;
 const next=CATALOG.find(x=>x.level>level),previous=[...CATALOG].reverse().find(x=>x.level<=level);
 const from=previous?.level||1;
 const progress=next?Math.max(0,Math.min(100,(level-from)/(next.level-from)*100)):100;
 const businessOptions=list().map((x,i)=>'<option value="'+i+'" '+(selected.bi===i?'selected':'')+'>'+escape(x.name)+'</option>').join('');
 const locationOptions=(b.locations||[]).map((x,i)=>'<option value="'+i+'" '+(selected.li===i?'selected':'')+'>'+escape(x.name||'Location '+(i+1))+'</option>').join('');
 const mods=modifiers(l),auto=l.advancementAuto,unlockedAuto=owned(l,'automation')&&l.manager;
 root.innerHTML='<div class="pl-adv-hero"><div><small>LOCATION ADVANCEMENT TREE</small><h3>'+
 escape(l.name)+' · Level '+level.toLocaleString('en-US')+'</h3><p>'+
 (next?'Next milestone: '+escape(next.name)+' at Level '+next.level.toLocaleString('en-US'):
 'All milestones reached. Business levels remain unlimited.')+'</p></div><strong>'+count+' / '+CATALOG.length+' owned</strong></div>'+
 '<div class="pl-adv-progress" role="progressbar" aria-valuenow="'+Math.round(progress)+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+progress.toFixed(2)+'%"></span></div>'+
 '<div class="pl-adv-selectors"><label>Business<select id="advBusiness">'+businessOptions+'</select></label>'+
 '<label>Location<select id="advLocation">'+locationOptions+'</select></label></div>'+
 '<div class="pl-adv-effects"><span>Revenue <b>+'+Math.round((mods.revenue-1)*100)+'%</b></span>'+
 '<span>Expenses <b>−'+Math.round((1-mods.expenses)*100)+'%</b></span>'+
 '<span>Payroll <b>−'+Math.round((1-mods.payroll)*100)+'%</b></span>'+
 '<span>Inventory <b>−'+Math.round((1-mods.stock)*100)+'%</b></span></div>'+
 '<div class="pl-adv-grid">'+CATALOG.map(item=>card(s,item)).join('')+'</div>'+
 '<div class="pl-adv-auto"><h3>Automated Management</h3><p>Available after purchasing Level 500 Automated Operations and hiring a manager. Automation is off by default, checks once per minute, and preserves a 5× cash reserve.</p>'+
 '<label><input type="checkbox" data-adv-auto="hire" '+(auto.hire?'checked':'')+' '+(!unlockedAuto?'disabled':'')+'> Auto-hire up to 5 employees</label>'+
 '<label><input type="checkbox" data-adv-auto="upgrade" '+(auto.upgrade?'checked':'')+' '+(!unlockedAuto?'disabled':'')+'> Auto-upgrade this location</label></div>';
 root.querySelector('#advBusiness')?.addEventListener('change',e=>{selected={bi:Number(e.target.value),li:0};render()});
 root.querySelector('#advLocation')?.addEventListener('change',e=>{selected.li=Number(e.target.value);render()});
 root.querySelectorAll('[data-adv-buy]').forEach(btn=>btn.addEventListener('click',()=>purchase(selected.bi,selected.li,btn.dataset.advBuy)));
 root.querySelectorAll('[data-adv-auto]').forEach(input=>input.addEventListener('change',()=>setAutomation(selected.bi,selected.li,input.dataset.advAuto,input.checked)));
}
function tick(now=Date.now()){
 const s=window.state,ops=window.ProfitLandsLocationOps;
 if(!s?.started||!ops||document.visibilityState==='hidden'||!$('gameScreen')?.classList.contains('active'))return 0;
 if(now-lastCheck<30000)return 0;
 lastCheck=now;
 let done=0;
 for(let bi=0;bi<list().length&&done<2;bi++)for(let li=0;li<(list()[bi].locations||[]).length&&done<2;li++){
  const site=find(bi,li),auto=site.l.advancementAuto;
  if(!auto||(!auto.hire&&!auto.upgrade)||!owned(site.l,'automation')||!site.l.manager||
     now-(Number(auto.lastAt)||0)<60000||s.actions<3)continue;
  const space=ops.room(site.l);let kind=null,quantity=1,price=0;
  if(auto.hire&&space>0){kind='hire';quantity=Math.min(5,space);price=ops.price(site.b,site.l,kind,quantity)}
  else if(auto.upgrade){kind='upgrade';price=ops.price(site.b,site.l,kind)}
  if(!kind||!Number.isFinite(price)||!afford(price*5)||!charge(price))continue;
  if(kind==='hire')site.l.workers+=quantity;else site.l.level++;
  auto.lastAt=now;done++;
  s.news?.push('AUTOMATION — '+site.b.name+' · '+site.l.name+': '+kind+'.');
 }
 if(done){sync();render()}return done;
}
function init(){if(!$('advancementsContent'))return;render();window.setInterval(()=>tick(),30000)}
window.ProfitLandsAdvancements={CATALOG,ensure,owned,unlocked,modifiers,cost,purchase,setAutomation,select,render,tick,find};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();