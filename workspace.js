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
 {id:'world',number:'11',name:'World',title:'World 1 · Multiplayer',description:'Compete for money, challenge rivals and meet other players.',group:'SOCIAL',panels:['worldPanel']},
 {id:'clans',number:'12',name:'Clans',title:'Clans & Friends',description:'Form a multiplayer tycoon clan with an account.',group:'SOCIAL',panels:['clanPanel']}
];
const $=id=>document.getElementById(id);
let current='overview';
let shell,body,nav,heading,subtitle,context,toolbar,buttonMap=new Map(),viewMap=new Map(),initialized=false;
let guideTitle=null,guideText=null,guideButton=null,guideProgress=null,guideMeter=null,questSteps=[],advancedDisclosure=null,growDisclosure=null;
let sidebarNextCard=null,sidebarNextTitle=null,sidebarNextMeta=null,sidebarNextButton=null,guideSkipButton=null,lastGuidedStage='';
const groupHeadings=new Map();
const isMultiplayer=()=>window.state?.playType==='multi';
const available=id=>isMultiplayer()?['world','clans'].includes(id):!['world','clans'].includes(id);
// Progression applies to newly created solo empires only. Legacy saves stay fully unlocked.
function guidedMode(){
 const s=window.state;
 return Boolean(s?.started&&s.playType!=='multi'&&s.onboardingVersion===1&&!s.onboardingDismissed);
}
function onboardingStage(){
 if(!guidedMode())return 5;
 const businesses=Array.isArray(window.state.businesses)?window.state.businesses:[];
 if(!businesses.length)return 1;
 const locations=businesses.flatMap(b=>Array.isArray(b.locations)?b.locations:[]);
 const improved=locations.some(l=>Number(l.level)>1||Number(l.workers)>0)||
  businesses.some(b=>Number(b.level)>1||Number(b.workers)>0);
 if(!improved)return 2;
 if(businesses.length<2&&locations.length<2)return 3;
 return 5;
}
const STAGE_BY_VIEW={overview:1,businesses:1,operations:2,finance:2,analytics:3,arcade:3,advances:3,trophies:3,markets:5,corporate:5};
const unlocked=id=>onboardingStage()>=(STAGE_BY_VIEW[id]||1);
const canOpen=id=>available(id)&&unlocked(id);
function syncUnlocks(){
 if(!initialized)return;
 const guided=guidedMode(),stage=onboardingStage();
 for(const [id,button]of buttonMap)button.hidden=!canOpen(id);
 if(advancedDisclosure)advancedDisclosure.hidden=isMultiplayer()||!['markets','analytics','finance'].some(canOpen);
 if(growDisclosure)growDisclosure.hidden=isMultiplayer()||!['corporate','advances','trophies'].some(canOpen);
 if(guideSkipButton)guideSkipButton.hidden=!guided;
 const key=(isMultiplayer()?'online':guided?'guided':'full')+':'+stage;
 if(lastGuidedStage!==key){
  lastGuidedStage=key;
  if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')
   window.dispatchEvent(new CustomEvent('profitlands:guidancechange',{detail:{guided,stage}}));
 }
}
function skipGuidance(){
 const s=window.state;
 if(!guidedMode()||!s)return false;
 s.onboardingDismissed=true;
 window.save?.();
 syncMode();updateGuide();
 return true;
}

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
function starterProgress(s){
 const businesses=Array.isArray(s?.businesses)?s.businesses:[];
 const locations=businesses.flatMap(b=>Array.isArray(b.locations)?b.locations:[]);
 const owned=businesses.length>0;
 const improved=locations.some(l=>Number(l.level)>1||Number(l.workers)>0)||businesses.some(b=>Number(b.level)>1||Number(b.workers)>0);
 const expanded=businesses.length>1||locations.length>1;
 const goals=[
  {done:owned,title:'Open your first shop',detail:'Buy a business to unlock your first income stream.',action:'Open marketplace',view:'businesses'},
  {done:improved,title:'Make your shop stronger',detail:'Hire staff or upgrade a location to grow your earnings.',action:'Manage my shop',view:'businesses'},
  {done:expanded,title:'Build a small chain',detail:'Open another business or branch and watch your city grow.',action:'Expand empire',view:'businesses'}
 ];
 return {goals,completed:goals.filter(g=>g.done).length,next:goals.find(g=>!g.done)||{title:'Take on a new challenge',detail:'Try the Arcade, unlock achievements, and grow your empire.',action:'Play mini-games',view:'arcade'}};
}
function updateGuide(){
 if(!window.state)return;
 syncUnlocks();
 const progress=starterProgress(window.state),next=progress.next;
 if(sidebarNextTitle)sidebarNextTitle.textContent=next.title;
 if(sidebarNextMeta)sidebarNextMeta.textContent=progress.completed+' / 3 goals complete';
 if(sidebarNextButton){
  sidebarNextButton.textContent=next.action+' →';
  sidebarNextButton.dataset.destination=next.view;
 }
 if(!guideTitle)return;
 guideTitle.textContent=progress.completed===3?'First chapter complete!':next.title;
 guideText.textContent=next.detail;
 guideButton.textContent=next.action;
 guideButton.dataset.destination=next.view;
 if(guideProgress){
  guideProgress.textContent=progress.completed+' of 3 starter challenges complete';
  guideProgress.setAttribute('aria-label',guideProgress.textContent);
 }
 if(guideMeter){
  guideMeter.setAttribute('aria-valuenow',String(progress.completed));
  guideMeter.setAttribute('style','--pl-quest-progress:'+Math.round(progress.completed/3*100)+'%');
 }
 questSteps.forEach((button,i)=>{
  const done=progress.goals[i].done;
  const current=!done&&progress.goals.findIndex(g=>!g.done)===i;
  button.classList?.toggle?.('pl-quest-done',done);
  button.classList?.toggle?.('pl-quest-current',current);
  button.setAttribute?.('aria-label',(done?'Completed: ':current?'Next mission: ':'Upcoming: ')+progress.goals[i].title);
  const icon=button.querySelector?.('.pl-game-step-icon');
  if(icon)icon.textContent=done?'✓':['🏪','⬆️','🏙️'][i];
 });
}

function save(){
 try{localStorage.setItem(KEY,current)}catch(e){}
}
function show(id,{focus=false,remember=true}={}){
 if(!initialized||!canOpen(id))return false;
 const view=VIEWS.find(x=>x.id===id);
 if(!view)return false;
 current=id;
 // Overview already contains the full mission card; avoid duplicate guidance in the sidebar.
 if(sidebarNextCard)sidebarNextCard.hidden=id==='overview';
 if(view.group==='ADVANCED'&&advancedDisclosure)advancedDisclosure.open=true;
 if(view.group==='GROW'&&growDisclosure)growDisclosure.open=true;
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
 if(!isMultiplayer())updateGuide();
 if(id==='overview')window.ProfitLandsExecutive?.render?.()
 if(id==='analytics')window.ProfitLandsGrowth?.render?.();
 if(id==='operations')window.ProfitLandsEmpire?.render?.();
 if(id==='arcade')window.ProfitLandsArcade?.render?.();
 if(id==='advances')window.ProfitLandsAdvancements?.render?.();
 if(id==='trophies'){window.ProfitLandsBadges?.scan?.(Date.now(),true);window.ProfitLandsBadges?.render?.()}
 if(id==='clans')window.ProfitLandsClans?.render?.();
 if(id==='world')window.ProfitLandsWorld?.render?.();
 if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('profitlands:viewchange',{detail:{view:id}}));
 return true;
}
function makeNav(){
 nav=element('nav','pl-workspace-nav');nav.setAttribute('aria-label','Tycoon game menu');
 const title=element('div','pl-workspace-nav-title','PROFITLANDS / PLAY');nav.appendChild(title);
 const icons={overview:'⌂',businesses:'🏪',operations:'⚙',markets:'📈',analytics:'📊',finance:'🏦',corporate:'🏙️',arcade:'🕹️',advances:'⚡',trophies:'🏆',clans:'🛡️',world:'🌎'};
 const sections=[
  {group:'PLAY',label:'YOUR EMPIRE',ids:['overview','businesses','operations']},
  {group:'FUN',label:'TAKE A BREAK',ids:['arcade']},
  {group:'GROW',label:'✦ GROW & COLLECT',ids:['corporate','advances','trophies'],collapsed:true},
  {group:'ADVANCED',label:'⚙ STRATEGY & FINANCE',ids:['markets','analytics','finance'],collapsed:true},
  {group:'SOCIAL',label:'MULTIPLAYER',ids:['world','clans']}
 ];
 for(const section of sections){
  let target=nav;
  if(section.collapsed){
   const details=element('details','pl-workspace-disclosure '+(section.group==='GROW'?'pl-workspace-grow-nav':'pl-workspace-advanced-nav'));
   details.dataset.workspaceGroup=section.group;
   details.open=section.ids.includes(current);
   const summary=element('summary','pl-workspace-disclosure-summary',section.label);
   details.appendChild(summary);
   nav.appendChild(details);
   target=details;
   if(section.group==='GROW')growDisclosure=details;
   if(section.group==='ADVANCED')advancedDisclosure=details;
  }else{
   const groupHeading=element('div','pl-workspace-nav-group',section.label);
   groupHeading.dataset.workspaceGroup=section.group;
   groupHeadings.set(section.group,groupHeading);
   nav.appendChild(groupHeading);
  }
  for(const id of section.ids){
   const view=VIEWS.find(v=>v.id===id);
   if(!view)continue;
   const btn=element('button','pl-workspace-nav-item'+(id==='arcade'?' pl-workspace-nav-play':''));
   btn.type='button';btn.dataset.workspaceView=view.id;
   btn.hidden=!canOpen(view.id);
   btn.setAttribute('aria-label','Open '+view.name);
   const index=element('span','pl-workspace-nav-index',icons[view.id]||view.number);
   const name=element('span','pl-workspace-nav-label',view.name);
   const indicator=element('span','pl-workspace-nav-indicator','›');
   btn.append(index,name,indicator);
   btn.addEventListener('click',()=>show(view.id,{focus:false}));
   target.appendChild(btn);
   buttonMap.set(view.id,btn);
  }
 }
 const actions=element('div','pl-workspace-sidebar-actions');
 const card=element('div','pl-workspace-next-card');
 sidebarNextCard=card;
 card.appendChild(element('span','pl-workspace-next-eyebrow','✦ NEXT MOVE'));
 sidebarNextTitle=element('strong','pl-workspace-next-title','Open your first shop');
 sidebarNextMeta=element('span','pl-workspace-next-meta','0 / 3 goals complete');
 sidebarNextButton=element('button','pl-workspace-next-action','Open marketplace →');
 sidebarNextButton.type='button';
 sidebarNextButton.addEventListener('click',()=>{
  const next=starterProgress(window.state).next;
  if(!show(next.view))return;
  if(next.view==='businesses'&&!window.state?.businesses?.length)$('openBusinessShop')?.click();
 });
 card.append(sidebarNextTitle,sidebarNextMeta,sidebarNextButton);
 actions.appendChild(card);
 const buy=element('button','pl-workspace-quick-button','+ New business');
 buy.type='button';buy.addEventListener('click',()=>{
  if(show('businesses'))$('openBusinessShop')?.click();
 });
 actions.appendChild(buy);
 toolbar=actions;
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
   guideProgress=element('span','pl-quest-progress','0 of 3 starter challenges complete');
   guideMeter=element('div','pl-quest-meter');
   guideMeter.setAttribute('role','progressbar');
   guideMeter.setAttribute('aria-label','Starter mission progress');
   guideMeter.setAttribute('aria-valuemin','0');
   guideMeter.setAttribute('aria-valuemax','3');
   guideMeter.appendChild(element('span','pl-quest-meter-fill'));
   introCopy.append(guideTitle,guideText,guideProgress,guideMeter);
   welcome.appendChild(introCopy);
   guideButton=element('button','pl-workspace-intro-button','Open my first shop');
   guideButton.type='button';
   guideButton.addEventListener('click',()=>{
     const next=starterProgress(window.state).next;
     show(next.view);
     if(next.view==='businesses'&&!window.state?.businesses?.length)$('openBusinessShop')?.click();
   });
   welcome.appendChild(guideButton);
   guideSkipButton=element('button','pl-onboarding-skip','Show all features');
   guideSkipButton.type='button';
   guideSkipButton.setAttribute('aria-label','Show all game sections and skip guided unlocks');
   guideSkipButton.addEventListener('click',skipGuidance);
   introCopy.appendChild(guideSkipButton);
   region.appendChild(welcome);
   const steps=element('div','pl-game-steps');
   for(const [icon,title,description,action] of [
     ['🏪','1. Buy a shop','Your first business starts earning cash.','businesses'],
     ['⬆️','2. Upgrade it','Add staff and improve locations.','businesses'],
     ['🏙️','3. Expand your empire','Open another shop or branch to grow your city.','businesses']
   ]){
     const button=element('button','pl-game-step');button.type='button';
     button.append(element('span','pl-game-step-icon',icon));
     const copy=element('span','pl-game-step-copy');
     copy.append(element('strong','',title),element('small','',description));button.appendChild(copy);
     button.addEventListener('click',()=>{show(action);if(action==='businesses'&&title.startsWith('1.'))$('openBusinessShop')?.click()});
     questSteps.push(button);
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
 syncUnlocks();
 for(const [group,heading] of groupHeadings)heading.hidden=active?group!=='SOCIAL':group==='SOCIAL';
 // Guided progression controls group visibility.
 if(toolbar)toolbar.hidden=active;
 document.body.classList.toggle('pl-online-world',active);
 if(initialized&&!canOpen(current))show(active?'world':'overview',{remember:false});
 window.ProfitLandsWorld?.updateChat?.();
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
 show(canOpen(requested)?requested:(isMultiplayer()?'world':'overview'),{remember:false});
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
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(/^[1-9]$/.test(e.key)||e.key==='0'||['c','w'].includes(e.key.toLowerCase()))){
   if(e.target?.closest?.('input,textarea,select,[contenteditable]'))return;
   e.preventDefault();show(e.key.toLowerCase()==='c'?'clans':e.key.toLowerCase()==='w'?'world':VIEWS[e.key==='0'?9:Number(e.key)-1].id,{focus:true});
  }
 });
}
window.ProfitLandsWorkspace={
 show,active:()=>current,viewForPanel,available,canOpen,unlocked,guidedMode,onboardingStage,skipGuidance,
 refreshGuidance:()=>{if(initialized){syncUnlocks();if(!canOpen(current))show('overview',{remember:false});if(!isMultiplayer())updateGuide()}},syncMode,
 views:VIEWS.map(v=>({id:v.id,name:v.name,panels:v.panels.slice()})),
 ready:()=>initialized
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
else build();
})();