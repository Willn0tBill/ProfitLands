/* ProfitLands Professional Workspace — one-window business management UI.
   Moves the EXISTING panels: no duplicate IDs, game state or save migration.
   Page scrolling is locked only while the game screen is active.
*/
(function(){
'use strict';
const KEY='profitlands-workspace-view-v1';
const VIEWS=[
 {id:'businesses',number:'01',name:'Businesses',title:'Business Portfolio',description:'Companies, branches, staffing and new acquisitions.',group:'MANAGEMENT',panels:['businessPanel']},
 {id:'overview',number:'02',name:'Overview',title:'Command Center',description:'Current economy, market events and recent news.',group:'MANAGEMENT',panels:['economyPanel','newsPanel']},
 {id:'operations',number:'03',name:'Operations',title:'Operations & Supply',description:'Inventory, staff roles, logistics and regional expansion.',group:'MANAGEMENT',panels:['empireLab']},
 {id:'markets',number:'04',name:'Markets',title:'Market & Portfolio',description:'Stock exchange, positions and holdings.',group:'FINANCE',panels:['stockPanel','holdingsPanel']},
 {id:'analytics',number:'05',name:'Analytics',title:'Business Intelligence',description:'Revenue charts, employees, decisions and achievements.',group:'FINANCE',panels:['growthPanel']},
 {id:'finance',number:'06',name:'Finances',title:'Financial Management',description:'Company performance, bank services and credit.',group:'FINANCE',panels:['financePanel','bankPanel']},
 {id:'corporate',number:'07',name:'Corporate',title:'Corporate Development',description:'Major companies, research and capital investments.',group:'EXPANSION',panels:['majorCompaniesPanel','actionsPanel']},
 {id:'arcade',number:'08',name:'Arcade',title:'Business Arcade',description:'Three playable management mini-games, with small rewards for your empire.',group:'EXPANSION',panels:['arcadePanel']},
 {id:'advances',number:'09',name:'Advances',title:'Advancements & Milestones',description:'Permanent technology upgrades and business level unlocks.',group:'EXPANSION',panels:['advancesPanel']},
 {id:'trophies',number:'10',name:'Trophies',title:'Trophy Room',description:'131,072 collectible in-game achievement badges.',group:'EXPANSION',panels:['trophyPanel']}
];
const $=id=>document.getElementById(id);
let current='businesses';
let shell,body,nav,heading,subtitle,context,toolbar,buttonMap=new Map(),viewMap=new Map(),initialized=false;
try{const previous=localStorage.getItem(KEY);if(VIEWS.some(v=>v.id===previous))current=previous}catch(e){}
function element(tag,className,text){
 const e=document.createElement(tag);
 if(className)e.className=className;
 if(text!==undefined)e.textContent=text;
 return e;
}
function viewForPanel(panelId){
 const result=VIEWS.find(v=>v.panels.includes(panelId));
 return result?.id||null;
}
function viewFromHash(hash){
 const id=String(hash||'').replace(/^#/,'');
 if(!id)return null;
 if(VIEWS.some(v=>v.id===id))return id;
 if(viewForPanel(id))return viewForPanel(id);
 const target=$(id);
 if(!target)return null;
 const panel=target.closest?.('#gameScreen .panel');
 return panel?.id?viewForPanel(panel.id):null;
}
function save(){
 try{localStorage.setItem(KEY,current)}catch(e){}
}
function show(id,{focus=false,remember=true}={}){
 if(!initialized)return false;
 const view=VIEWS.find(x=>x.id===id);
 if(!view)return false;
 current=id;
 for(const [key,section]of viewMap){
  const active=key===id;
  section.hidden=!active;
  section.classList.toggle('active',active);
  section.setAttribute('aria-hidden',String(!active));
  section.inert=!active;
 }
 for(const [key,btn]of buttonMap){
  const selected=key===id;
  btn.classList.toggle('active',selected);
  if(selected)btn.setAttribute('aria-current','page');
  else btn.removeAttribute('aria-current');
 }
 heading.textContent=view.title;
 subtitle.textContent=view.description;
 context.textContent=view.name;
 const activePanel=view.panels[0];
 if(activePanel)window.ProfitLandsLayout?.open?.(activePanel);
 if(view.panels.length===2)window.ProfitLandsLayout?.open?.(view.panels[1]);
 const selected=viewMap.get(id);
 selected?.scrollTo?.({top:0,behavior:'instant'});
 if(focus)heading.focus({preventScroll:true});
 if(remember)save();
 if(id==='analytics')window.ProfitLandsGrowth?.render?.();
 if(id==='operations')window.ProfitLandsEmpire?.render?.();
 if(id==='arcade')window.ProfitLandsArcade?.render?.();
 if(id==='advances')window.ProfitLandsAdvancements?.render?.();
 if(id==='trophies'){window.ProfitLandsBadges?.scan?.(Date.now(),true);window.ProfitLandsBadges?.render?.()}
 if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('profitlands:viewchange',{detail:{view:id}}));
 return true;
}
function makeNav(){
 nav=element('nav','pl-workspace-nav');nav.setAttribute('aria-label','Business management');
 const title=element('div','pl-workspace-nav-title','WORKSPACE');nav.appendChild(title);
 let lastGroup='';
 for(const view of VIEWS){
  if(view.group!==lastGroup){
   lastGroup=view.group;
   nav.appendChild(element('div','pl-workspace-nav-group',lastGroup));
  }
  const btn=element('button','pl-workspace-nav-item');
  btn.type='button';btn.dataset.workspaceView=view.id;
  btn.setAttribute('aria-label','Open '+view.name);
  const index=element('span','pl-workspace-nav-index',view.number);
  const name=element('span','pl-workspace-nav-label',view.name);
  const indicator=element('span','pl-workspace-nav-indicator','›');
  btn.append(index,name,indicator);
  btn.addEventListener('click',()=>show(view.id,{focus:false}));
  nav.appendChild(btn);
  buttonMap.set(view.id,btn);
 }
 const actions=element('div','pl-workspace-sidebar-actions');
 const toolsHeading=element('span','pl-workspace-nav-group','QUICK ACTIONS');
 actions.appendChild(toolsHeading);
 const buy=element('button','pl-workspace-quick-button','+ New business');
 buy.type='button';buy.addEventListener('click',()=>{
  show('businesses');$('openBusinessShop')?.click();
 });
 actions.appendChild(buy);
 const compact=element('button','pl-workspace-quick-button pl-workspace-secondary','Dashboard layout');
 compact.type='button';
 compact.addEventListener('click',()=>{
  if(!toolbar)return;
  toolbar.hidden=!toolbar.hidden;
  compact.setAttribute('aria-expanded',String(!toolbar.hidden));
 });
 compact.setAttribute('aria-expanded','false');
 actions.appendChild(compact);
 const oldToolbar=document.querySelector('#gameScreen .pl-view-toolbar');
 if(oldToolbar){toolbar=oldToolbar;oldToolbar.hidden=true;actions.appendChild(oldToolbar)}
 nav.appendChild(actions);
 return nav;
}
function makeViews(game){
 body=element('div','pl-workspace-body');
 for(const view of VIEWS){
  const region=element('section','pl-workspace-view');
  region.dataset.workspaceContent=view.id;
  region.setAttribute('aria-label',view.title);
  region.setAttribute('role','region');
  region.hidden=true;
  const grid=element('div','pl-workspace-panels');
  grid.dataset.columns=String(view.panels.length);
  if(view.id==='overview'){
   const welcome=element('div','pl-workspace-intro');
   const introCopy=element('div','pl-workspace-intro-copy');
   introCopy.appendChild(element('span','pl-workspace-eyebrow','DAILY BRIEFING'));
   introCopy.appendChild(element('h3','', 'Your empire, at a glance'));
   introCopy.appendChild(element('p','', 'Track market conditions and keep up with business developments without leaving the workspace.'));
   welcome.appendChild(introCopy);
   const go=element('button','pl-workspace-intro-button','View businesses');
   go.type='button';go.addEventListener('click',()=>show('businesses'));
   welcome.appendChild(go);region.appendChild(welcome);
  }
  for(const id of view.panels){
   const panel=$(id);
   if(panel)grid.appendChild(panel);
  }
  region.appendChild(grid);
  body.appendChild(region);
  viewMap.set(view.id,region);
 }
 return body;
}
function build(){
 if(initialized)return;
 const game=$('gameScreen');
 if(!game)return;
 const existingHud=game.querySelector('.game-hud');
 const layout=element('div','pl-workspace-shell');
 const side=element('aside','pl-workspace-sidebar');
 side.appendChild(makeNav());
 const main=element('div','pl-workspace-main');
 const hudArea=element('div','pl-workspace-hud');
 if(existingHud)hudArea.appendChild(existingHud);
 const header=element('header','pl-workspace-section-head');
 const headText=element('div','pl-workspace-section-head-copy');
 headText.appendChild(element('span','pl-workspace-eyebrow','PROFITLANDS / MANAGEMENT'));
 heading=element('h2','pl-workspace-section-title','Business Portfolio');
 heading.tabIndex=-1;
 subtitle=element('p','pl-workspace-section-description','Manage your business empire.');
 headText.append(heading,subtitle);header.appendChild(headText);
 context=element('span','pl-workspace-context','Businesses');
 header.appendChild(context);
 main.append(hudArea,header,makeViews(game));
 layout.append(side,main);
 game.appendChild(layout);
 shell=layout;
 document.body.classList.add('pl-workspace-enabled');
 initialized=true;
 const fromHash=viewFromHash(location.hash);
 show(fromHash||current,{remember:false});
 const oldLinks=document.querySelectorAll('#gameScreen .growth-quicknav a[href^="#"]');
 for(const a of oldLinks)a.addEventListener('click',()=>{
  const v=viewFromHash(a.getAttribute('href'));
  if(v)show(v);
 });
 window.addEventListener('hashchange',()=>{
  const v=viewFromHash(location.hash);
  if(v)show(v);
 });
 // Avoid background clipping on an active modal, and keep the current
 // screen unchanged when the user returns to the main menu.
 window.addEventListener('keydown',e=>{
  if(!document.querySelector('#gameScreen.active'))return;
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(/^[1-9]$/.test(e.key)||e.key==='0')){
   if(e.target?.closest?.('input,textarea,select,[contenteditable]'))return;
   e.preventDefault();show(VIEWS[e.key==='0'?9:Number(e.key)-1].id,{focus:true});
  }
 });
}
window.ProfitLandsWorkspace={
 show,active:()=>current,viewForPanel,
 views:VIEWS.map(v=>({id:v.id,name:v.name,panels:v.panels.slice()})),
 ready:()=>initialized
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
else build();
})();