/* ProfitLands — Wtv Innovations Executive Quick Switch.
   Native keyboard/touch navigation, no changes to game state or saves. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let modal,input,results,selected=0,lastFocus=null,ready=false;
const studio='https://willn0tbill.github.io/WtvStudios/';
const sortTitle=(a,b)=>a.label.localeCompare(b.label);
const recentKeys=[];
const defaultKeys=['overview','businesses','operations','markets','analytics','trophies','buy','settings','wtvi','nation'];
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const identity=item=>item.kind+':'+item.key+(item.kind==='business'?':'+item.label:'');
function remember(item){
 const key=identity(item),index=recentKeys.indexOf(key);
 if(index!==-1)recentKeys.splice(index,1);
 recentKeys.unshift(key);
 if(recentKeys.length>5)recentKeys.length=5;
}
function rank(item,query){
 const name=normalize(item.label),detail=normalize(item.detail);
 if(name===query)return 0;
 if(name.startsWith(query))return 1;
 if(name.includes(query))return 2;
 const words=query.split(/\s+/).filter(Boolean);
 if(words.every(word=>name.includes(word)))return 3;
 if(words.every(word=>(name+' '+detail).includes(word)))return 4;
 return 99;
}
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
 entries.push({kind:'action',key:'settings',label:'Save & Recovery',detail:'Manual save, backup export, restore and display settings',order:51});
 entries.push({kind:'site',key:'wtvi',label:'Wtv Innovations',detail:'Visit studio portfolio',url:studio,order:60});
 entries.push({kind:'site',key:'nation',label:'Nation Wars',detail:'Open WtvI strategy game',url:'https://willn0tbill.github.io/NationWars/',order:61});
 const q=normalize(String(query||'').slice(0,120));
 if(!q){
  // Reserve visible slots for the market, backup and studio shortcuts even
  // when the player owns many businesses. Everything stays searchable.
  const priority=item=>{
   const recent=recentKeys.indexOf(identity(item));
   if(recent!==-1)return recent;
   const pinned=defaultKeys.indexOf(item.key);
   if(pinned!==-1)return 10+pinned;
   if(item.kind==='business')return 30+item.index;
   return 100+item.order;
  };
  return entries.sort((a,b)=>priority(a)-priority(b)||a.order-b.order).slice(0,12);
 }
 const scored=entries.map(x=>({...x,score:rank(x,q)}))
  .filter(x=>x.score<99)
  .sort((a,b)=>a.score-b.score||a.order-b.order||sortTitle(a,b));
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
function success(entry,result){
 if(result)remember(entry);
 return Boolean(result);
}
function execute(entry){
 if(!entry)return false;
 close();
 if(entry.kind==='view')return success(entry,window.ProfitLandsWorkspace?.show?.(entry.view));
 if(entry.kind==='business'){
  window.ProfitLandsWorkspace?.show?.('businesses');
  if(typeof window.openManage==='function'){window.openManage(entry.index);return success(entry,true)}
  return false;
 }
 if(entry.key==='buy'){
  window.ProfitLandsWorkspace?.show?.('businesses');const button=$('openBusinessShop');button?.click();return success(entry,Boolean(button));
 }
 if(entry.key==='settings'){
  const settings=$('openSettings');
  if(!settings)return false;
  settings.click();return success(entry,true);
 }
 if(entry.kind==='site'&&entry.url){
  const a=document.createElement('a');a.href=entry.url;a.target='_blank';a.rel='noopener noreferrer';
  document.body.appendChild(a);a.click();a.remove();return success(entry,true);
 }
 return false;
}
function draw(){
 if(!ready)return;
 const options=items(input.value);
 results.replaceChildren();
 results.setAttribute?.('aria-label',options.length+' matching destinations');
 if(!options.length){
  input.removeAttribute?.('aria-activedescendant');
  const p=document.createElement('p');p.className='pl-switch-empty';p.textContent='No matching screens or companies. Try a screen name or business type.';results.appendChild(p);return;
 }
 selected=Math.max(0,Math.min(selected,options.length-1));
 options.forEach((item,index)=>{
  const b=document.createElement('button');b.type='button';b.className='pl-switch-result';
  if(index===selected)b.classList.add('selected');
  b.dataset.option=String(index);
  b.id='plSwitchOption-'+index;
  b.setAttribute?.('role','option');
  b.setAttribute?.('aria-selected',String(index===selected));
  const copy=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
  name.textContent=item.label;hint.textContent=item.detail;
  copy.append(name,hint);
  const tag=document.createElement('span');tag.className='pl-switch-tag';tag.textContent=item.kind==='view'?'SCREEN':item.kind==='business'?'COMPANY':item.kind==='site'?'LINK':'ACTION';
  b.append(copy,tag);
  b.addEventListener('click',()=>execute(item));
  results.appendChild(b);
 });
 input.setAttribute?.('aria-activedescendant','plSwitchOption-'+selected);
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
 input.setAttribute?.('role','combobox');
 input.setAttribute?.('aria-autocomplete','list');
 input.setAttribute?.('aria-expanded','true');
 input.setAttribute?.('aria-controls','plSwitchResults');
 results.setAttribute?.('role','listbox');
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
 // Capture these keystrokes BEFORE the document-level backdrop dismissor.
 // Otherwise Escape can dismiss both Quick Switch and an underlying game modal.
 window.addEventListener('keydown',e=>{
  const t=e.target,typing=t?.matches?.('input,textarea,select,[contenteditable="true"]');
  if(!modal.hidden&&e.key==='Escape'){
   e.preventDefault();e.stopPropagation?.();close();return;
  }
  if(!modal.hidden&&e.key==='Tab'){
   const focusable=[...modal.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el=>!el.hidden);
   const first=focusable[0],last=focusable[focusable.length-1];
   if(first&&last){
    if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){
     e.preventDefault();last.focus();
    }else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){
     e.preventDefault();first.focus();
    }
   }
   return;
  }
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'&&isPlaying()){
   e.preventDefault();e.stopPropagation?.();
   if(modal.hidden)open();else close();
   return;
  }
  if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!typing&&modal.hidden&&isPlaying()){e.preventDefault();open()}
 },true);
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
