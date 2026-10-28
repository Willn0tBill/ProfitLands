/* ProfitLands layout manager: visual state only, independent of game saves.
   All existing game UI remains in the DOM when minimized, and can be restored. */
(function(){
'use strict';
const isDemo=Boolean(document.body?.classList?.contains('pl-demo-page'));
const KEY=isDemo?'profitlands-layout-preview-v1':'profitlands-layout-v1';
const defs=[
  {id:'dashboard',label:'Empire Dashboard',open:true,kind:'hud'},
  {id:'empireLab',label:'Empire Operations',open:false},
  {id:'growthPanel',label:'Analytics & Growth',open:false},
  {id:'economyPanel',label:'World Economy',open:false},
  {id:'businessPanel',label:'Businesses',open:true,kind:'legacy'},
  {id:'stockPanel',label:'Stocks',open:true,kind:'legacy'},
  {id:'majorCompaniesPanel',label:'Major Companies',open:false},
  {id:'actionsPanel',label:'Other Investments',open:false,kind:'legacy'},
  {id:'holdingsPanel',label:'Holdings',open:false,kind:'legacy'},
  {id:'newsPanel',label:'Latest News',open:false,kind:'legacy'},
  {id:'financePanel',label:'Company Finances',open:false,kind:'legacy'},
  {id:'bankPanel',label:'Bank & Credit',open:false}
];
const $=id=>document.getElementById(id);
const panels=new Map();
let prefs={};
try{
  const stored=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored))prefs=stored;
}catch(e){prefs={}}
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(prefs))}
  catch(e){/* Storage disabled or full; controls still work this session. */}
}
function readable(open,label){return (open?'Minimize ':'Expand ')+label}
function setupPanel(config){
  const panel=config.kind==='hud'?document.querySelector('#gameScreen .game-hud'):$(config.id);
  if(!panel)return;
  let trigger,content;
  if(config.kind==='legacy'){
    trigger=panel.querySelector('.panel-toggle');
    if(!trigger)return;
    const body=panel.querySelector('.panel-body');
    if(body){
      if(!body.id)body.id='pl-content-'+config.id;
      trigger.setAttribute('aria-controls',body.id);
    }
  }else if(config.kind==='hud'){
    trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='pl-layout-toggle pl-hud-toggle';
    document.querySelector('#gameScreen .game-controls')?.prepend(trigger);
    trigger.addEventListener('click',()=>setOpen(config.id,!isOpen(config.id)));
  }else{
    const header=panel.querySelector(':scope > .panel-head');
    if(!header)return;
    content=document.createElement('div');
    content.className='pl-panel-content';
    content.id='pl-content-'+config.id;
    for(const child of Array.from(panel.children))if(child!==header)content.appendChild(child);
    panel.appendChild(content);
    trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='pl-layout-toggle';
    trigger.setAttribute('aria-controls',content.id);
    header.appendChild(trigger);
    trigger.addEventListener('click',()=>setOpen(config.id,!isOpen(config.id)));
  }
  if(!trigger)return;
  panels.set(config.id,{...config,panel,trigger,content});
  if(config.kind==='legacy'){
    // Existing collapse script owns the click. Synchronize our saved layout
    // after its handler has changed the panel's .open state.
    const sync=()=>setOpen(config.id,panel.classList.contains('open'));
    trigger.addEventListener('click',sync);
    trigger.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(config.id,false)});
  }
  const initial=typeof prefs[config.id]==='boolean'?prefs[config.id]:(isDemo&&config.id==='empireLab'?true:config.open);
  setOpen(config.id,initial,false);
}
function isOpen(id){
  const x=panels.get(id);
  if(!x)return false;
  return x.kind==='legacy'?x.panel.classList.contains('open'):!x.panel.classList.contains('pl-panel-minimized');
}
function setOpen(id,open,remember=true){
  const x=panels.get(id);
  if(!x)return false;
  open=Boolean(open);
  if(x.kind==='legacy'){
    x.panel.classList.toggle('open',open);
    const body=x.panel.querySelector('.panel-body');
    if(body){body.inert=!open;body.setAttribute('aria-hidden',String(!open))}
  }
  else x.panel.classList.toggle('pl-panel-minimized',!open);
  if(x.content)x.content.hidden=!open;
  x.trigger.setAttribute('aria-expanded',String(open));
  if(x.kind==='legacy')x.trigger.setAttribute('aria-label',readable(open,x.label));
  else{
    x.trigger.textContent=open?'− Minimize':'+ Expand';
    x.trigger.setAttribute('aria-label',readable(open,x.label));
    x.trigger.title=readable(open,x.label);
  }
  if(remember){prefs[id]=open;persist()}
  refreshCount();
  return true;
}
function all(open){
  for(const id of panels.keys())setOpen(id,open,false);
  prefs=Object.fromEntries([...panels.keys()].map(id=>[id,open]));
  persist();refreshCount();
}
function defaults(){
  prefs={};
  for(const d of defs)setOpen(d.id,isDemo&&d.id==='empireLab'?true:d.open,false);
  try{localStorage.removeItem(KEY)}catch(e){}
  refreshCount();
}
function refreshCount(){
  const counter=$('plLayoutCount');
  if(!counter)return;
  const n=[...panels.keys()].filter(id=>isOpen(id)).length;
  counter.textContent=n+' of '+panels.size+' sections expanded';
}
function openFromHash(hash){
  const id=decodeURIComponent(String(hash||'').replace(/^#/,''));
  if(!id)return;
  if(panels.has(id)){setOpen(id,true);return}
  const target=$(id);
  if(!target)return;
  const section=target.closest('#gameScreen .panel');
  if(section?.id&&panels.has(section.id))setOpen(section.id,true);
}
function setupModalMinimize(){
  const modal=$('manageModal'),card=modal?.querySelector('.modal-card');
  if(!modal||!card)return;
  const button=document.createElement('button');
  button.type='button';button.className='pl-modal-minimize';
  button.textContent='− Minimize';
  button.setAttribute('aria-label','Minimize company management window');
  const close=card.querySelector('.modal-close');
  if(close)close.after(button);else card.prepend(button);
  const restore=document.createElement('button');
  restore.type='button';restore.id='plRestoreManage';restore.className='pl-modal-restore';
  restore.textContent='↑ Restore company window';
  restore.hidden=true;
  document.body.appendChild(restore);
  button.addEventListener('click',()=>{
    modal.classList.add('hidden');restore.hidden=false;restore.focus();
  });
  restore.addEventListener('click',()=>{
    restore.hidden=true;modal.classList.remove('hidden');
    button.focus();
  });
  if(typeof MutationObserver==='function'){
    new MutationObserver(()=>{
      if(!modal.classList.contains('hidden'))restore.hidden=true;
    }).observe(modal,{attributes:true,attributeFilter:['class']});
  }
}
function init(){
  for(const config of defs)setupPanel(config);
  $('plMinimizeAll')?.addEventListener('click',()=>all(false));
  $('plExpandAll')?.addEventListener('click',()=>all(true));
  $('plDefaultLayout')?.addEventListener('click',defaults);
  // Clicking a section link expands that destination automatically.
  for(const link of document.querySelectorAll('.growth-quicknav a[href^="#"]')){
    link.addEventListener('click',()=>openFromHash(link.getAttribute('href')));
  }
  window.addEventListener('hashchange',()=>openFromHash(location.hash));
  openFromHash(location.hash);
  setupModalMinimize();
  refreshCount();
}
window.ProfitLandsLayout={open:id=>setOpen(id,true),minimize:id=>setOpen(id,false),toggle:id=>setOpen(id,!isOpen(id)),isOpen,all,defaults};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();