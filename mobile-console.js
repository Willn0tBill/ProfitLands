/* ProfitLands mobile game dock: navigation only, no economy or save writes.
   The existing desktop workspace remains the fallback when JavaScript is unavailable. */
(function(){
'use strict';
const WIDTH_QUERY='(max-width: 760px)';
const $=id=>document.getElementById(id);
const primarySolo=[
 {id:'overview',icon:'⌂',label:'Home'},
 {id:'businesses',icon:'🏪',label:'Shops'},
 {id:'operations',icon:'⚙',label:'Manage'},
 {id:'arcade',icon:'🕹',label:'Arcade'}
];
const primaryOnline=[
 {id:'world',icon:'🌎',label:'World'},
 {id:'clans',icon:'🛡',label:'Clans'}
];
const secondaryGroups=[
 {name:'STRATEGY',views:['markets','analytics','finance']},
 {name:'GROW & COLLECT',views:['corporate','advances','trophies']}
];
const symbols={markets:'📈',analytics:'📊',finance:'🏦',corporate:'🏙',advances:'⚡',trophies:'🏆'};
let dock,overlay,drawer,more,grid,lastFocus=null,initialized=false,lastMode='';
const isOnline=()=>window.state?.playType==='multi';
const isPlaying=()=>!!$('gameScreen')?.classList.contains('active');
const workspace=()=>window.ProfitLandsWorkspace;
function make(tag,className,text){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=text;
 return el;
}
function navButton(item,className='pl-mobile-tab'){
 const b=make('button',className);
 b.type='button';
 b.dataset.mobileView=item.id;
 b.setAttribute('aria-label','Open '+item.label);
 const icon=make('span','pl-mobile-tab-icon',item.icon);
 icon.setAttribute('aria-hidden','true');
 const text=make('span','pl-mobile-tab-label',item.label);
 b.append(icon,text);
 b.addEventListener('click',()=>{
  if(!workspace()?.available?.(item.id))return;
  if(workspace().show(item.id,{focus:false}))close(false);
 });
 return b;
}
function close(restore=true){
 if(!overlay||overlay.hidden)return;
 overlay.hidden=true;
 document.body.classList.remove('pl-mobile-menu-open');
 more?.setAttribute('aria-expanded','false');
 if(restore&&lastFocus?.isConnected)lastFocus.focus?.();
 lastFocus=null;
}
function open(){
 if(!overlay||!isPlaying()||!window.matchMedia(WIDTH_QUERY).matches||isOnline())return false;
 lastFocus=document.activeElement;
 overlay.hidden=false;
 document.body.classList.add('pl-mobile-menu-open');
 more.setAttribute('aria-expanded','true');
 const first=drawer.querySelector('button[data-mobile-view]');
 first?.focus();
 return true;
}
function draw(){
 if(!dock||!grid)return;
 const multi=isOnline();
 lastMode=multi?'online':'solo';
 dock.dataset.mode=lastMode;
 dock.replaceChildren();
 const tabs=multi?primaryOnline:primarySolo;
 for(const tab of tabs)dock.appendChild(navButton(tab));
 if(!multi){
  more=make('button','pl-mobile-tab pl-mobile-more');
  more.type='button';
  more.id='plMobileMore';
  more.setAttribute('aria-label','More game sections');
  more.setAttribute('aria-haspopup','dialog');
  more.setAttribute('aria-controls','plMobileDrawer');
  more.setAttribute('aria-expanded','false');
  const icon=make('span','pl-mobile-tab-icon','☷');
  icon.setAttribute('aria-hidden','true');
  more.append(icon,make('span','pl-mobile-tab-label','More'));
  more.addEventListener('click',()=>{if(overlay.hidden)open();else close()});
  dock.appendChild(more);
 }
 grid.replaceChildren();
 const views=new Map((workspace()?.views||[]).map(view=>[view.id,view]));
 if(!multi){
  for(const group of secondaryGroups){
   const section=make('section','pl-mobile-drawer-group');
   section.appendChild(make('h3','',group.name));
   const options=make('div','pl-mobile-drawer-options');
   for(const id of group.views){
    const view=views.get(id);
    if(!view||!workspace().available(id))continue;
    const button=navButton({id,label:view.name,icon:symbols[id]},'pl-mobile-drawer-item');
    options.appendChild(button);
   }
   section.appendChild(options);
   grid.appendChild(section);
  }
 }
 close(false);
 updateActive();
}
function updateActive(){
 if(!dock)return;
 const active=workspace()?.active?.();
 const multi=isOnline();
 if(lastMode!==(multi?'online':'solo')){draw();return}
 dock.querySelectorAll('[data-mobile-view]').forEach(button=>{
  const selected=button.dataset.mobileView===active;
  button.classList.toggle('active',selected);
  if(selected)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
 grid.querySelectorAll('[data-mobile-view]').forEach(button=>{
  const selected=button.dataset.mobileView===active;
  button.classList.toggle('active',selected);
  if(selected)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
 if(more){
  const secondary=!primarySolo.some(v=>v.id===active);
  more.classList.toggle('active',secondary);
  if(secondary)more.setAttribute('aria-current','page');
  else more.removeAttribute('aria-current');
 }
 dock.setAttribute('aria-label',multi?'Multiplayer navigation':'Game navigation');
}
function sync(){
 if(!initialized)return;
 const active=isPlaying();
 if(!active)close(false);
 document.body.classList.toggle('pl-mobile-console-playing',active);
 if(lastMode!==(isOnline()?'online':'solo'))draw();
 updateActive();
}
function init(){
 if(initialized||!workspace()?.ready?.()||!$('gameScreen'))return;
 initialized=true;
 dock=make('nav','pl-mobile-dock');
 dock.id='plMobileDock';
 dock.setAttribute('aria-label','Game navigation');
 overlay=make('div','pl-mobile-drawer-overlay');
 overlay.id='plMobileOverlay';
 overlay.hidden=true;
 const backdrop=make('button','pl-mobile-drawer-backdrop');
 backdrop.type='button';
 backdrop.setAttribute('aria-label','Close game sections');
 backdrop.addEventListener('click',()=>close());
 drawer=make('section','pl-mobile-drawer');
 drawer.id='plMobileDrawer';
 drawer.setAttribute('role','dialog');
 drawer.setAttribute('aria-modal','true');
 drawer.setAttribute('aria-labelledby','plMobileDrawerTitle');
 const header=make('div','pl-mobile-drawer-head');
 const title=make('h2','', 'All game sections');
 title.id='plMobileDrawerTitle';
 const dismiss=make('button','pl-mobile-drawer-close','Done');
 dismiss.type='button';
 dismiss.addEventListener('click',()=>close());
 header.append(title,dismiss);
 grid=make('div','pl-mobile-drawer-content');
 drawer.append(header,grid);
 overlay.append(backdrop,drawer);
 document.body.append(dock,overlay);
 document.body.classList.add('pl-mobile-console-ready');
 document.addEventListener('keydown',event=>{
  if(overlay.hidden)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
  if(event.key!=='Tab')return;
  const focusable=[...drawer.querySelectorAll('button:not([disabled])')].filter(x=>!x.hidden);
  const first=focusable[0],last=focusable.at(-1);
  if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 window.addEventListener('profitlands:viewchange',()=>{close(false);updateActive()});
 document.addEventListener('click',event=>{
  if(event.target?.closest?.('.type-card,#endGame,#startGame,#confirmEndGame'))queueMicrotask(sync);
 });
 const game=$('gameScreen');
 if(typeof MutationObserver==='function'){
  const observer=new MutationObserver(sync);
  observer.observe(game,{attributes:true,attributeFilter:['class']});
 }
 window.addEventListener('resize',()=>{
  if(!window.matchMedia(WIDTH_QUERY).matches)close(false);
 });
 draw();sync();
}
window.ProfitLandsMobileConsole={
 init,close,open,refresh:sync,
 diagnostics:()=>({ready:initialized,playing:isPlaying(),online:isOnline(),drawerOpen:!!overlay&&!overlay.hidden,active:workspace()?.active?.()})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();