/* ProfitLands — Wtv Innovations Executive Quick Switch.
   Native keyboard/touch navigation, no changes to game state or saves. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let modal,input,results,selected=0,lastFocus=null,ready=false;
const studio='https://willn0tbill.github.io/WtvStudios/';
const sortTitle=(a,b)=>a.label.localeCompare(b.label);
function isPlaying(){return Boolean($('gameScreen')?.classList.contains('active'))}
function items(query=''){
 const ws=window.ProfitLandsWorkspace;
 const entries=(ws?.views||[]).map((x,i)=>({kind:'view',key:x.id,label:x.name,detail:'Workspace screen',view:x.id,order:i}));
 const owned=window.state?.businesses||[];
 for(let i=0;i<owned.length;i++){
  const b=owned[i],name=String(b.name||'Business '+(i+1)).slice(0,90);
  entries.push({kind:'business',key:'business-'+i,label:name,detail:'Open company management',index:i,order:20+i});
 }
 entries.push({kind:'action',key:'buy',label:'Buy a new business',detail:'Open company marketplace',order:50});
 entries.push({kind:'site',key:'wtvi',label:'Wtv Innovations',detail:'Visit studio portfolio',url:studio,order:60});
 entries.push({kind:'site',key:'nation',label:'Nation Wars',detail:'Open WtvI strategy game',url:'https://willn0tbill.github.io/NationWars/',order:61});
 const q=String(query||'').trim().toLowerCase().slice(0,120);
 if(!q)return entries.sort((a,b)=>a.order-b.order).slice(0,12);
 const scored=entries.map(x=>{const name=x.label.toLowerCase(),detail=x.detail.toLowerCase();
  const score=name===q?0:name.startsWith(q)?1:name.includes(q)?2:detail.includes(q)?3:99;
  return{...x,score}
 }).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||a.order-b.order||sortTitle(a,b));
 return scored.slice(0,12);
}
function open(){
 if(!ready||!isPlaying())return false;
 if(!modal.hidden)return true;
 lastFocus=document.activeElement;
 modal.hidden=false;document.body.classList.add('pl-command-open');
 input.value='';selected=0;draw();input.focus();return true;
}
function close(){
 if(!ready||modal.hidden)return false;
 modal.hidden=true;document.body.classList.remove('pl-command-open');
 if(lastFocus?.focus)lastFocus.focus();return true;
}
function execute(entry){
 if(!entry)return false;
 close();
 if(entry.kind==='view')return Boolean(window.ProfitLandsWorkspace?.show?.(entry.view));
 if(entry.kind==='business'){
  window.ProfitLandsWorkspace?.show?.('businesses');
  if(typeof window.openManage==='function'){window.openManage(entry.index);return true}
  return false;
 }
 if(entry.key==='buy'){
  window.ProfitLandsWorkspace?.show?.('businesses');$('openBusinessShop')?.click();return true;
 }
 if(entry.kind==='site'&&entry.url){
  const a=document.createElement('a');a.href=entry.url;a.target='_blank';a.rel='noopener noreferrer';
  document.body.appendChild(a);a.click();a.remove();return true;
 }
 return false;
}
function draw(){
 if(!ready)return;
 const options=items(input.value);
 results.replaceChildren();
 if(!options.length){
  const p=document.createElement('p');p.className='pl-switch-empty';p.textContent='No matching screens or companies.';results.appendChild(p);return;
 }
 selected=Math.max(0,Math.min(selected,options.length-1));
 options.forEach((item,index)=>{
  const b=document.createElement('button');b.type='button';b.className='pl-switch-result';
  if(index===selected)b.classList.add('selected');
  b.dataset.option=String(index);
  const copy=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
  name.textContent=item.label;hint.textContent=item.detail;
  copy.append(name,hint);
  const tag=document.createElement('span');tag.className='pl-switch-tag';tag.textContent=item.kind==='view'?'SCREEN':item.kind==='business'?'COMPANY':item.kind==='site'?'LINK':'ACTION';
  b.append(copy,tag);
  b.addEventListener('click',()=>execute(item));
  results.appendChild(b);
 });
}
function initialize(){
 const ws=window.ProfitLandsWorkspace;if(ready||!ws?.ready?.())return;
 const overlay=document.createElement('div');overlay.id='plQuickSwitch';overlay.className='pl-switch-overlay';overlay.hidden=true;
 overlay.innerHTML='<div class="pl-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="plSwitchTitle">'+
  '<header><span id="plSwitchTitle">Quick Switch</span><button type="button" class="pl-switch-close" aria-label="Close quick switch">ESC</button></header>'+
  '<div class="pl-switch-search"><span aria-hidden="true">⌕</span><input id="plSwitchInput" type="search" autocomplete="off" placeholder="Search screens, companies, WtvI..." aria-label="Search game screens and companies"></div>'+
  '<div id="plSwitchResults" class="pl-switch-results" aria-label="Search results"></div>'+
  '<footer><span>↑ ↓ Navigate</span><span>Enter Select</span><span>Ctrl K / ⌘ K Open</span></footer></div>';
 document.body.appendChild(overlay);
 modal=overlay;input=$('plSwitchInput');results=$('plSwitchResults');ready=true;
 overlay.addEventListener('mousedown',e=>{if(e.target===overlay)close()});
 overlay.querySelector('.pl-switch-close').addEventListener('click',close);
 input.addEventListener('input',()=>{selected=0;draw()});
 input.addEventListener('keydown',e=>{
  const options=items(input.value);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();if(!options.length)return;
   selected=(selected+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;draw();
   results.querySelector('.selected')?.scrollIntoView?.({block:'nearest'});
  }else if(e.key==='Enter'){e.preventDefault();execute(options[selected])}
 });
 window.addEventListener('keydown',e=>{
  const t=e.target,typing=t?.matches?.('input,textarea,select,[contenteditable="true"]');
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'&&isPlaying()){
   e.preventDefault();if(modal.hidden)open();else close();return;
  }
  if(e.key==='Escape'&&!modal.hidden){e.preventDefault();close();return}
  if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!typing&&modal.hidden&&isPlaying()){e.preventDefault();open()}
 });
 const menu=document.querySelector('#gameScreen .pl-workspace-sidebar-actions');
 if(menu){
  const b=document.createElement('button');b.type='button';b.className='pl-workspace-quick-button pl-workspace-secondary pl-switch-trigger';
  b.textContent='⌕ Quick Switch';b.title='Search screens and companies · Ctrl+K';
  b.addEventListener('click',open);menu.prepend(b);
 }
 const header=document.querySelector('#gameScreen .pl-workspace-section-head');
 if(header){
  const b=document.createElement('button');b.type='button';b.className='pl-switch-header-trigger';
  b.textContent='⌕ Search';b.setAttribute('aria-label','Open Quick Switch');
  b.addEventListener('click',open);header.appendChild(b);
 }
}
window.ProfitLandsQuickSwitch={items,open,close,execute,initialize,isReady:()=>ready};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
