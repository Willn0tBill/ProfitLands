/* Dedicated throwaway Empire Lab showcase. Does NOT access or write game saves. */
(function(){
'use strict';
const types=[
{id:'coffee',name:'Coffee Shop',cost:500,baseRevenue:115,baseExpense:48},
{id:'restaurant',name:'Restaurant',cost:2000,baseRevenue:390,baseExpense:190},
{id:'gamestore',name:'Game Store',cost:5000,baseRevenue:760,baseExpense:420},
{id:'hotel',name:'Hotel',cost:25000,baseRevenue:3300,baseExpense:1900},
{id:'dealership',name:'Dealership',cost:100000,baseRevenue:12500,baseExpense:7900},
{id:'factory',name:'Factory',cost:500000,baseRevenue:62000,baseExpense:41000},
{id:'software',name:'Software Company',cost:2500000,baseRevenue:330000,baseExpense:170000},
{id:'logistics',name:'Logistics Firm',cost:10000,baseRevenue:1250,baseExpense:770}
];
const loc=(id,name,workers=4,manager=true)=>({
id,name,level:2,marketing:0,efficiency:0,workers,manager,rent:1.2,demand:1.15,basePopularity:65});
const business=(type,name,locations)=>({type,name,level:2,marketing:0,efficiency:0,workers:0,manager:false,
popularity:65,financialBalance:0,locationManagementVersion:1,chainCount:locations.length-1,locations});
const state={
cash:25000000,started:true,day:1,actions:100,mode:'standard',news:[],stocks:{},property:0,
businesses:[
business('coffee','Morning Brew Coffee',[loc('downtown','Downtown'),loc('tourist','Tourist District',3,false)]),
business('restaurant','Sunrise Dining',[loc('downtown','City Center',5,true)]),
business('logistics','Express Cargo',[loc('industrial','Industrial Park',4,true)]),
business('software','Nexa Apps',[loc('tech','Technology District',8,true)])
]};
window.state=state;
window.BUSINESS_TYPES=types;
window.ProfitLandsLocationOps={normalizeAll(){}};
window.ProfitLandsGrowth={workforceTier:()=>({cap:1000}),render(){}};
window.ProfitLandsRealtime={period:60};
window.ProfitLandsEconomy={businessValue:b=>(types.find(t=>t.id===b.type)?.cost||1000)*(b.locations?.length||1)*2};
window.ProfitLandsMoney.attach(state);
window.save=()=>{}; // No save to localStorage, cloud or account.
window.toast=message=>{const box=document.getElementById('demoToast');if(box)box.textContent=message};
window.render=()=>{
 const balance=document.getElementById('demoBalance'),actions=document.getElementById('demoActions');
 if(balance)balance.textContent=window.ProfitLandsMoney.format(window.ProfitLandsMoney.balance());
 if(actions)actions.textContent=String(state.actions);
};
function management(index){
 const b=state.businesses[index],dialog=document.getElementById('demoManagement');
 if(!dialog||!b)return;
 const content=document.getElementById('demoManagementBody');
 const escape=x=>String(x).replace(/[&<>"]/g,t=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[t]));
 content.innerHTML='<h3>Staff Management — '+escape(b.name)+'</h3><p>Hire employees or managers to try assigning roles in Store Operations.</p>'+
 b.locations.map((l,i)=>'<div class="demo-manage-site"><b>'+escape(l.name)+'</b> · '+l.workers+' employees · '+(l.manager?'Manager hired':'No manager')+
 '<div class="lab-actions"><button type="button" data-demohire="'+i+'">Hire 5 employees · $500</button>'+
 '<button type="button" data-demomanager="'+i+'" '+(l.manager?'disabled':'')+'>Hire manager · $1,500</button></div></div>').join('');
 content.querySelectorAll('[data-demohire]').forEach(btn=>btn.onclick=()=>{
   const l=b.locations[Number(btn.dataset.demohire)];
   if(l.workers+5>100||!window.ProfitLandsMoney.spend(500))return window.toast('Need more demo cash or available positions.');
   l.workers+=5;state.actions=Math.max(0,state.actions-1);window.render();management(index);
 });
 content.querySelectorAll('[data-demomanager]').forEach(btn=>btn.onclick=()=>{
   const l=b.locations[Number(btn.dataset.demomanager)];
   if(l.manager||!window.ProfitLandsMoney.spend(1500))return;
   l.manager=true;state.actions=Math.max(0,state.actions-1);window.render();management(index);
 });
 if(!dialog.open)dialog.showModal();
}
window.openManage=management;
window.render();
document.getElementById('demoRestart')?.addEventListener('click',()=>location.reload());
document.getElementById('demoManagementClose')?.addEventListener('click',()=>document.getElementById('demoManagement')?.close());
})();