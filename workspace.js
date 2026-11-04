/* ProfitLands Tycoon World — simplified game menu with all existing features.
   Moves the EXISTING panels: no duplicate IDs, game state or save migration.
   Page scrolling is locked only while the game screen is active.
*/
(function(){
'use strict';
const KEY='profitlands-workspace-view-v2';
const VIEWS=[
 {id:'overview',number:'01',name:'Overview',title:'Your Tycoon World',description:'Pick your next move and build your empire.',group:'PLAY',panels:['executivePanel','economyPanel','newsPanel']},
 {id:'businesses',number:'02',name:'Businesses',title:'Build & Upgrade',description:'Buy shops, improve locations and grow your chain.',group:'PLAY',panels:['businessPanel']},
 {id:'operations',number:'03',name:'Operations',title:'Run Your Shops',description:'Staff, products, deliveries and new districts.',group:'PLAY',panels:['empireLab']},
 {id:'markets',number:'04',name:'Markets',title:'Trading Market',description:'Trade stocks and follow your holdings.',group:'ADVANCED',panels:['stockPanel','holdingsPanel']},
 {id:'analytics',number:'05',name:'Analytics',title:'Empire Stats',description:'Track your income, people and growth.',group:'ADVANCED',panels:['growthPanel']},
 {id:'finance',number:'06',name:'Finances',title:'Money & Loans',description:'View profits, debts and recovery options.',group:'ADVANCED',panels:['financePanel','bankPanel']},
 {id:'corporate',number:'07',name:'Corporate',title:'Big Business',description:'Unlock huge companies and new investments.',group:'GROW',panels:['majorCompaniesPanel','actionsPanel']},
 {id:'arcade',number:'08',name:'Arcade',title:'Mini-Game Arcade',description:'Play short challenges to earn rewards.',group:'GROW',panels:['arcadePanel']},
 {id:'advances',number:'09',name:'Advances',title:'Power-Ups',description:'Unlock upgrades and reach milestones.',group:'GROW',panels:['advancesPanel']},
 {id:'trophies',number:'10',name:'Trophies',title:'Trophy Room',description:'Collect badges for your achievements.',group:'GROW',panels:['trophyPanel']},
 {id:'clans',number:'11',name:'Clans',title:'Clans & Friends',description:'Create or join an online tycoon clan with an account.',group:'SOCIAL',panels:['clanPanel']}
];
const $=id=>document.getElementById(id);
let current='overview';
let shell,body,nav,heading,subtitle,context,toolbar,buttonMap=new Map(),viewMap=new Map(),initialized=false;
let guideTitle=null,guideText=null,guideButton=null,advancedDisclosure=null,socialHeading=null;
const isMultiplayer=()=>window.state?.playType==='multi';
const available=id=>id!=='clans'||isMultiplayer();
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
function updateGuide(){
 if(!guideTitle)return;
 const count=window.state?.businesses?.length||0;
 guideTitle.textContent=count?'Your empire is growing!':'Your first mission: open a business';
 guideText.textContent=count?'You own '+count+' business'+(count===1?'':'es')+'. Upgrade your shops, explore districts, or play a mini-game.':'Start small. Open a shop, make your first earnings, then upgrade it. You can explore the other menus later.';
 guideButton.textContent=count?'Manage my shops':'Open my first shop';
}
function save(){
 try{localStorage.setItem(KEY,current)}catch(e){}
}
function show(id,{focus=false,remember=true}={}){
 if(!initialized||!available(id))return false;
 const view=VIEWS.find(x=>x.id===id);
 if(!view)return false;
 current=id;
 if(view.group==='ADVANCED'&&advancedDisclosure)advancedDisclosure.open=true;
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
 // Offscreen cards are refreshed on demand as soon as their workspace opens.
 if(id==='businesses')window.renderBusinesses?.();
 if(id==='finance')window.renderFinance?.();
 if(id==='markets')window.renderHoldings?.();
 if(id==='overview'){updateGuide();window.ProfitLandsExecutive?.render?.()}
 if(id==='analytics')window.ProfitLandsGrowth?.render?.();
 if(id==='operations')window.ProfitLandsEmpire?.render?.();
 if(id==='arcade')window.ProfitLandsArcade?.render?.();
 if(id==='advances')window.ProfitLandsAdvancements?.render?.();
 if(id==='trophies'){window.ProfitLandsBadges?.scan?.(Date.now(),true);window.ProfitLandsBadges?.render?.()}
 if(id==='clans')window.ProfitLandsClans?.render?.();
 if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('profitlands:viewchange',{detail:{view:id}}));
 return true;
}
function makeNav(){
 nav=element('nav','pl-workspace-nav');nav.setAttribute('aria-label','Tycoon game menu');
 const title=element('div','pl-workspace-nav-title','🎮 GAME MENU');nav.appendChild(title);
 let lastGroup='',groupTarget=nav;
 for(const view of VIEWS){
  if(view.group!==lastGroup){
   lastGroup=view.group;groupTarget=nav;
   if(view.group==='ADVANCED'){
     advancedDisclosure=element('details','pl-workspace-advanced-nav');
     advancedDisclosure.open=VIEWS.find(v=>v.id===current)?.group==='ADVANCED';
     advancedDisclosure.appendChild(element('summary','','⚙ MORE TOOLS'));
     nav.appendChild(advancedDisclosure);
     groupTarget=advancedDisclosure;
   }else{
     const groupHeading=element('div','pl-workspace-nav-group',lastGroup);
     if(view.group==='SOCIAL')socialHeading=groupHeading;
     nav.appendChild(groupHeading);
   }
  }
  const btn=element('button','pl-workspace-nav-item');
  btn.type='button';btn.dataset.workspaceView=view.id;
   if(view.id==='clans')btn.hidden=!isMultiplayer();
  btn.setAttribute('aria-label','Open '+view.name);
  const icons={overview:'🏠',businesses:'🏪',operations:'🚚',markets:'📈',analytics:'📊',finance:'🏦',corporate:'🏙️',arcade:'🕹️',advances:'⚡',trophies:'🏆',clans:'🛡️'};
  const index=element('span','pl-workspace-nav-index',icons[view.id]||view.number);
  const name=element('span','pl-workspace-nav-label',view.name);
  const indicator=element('span','pl-workspace-nav-indicator','›');
  btn.append(index,name,indicator);
  btn.addEventListener('click',()=>show(view.id,{focus:false}));
  groupTarget.appendChild(btn);
  buttonMap.set(view.id,btn);
 }
 const actions=element('div','pl-workspace-sidebar-actions');
 const toolsHeading=element('span','pl-workspace-nav-group','QUICK PLAY');
 actions.appendChild(toolsHeading);
 const buy=element('button','pl-workspace-quick-button','+ New business');
 buy.type='button';buy.addEventListener('click',()=>{
  show('businesses');$('openBusinessShop')?.click();
 });
 actions.appendChild(buy);
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
  grid.dataset.columns=String(view.id==='overview'?1:view.panels.length);
  if(view.id==='overview'){
   const welcome=element('div','pl-workspace-intro pl-quest-card');
   const introCopy=element('div','pl-workspace-intro-copy');
   introCopy.appendChild(element('span','pl-workspace-eyebrow','🎯 YOUR NEXT QUEST'));
   guideTitle=element('h3','','Your first mission: open a business');
   guideText=element('p','','Start small. Open a shop, make your first earnings, then upgrade it.');
   introCopy.append(guideTitle,guideText);
   welcome.appendChild(introCopy);
   guideButton=element('button','pl-workspace-intro-button','Open my first shop');
   guideButton.type='button';
   guideButton.addEventListener('click',()=>{
     const hasShop=Boolean(window.state?.businesses?.length);
     show('businesses');
     if(!hasShop)$('openBusinessShop')?.click();
   });
   welcome.appendChild(guideButton);region.appendChild(welcome);
   const steps=element('div','pl-game-steps');
   for(const [icon,title,description,action] of [
     ['🏪','1. Buy a shop','Your first business starts earning cash.','businesses'],
     ['⬆️','2. Upgrade it','Add staff and improve locations.','businesses'],
     ['🎮','3. Have fun','Try mini-games and unlock trophies.','arcade']
   ]){
     const button=element('button','pl-game-step');button.type='button';
     button.append(element('span','pl-game-step-icon',icon));
     const copy=element('span','pl-game-step-copy');
     copy.append(element('strong','',title),element('small','',description));button.appendChild(copy);
     button.addEventListener('click',()=>{show(action);if(action==='businesses'&&title.startsWith('1.'))$('openBusinessShop')?.click()});
     steps.appendChild(button);
   }
   region.appendChild(steps);
  }
  let advanced=null;
  for(const id of view.panels){
   const panel=$(id);
   if(!panel)continue;
   if(view.id==='overview'){
     if(!advanced){
       advanced=element('details','pl-game-advanced');
       const summary=element('summary','','World news, reports & market details');
       advanced.appendChild(summary);grid.appendChild(advanced);
     }
     advanced.appendChild(panel);
   }else grid.appendChild(panel);
  }
  region.appendChild(grid);
  body.appendChild(region);
  viewMap.set(view.id,region);
 }
 return body;
}
function syncMode(){
 const active=isMultiplayer();
 const clanButton=buttonMap.get('clans');
 if(clanButton)clanButton.hidden=!active;
 if(socialHeading)socialHeading.hidden=!active;
 if(initialized&&current==='clans'&&!active)show('overview',{remember:false});
 return active;
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
 headText.appendChild(element('span','pl-workspace-eyebrow','PROFITLANDS / TYCOON WORLD'));
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
 // The workspace replaces the old jump-link navigation. Keeping both visible
 // makes the game feel duplicated and increases accidental layout changes.
 const oldSectionLinks=$('plSectionLinks');
 if(oldSectionLinks)oldSectionLinks.hidden=true;
 initialized=true;
 const fromHash=viewFromHash(location.hash);
 syncMode();
 const requested=fromHash||current;
 show(available(requested)?requested:'overview',{remember:false});
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
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(/^[1-9]$/.test(e.key)||e.key==='0'||e.key.toLowerCase()==='c')){
   if(e.target?.closest?.('input,textarea,select,[contenteditable]'))return;
   e.preventDefault();show(e.key.toLowerCase()==='c'?'clans':VIEWS[e.key==='0'?9:Number(e.key)-1].id,{focus:true});
  }
 });
}
window.ProfitLandsWorkspace={
 show,active:()=>current,viewForPanel,available,syncMode,
 views:VIEWS.map(v=>({id:v.id,name:v.name,panels:v.panels.slice()})),
 ready:()=>initialized
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
else build();
})();