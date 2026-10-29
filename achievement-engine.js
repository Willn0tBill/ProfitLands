/* ProfitLands in-game achievements. 8 industries x 16 tracks x 1024 = 131072. */
(function(){
'use strict';
const INDUSTRIES=[['coffee','Coffee Shops','☕'],['restaurant','Restaurants','🍽️'],['gamestore','Game Stores','🎮'],['hotel','Hotels','🏨'],['dealership','Dealerships','🚗'],['factory','Factories','🏭'],['software','Software','💻'],['logistics','Logistics','📦']];
const TRACKS=[
['highestLevel','Level Pioneer','maxLevel',5,5,'highest branch level'],
['totalLevels','Level Architect','totalLevels',3,3,'combined branch levels'],
['highestMarketing','Marketing Strategist','maxMarketing',1,1,'highest marketing level'],
['totalMarketing','Brand Builder','totalMarketing',1,2,'combined marketing levels'],
['highestEfficiency','Efficiency Specialist','maxEfficiency',1,1,'highest efficiency level'],
['totalEfficiency','Process Engineer','totalEfficiency',1,2,'combined efficiency levels'],
['workforce','Workforce Champion','workers',1,2,'employed staff'],
['investments','Capital Builder','capital',200,1.055,'estimated capital invested'],
['upgrades','Upgrade Veteran','upgrades',1,5,'branch upgrades purchased'],
['campaigns','Campaign Commander','campaigns',1,5,'marketing campaigns purchased'],
['optimizations','Operations Expert','optimizations',1,5,'efficiency upgrades purchased'],
['hired','Talent Recruiter','hired',1,5,'employees hired over time'],
['inventory','Supply Collector','inventory',10,20,'inventory units purchased'],
['sales','Sales Champion','sales',5,10,'units sold through market demo'],
['cycles','Industry Veteran','cycles',1,3,'automatic cycles while operating'],
['earnings','Revenue Titan','earnings',250,1.045,'positive income accumulated']
].map(t=>({id:t[0],name:t[1],metric:t[2],base:t[3],scale:t[4],unit:t[5],exp:t[3]>100&&t[4]<2}));
const RANKS=1024,PAGE_SIZE=30,TOTAL=INDUSTRIES.length*TRACKS.length*RANKS;
const COUNTERS=new Set(['upgrades','campaigns','optimizations','hired','inventory','sales','cycles','earnings']);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const clamp=(x,a,b)=>Math.max(a,Math.min(x,b));
const pretty=x=>Number.isFinite(x)?Math.round(x).toLocaleString('en-US',{maximumFractionDigits:0}):'∞';
let filter={sector:'all',track:'all',status:'all',search:'',page:0},lastCheck=0;
function ensure(){
 const s=window.state;if(!s)return null;
 if(!s.badgeBook||s.badgeBook.version!==1)s.badgeBook={version:1,ranks:{},counters:{},featured:[],recent:[]};
 const b=s.badgeBook;
 if(!b.ranks||typeof b.ranks!=='object')b.ranks={};
 if(!b.counters||typeof b.counters!=='object')b.counters={};
 if(!Array.isArray(b.featured))b.featured=[];
 if(!Array.isArray(b.recent))b.recent=[];
 return b;
}
const key=(sector,metric)=>sector+'.'+metric;
const badgeId=(sector,track,rank)=>sector+'.'+track+'.'+rank;
function parseId(v){
 const a=String(v).split('.'),r=Number(a[2]);
 return a.length===3&&INDUSTRIES.some(x=>x[0]===a[0])&&TRACKS.some(x=>x.id===a[1])&&Number.isInteger(r)&&r>0&&r<=RANKS?{sector:a[0],track:a[1],rank:r}:null;
}
function rankAt(sector,track){return clamp(Math.floor(n(ensure()?.ranks?.[key(sector,track)])),0,RANKS)}
function threshold(track,rank){return track.exp?Math.ceil(track.base*Math.pow(track.scale,rank-1)):track.base+(rank-1)*track.scale}
function rankFor(t,v){
 let low=0,high=RANKS;v=n(v);
 while(low<high){const m=Math.ceil((low+high)/2);if(v>=threshold(t,m))low=m;else high=m-1}
 return low;
}
const tier=r=>r<=64?'Bronze':r<=256?'Silver':r<=512?'Gold':r<=768?'Diamond':'Legendary';
function describe(sector,track,rank){
 const i=INDUSTRIES.find(x=>x[0]===sector),t=TRACKS.find(x=>x.id===track);
 if(!i||!t||!Number.isInteger(rank)||rank<1||rank>RANKS)return null;
 return{id:badgeId(sector,track,rank),sector,track,rank,tier:tier(rank),icon:i[2],
 title:i[1]+' · '+t.name+' '+rank.toLocaleString('en-US'),
 description:'Reach '+pretty(threshold(t,rank))+' '+t.unit+' in '+i[1]+'.',goal:threshold(t,rank)};
}
function record(sector,metric,amount=1){
 if(!window.state?.started||!INDUSTRIES.some(x=>x[0]===sector)||!COUNTERS.has(metric))return false;
 const v=n(amount);if(!v)return false;
 const b=ensure(),k=key(sector,metric);
 b.counters[k]=Math.min(Number.MAX_VALUE,n(b.counters[k])+v);
 return true;
}
function sectorMeasures(sector){
 const businesses=(window.state?.businesses||[]).filter(b=>b.type===sector),loc=businesses.flatMap(b=>b.locations||[]);
 const values=f=>loc.map(f).map(n);
 const levels=values(l=>l.level||1),m=values(l=>l.marketing),e=values(l=>l.efficiency);
 const base=n((window.BUSINESS_TYPES||[]).find(x=>x.id===sector)?.cost);
 const result={maxLevel:Math.max(0,...levels),totalLevels:levels.reduce((a,v)=>a+v,0),
 maxMarketing:Math.max(0,...m),totalMarketing:m.reduce((a,v)=>a+v,0),
 maxEfficiency:Math.max(0,...e),totalEfficiency:e.reduce((a,v)=>a+v,0),
 workers:loc.reduce((a,l)=>a+n(l.workers),0),
 capital:loc.reduce((a,l)=>a+base*(1+Math.max(0,n(l.level||1)-1)*.75),0)};
 for(const metric of COUNTERS)result[metric]=n(ensure()?.counters?.[key(sector,metric)]);
 return result;
}
function earnedCount(){
 let sum=0;
 for(const i of INDUSTRIES)for(const t of TRACKS)sum+=rankAt(i[0],t.id);
 return sum;
}
function scan(now=Date.now(),force=false){
 if(!window.state?.started||!ensure()||(!force&&now-lastCheck<5000))return 0;
 lastCheck=now;let awarded=0,latest=null;
 for(const i of INDUSTRIES){
  const stats=sectorMeasures(i[0]);
  for(const t of TRACKS){
   const k=key(i[0],t.id),old=rankAt(i[0],t.id),next=rankFor(t,stats[t.metric]);
   if(next>old){ensure().ranks[k]=next;awarded+=next-old;latest=badgeId(i[0],t.id,next)}
  }
 }
 if(awarded){
  const b=ensure();b.recent=[latest,...b.recent.filter(x=>x!==latest)].slice(0,10);
  const msg=awarded===1?'New achievement unlocked!':awarded.toLocaleString('en-US')+' achievements unlocked!';
  window.state.news?.push('TROPHY ROOM — '+msg);
  if(window.state.news?.length>150)window.state.news=window.state.news.slice(-150);
  window.toast?.(msg);window.save?.();
  if(window.ProfitLandsWorkspace?.active?.()==='trophies')render();
 }
 return awarded;
}
function progressFor(sector,t){
 const rank=rankAt(sector,t.id),value=sectorMeasures(sector)[t.metric],last=rank?threshold(t,rank):0,
 next=rank<RANKS?threshold(t,rank+1):null;
 return{rank,value,next,pct:next===null?100:clamp((value-last)/Math.max(1,next-last)*100,0,100)};
}
function filtered(){
 const result=[],search=filter.search.trim().toLowerCase();
 for(const i of INDUSTRIES)for(const t of TRACKS){
  if(filter.sector!=='all'&&filter.sector!==i[0])continue;
  if(filter.track!=='all'&&filter.track!==t.id)continue;
  if(search&&!([i[1],t.name,t.unit,i[0],t.id].join(' ').toLowerCase().includes(search)))continue;
  const rank=rankAt(i[0],t.id);
  const count=filter.status==='earned'?rank:filter.status==='locked'?RANKS-rank:RANKS;
  if(count)result.push({i,t,rank,count});
 }
 return result;
}
function browse(page=filter.page){
 const groups=filtered(),total=groups.reduce((sum,g)=>sum+g.count,0);
 const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
 const index=clamp(Math.floor(Number(page)||0),0,pages-1);
 let skip=index*PAGE_SIZE;const rows=[];
 for(const g of groups){
  if(skip>=g.count){skip-=g.count;continue}
  const first=filter.status==='locked'?g.rank+1:1;
  for(let ix=skip;ix<g.count&&rows.length<PAGE_SIZE;ix++){
   const d=describe(g.i[0],g.t.id,first+ix);
   rows.push({...d,earned:d.rank<=g.rank});
  }
  skip=0;if(rows.length===PAGE_SIZE)break;
 }
 return{rows,total,pages,page:index};
}
function featured(id){
 const d=parseId(id),b=ensure();
 if(!d||!b||d.rank>rankAt(d.sector,d.track))return false;
 b.featured=b.featured.includes(id)?b.featured.filter(v=>v!==id):[...b.featured.slice(-4),id];
 window.save?.();render();return true;
}
function card(d){
 const favorite=ensure()?.featured?.includes(d.id);
 return '<article class="pl-trophy-card '+(d.earned?'pl-trophy-earned':'pl-trophy-locked')+'">'+
 '<div class="pl-trophy-art tier-'+d.tier.toLowerCase()+'"><span>'+d.icon+'</span><small>'+d.tier+'</small></div>'+
 '<div class="pl-trophy-copy"><h4>'+esc(d.title)+'</h4><p>'+esc(d.description)+'</p><small>Rank '+d.rank.toLocaleString('en-US')+' / '+RANKS.toLocaleString('en-US')+' · '+(d.earned?'EARNED':'LOCKED')+'</small></div>'+
 (d.earned?'<button type="button" data-trophy-feature="'+d.id+'">'+(favorite?'★ Featured':'☆ Feature')+'</button>':'')+'</article>';
}
function render(){
 const root=$('trophyContent'),b=ensure();
 if(!root||!b)return;
 const earned=earnedCount(),page=browse(),pct=(earned/TOTAL*100).toFixed(2);
 const options=(arr,chosen)=>arr.map(pair=>'<option value="'+pair[0]+'" '+(chosen===pair[0]?'selected':'')+'>'+esc(pair[1])+'</option>').join('');
 const sectorOptions=options([['all','All industries'],...INDUSTRIES.map(x=>[x[0],x[1]])],filter.sector);
 const trackOptions=options([['all','All tracks'],...TRACKS.map(x=>[x.id,x.name])],filter.track);
 const statusOptions=options([['all','All'],['earned','Earned'],['locked','Locked']],filter.status);
 const favorites=b.featured.map(parseId).filter(Boolean).map(x=>describe(x.sector,x.track,x.rank)).filter(Boolean);
 root.innerHTML='<div class="pl-trophy-hero"><div><span>THE PROFITLANDS COLLECTION</span><h3>131,072 Achievements</h3><p>128 measurable tracks across eight industries. Collect 1,024 milestone ranks in each.</p></div><div class="pl-trophy-score"><strong>'+earned.toLocaleString('en-US')+'</strong><small>EARNED</small><span>'+pct+'%</span></div></div>'+
 '<div class="pl-trophy-progress"><span style="width:'+pct+'%"></span></div>'+
 '<div class="pl-trophy-meta">8 industries · 16 track types · Bronze / Silver / Gold / Diamond / Legendary</div>'+
 '<div class="pl-trophy-featured"><h3>Featured Badges <small>'+favorites.length+' / 5</small></h3>'+
 (favorites.length?'<div>'+favorites.map(x=>'<span>'+x.icon+' '+esc(x.title)+'</span>').join('')+'</div>':'<p>Feature up to five earned badges on your profile.</p>')+'</div>'+
 '<div class="pl-trophy-filters"><label>Industry<select id="trophySector">'+sectorOptions+'</select></label>'+
 '<label>Track<select id="trophyTrack">'+trackOptions+'</select></label>'+
 '<label>Status<select id="trophyStatus">'+statusOptions+'</select></label>'+
 '<label>Search<input id="trophySearch" type="search" placeholder="Search tracks" value="'+esc(filter.search)+'"></label></div>'+
 '<div class="pl-trophy-list-head"><strong>'+page.total.toLocaleString('en-US')+' matching badges</strong><span>Page '+(page.page+1)+' / '+page.pages.toLocaleString('en-US')+'</span></div>'+
 '<div class="pl-trophy-list">'+(page.rows.map(card).join('')||'<p>No achievements match these filters.</p>')+'</div>'+
 '<div class="pl-trophy-pagination"><button type="button" data-trophy-page="prev" '+(!page.page?'disabled':'')+'>Previous</button><span>Page '+(page.page+1)+' / '+page.pages.toLocaleString('en-US')+'</span><button type="button" data-trophy-page="next" '+(page.page+1>=page.pages?'disabled':'')+'>Next</button></div>'+
 '<p class="pl-trophy-note">In-game achievements only. There are no cash rewards. Steam achievements are a future curated subset and are not connected yet.</p>';
 for(const [id,field]of[['trophySector','sector'],['trophyTrack','track'],['trophyStatus','status']]){
  root.querySelector('#'+id)?.addEventListener('change',e=>{filter[field]=e.target.value;filter.page=0;render()});
 }
 root.querySelector('#trophySearch')?.addEventListener('change',e=>{filter.search=e.target.value.slice(0,80);filter.page=0;render()});
 root.querySelectorAll('[data-trophy-feature]').forEach(x=>x.addEventListener('click',()=>featured(x.dataset.trophyFeature)));
 root.querySelectorAll('[data-trophy-page]').forEach(x=>x.addEventListener('click',()=>{
  filter.page+=x.dataset.trophyPage==='next'?1:-1;render();
  root.querySelector('.pl-trophy-list-head')?.scrollIntoView?.({behavior:'instant',block:'start'});
 }));
}
function init(){
 if(!$('trophyContent'))return;
 ensure();scan(Date.now(),true);render();
 window.setInterval(()=>scan(),5000);
 window.addEventListener('profitlands:newgame',()=>{if(window.state)window.state.badgeBook=null;lastCheck=0;render()});
}
window.ProfitLandsBadges={INDUSTRIES,TRACKS,RANKS,TOTAL,PAGE_SIZE,ensure,threshold,rankFor,rankAt,describe,sectorMeasures,record,scan,earnedCount,browse,featured,render,progressFor,tier,setFilter:o=>{filter={...filter,...o,page:0};return browse()}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();