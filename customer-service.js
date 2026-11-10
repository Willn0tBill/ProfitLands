/* ProfitLands deterministic customer service model with bounded persistent customer representatives. */
(function(root){
'use strict';
const profiles={coffee:[18,15,1.1,'Quick service'],restaurant:[12,9,1.3,'Dining service'],gamestore:[10,12,1.1,'Retail assistance'],hotel:[8,7,1.5,'Guest experience'],dealership:[5,5,1.4,'Sales assistance'],factory:[14,18,1.2,'Order fulfillment'],software:[16,20,1.5,'Customer support'],logistics:[20,22,1.4,'Delivery reliability']};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const safe=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function snapshot(b){
 const p=profiles[b?.type]||[12,12,1,'Customer service'],locs=Array.isArray(b?.locations)?b.locations:[];
 const branches=Math.max(1,1+Math.max(0,safe(b?.chainCount)),locs.length);
 const maxStat=k=>Math.max(0,safe(b?.[k]),...locs.map(l=>Math.max(0,safe(l?.[k]))));
 const workers=maxStat('workers'),efficiency=maxStat('efficiency'),marketing=maxStat('marketing');
 const popularity=clamp(safe(b?.popularity,55),0,100);
 const arrivals=Math.round(p[0]*branches*(.65+popularity/125)*(1+Math.min(4,marketing)*.08));
 const capacity=Math.round(p[1]*branches*(.65+Math.min(12,workers)*.45+Math.min(10,efficiency)*.11));
 const served=Math.min(arrivals,capacity),waiting=Math.max(0,arrivals-served),waitRatio=arrivals?waiting/arrivals:0;
 const quality=clamp(Math.round(70+Math.min(12,workers)*2+Math.min(10,efficiency)*3-waitRatio*32*p[2]),15,98);
 const target=clamp(Math.round(quality-waitRatio*28*p[2]),20,98);
 return {label:p[3],arrivals,served,waiting,quality,target,workers,branches};
}
// A small persistent panel of representative customers carries loyalty across days.
// Each representative stands for a segment of demand, not a real-world person.
const PANEL_SIZE=12;
function seedPanel(b){
 const previous=Array.isArray(b.customerPanel)?b.customerPanel:[];
 return Array.from({length:PANEL_SIZE},(_,i)=>{
  const old=previous.find(c=>c&&c.id===i);
  return {id:i,loyalty:clamp(safe(old?.loyalty,65),0,100),
   visits:clamp(Math.floor(safe(old?.visits,0)),0,100000)};
 });
}
function panelUpdate(b,m){
 const panel=seedPanel(b);
 const serviceRate=m.arrivals?m.served/m.arrivals:1;
 const visitCount=Math.min(PANEL_SIZE,Math.max(0,Math.round(PANEL_SIZE*(.55+safe(b.popularity,55)/250))));
 const start=Math.floor(safe(b.customerCycle,0))%PANEL_SIZE;
 let loyaltyTotal=0;
 for(const c of panel){
  const visiting=((c.id-start+PANEL_SIZE)%PANEL_SIZE)<visitCount;
  if(visiting){
   const score=m.quality-(1-serviceRate)*45;
   c.loyalty=clamp(c.loyalty+clamp(Math.round((score-65)/12),-4,4),0,100);
   c.visits=clamp(c.visits+1,0,100000);
  }else c.loyalty=clamp(c.loyalty-1,0,100);
  loyaltyTotal+=c.loyalty;
 }
 b.customerPanel=panel;
 b.customerCycle=(start+1)%PANEL_SIZE;
 return Math.round(loyaltyTotal/PANEL_SIZE);
}
function advance(b){
 const m=snapshot(b),current=clamp(safe(b.satisfaction,70),0,100);
 const loyalty=panelUpdate(b,m);
 const target=clamp(Math.round(m.target*.8+loyalty*.2),20,98);
 const next=clamp(current+clamp(target-current,-3,3),0,100);
 b.satisfaction=next;
 b.customerService={arrivals:m.arrivals,served:m.served,waiting:m.waiting,quality:m.quality,loyalty};
 const reputation=clamp(safe(b.reputation,50),0,100);
 if(next>=85)b.reputation=clamp(reputation+1,0,100);
 else if(next<45)b.reputation=clamp(reputation-1,0,100);
 return m;
}
const api={profiles,snapshot,advance,seedPanel,PANEL_SIZE};
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ProfitLandsCustomers=api;
})(typeof window!=='undefined'?window:null);
