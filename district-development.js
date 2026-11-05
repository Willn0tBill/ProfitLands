/* ProfitLands District Development.
 * Earn visual neighborhood improvements by growing REAL businesses.
 * This layer neither edits the economy nor fabricates monetary rewards.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const MILESTONES=Object.freeze([
 {id:'garden',name:'Local Corner',reward:'Neighborhood garden',
  goals:[{key:'shops',need:1,label:'Businesses'}]},
 {id:'market',name:'Main Street',reward:'Weekend market',
  goals:[{key:'shops',need:3,label:'Businesses'},{key:'levels',need:6,label:'Combined levels'}]},
 {id:'plaza',name:'Town Center',reward:'Civic plaza',
  goals:[{key:'shops',need:5,label:'Businesses'},{key:'levels',need:14,label:'Combined levels'},
   {key:'types',need:3,label:'Industries'}]},
 {id:'transit',name:'Metro District',reward:'Transit stop',
  goals:[{key:'shops',need:8,label:'Businesses'},{key:'levels',need:28,label:'Combined levels'},
   {key:'locations',need:10,label:'Locations'}]}
]);
function num(x,defaultValue=0){
 const n=Number(x);
 return Number.isFinite(n)?Math.max(0,Math.floor(n)):defaultValue;
}
function statsFor(state){
 const bs=Array.isArray(state?.businesses)?state.businesses:[];
 const unique=new Set();
 let levels=0,locations=0;
 for(const b of bs){
  if(b?.type)unique.add(String(b.type));
  levels+=num(b?.level,1)||1;
  // Mirror the existing portfolio's locations/chainCount interpretation.
  const owned=Array.isArray(b?.locations)?b.locations.length:num(b?.chainCount)+1;
  locations+=Math.max(1,owned);
 }
 return {shops:bs.length,levels,types:unique.size,locations};
}
function progressFor(state){
 const stats=statsFor(state);
 const steps=MILESTONES.map((m,index)=>{
  const goals=m.goals.map(g=>({...g,value:stats[g.key]||0,
   done:(stats[g.key]||0)>=g.need}));
  const done=goals.every(g=>g.done);
  const progress=Math.round(100*goals.reduce((sum,g)=>sum+
   Math.min(1,g.value/g.need),0)/goals.length);
  return {id:m.id,name:m.name,reward:m.reward,goals,done,progress,index};
 });
 // All milestones require increasing enterprise development.
 let tier=0;
 while(tier<steps.length&&steps[tier].done)tier++;
 const current=steps[tier]||null;
 const nextGoal=current?.goals.find(g=>!g.done)||null;
 return {stats,tier,steps,current,nextGoal,complete:tier===MILESTONES.length};
}
const reduced=()=>document.documentElement.classList.contains('pl-reduced-motion')||
 Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
let city=null,view=null,board=null,landmarks=null,interval=null;
let lastSignature='',previousTier=null,renders=0;
function el(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
}
function addLandmarks(stage){
 const wrapper=el('div','pl-district-landmarks');
 wrapper.setAttribute('aria-hidden','true');
 // Fixed ornamental DOM. No external imagery and no player-supplied HTML.
 for(const [cls,parts] of [
  ['garden',['tree','tree small','bench']],
  ['market',['stall','stall','sign']],
  ['plaza',['fountain','paving','flag']],
  ['transit',['shelter','route','lamp']]
 ]){
  const block=el('div','pl-district-landmark pl-district-'+cls);
  for(const name of parts)block.appendChild(el('i','pl-district-detail pl-district-'+name.replace(' ',' pl-district-')));
  wrapper.appendChild(block);
 }
 stage.appendChild(wrapper);
 return wrapper;
}
function buildBoard(){
 const root=el('section','pl-district-board');
 root.id='plDistrictBoard';
 root.setAttribute('aria-label','District development objectives');
 const header=el('div','pl-district-board-header');
 const title=el('div','pl-district-board-title');
 title.appendChild(el('span','pl-district-eyebrow','DISTRICT DEVELOPMENT'));
 title.appendChild(el('h3','', 'Grow the neighborhood'));
 const tier=el('span','pl-district-tier');
 tier.id='plDistrictTier';
 header.append(title,tier);
 const description=el('p','pl-district-desc');
 description.id='plDistrictSummary';
 description.setAttribute('aria-live','polite');
 const progress=el('div','pl-district-track');
 progress.setAttribute('role','progressbar');
 progress.setAttribute('aria-label','Development of next district stage');
 progress.setAttribute('aria-valuemin','0');
 progress.setAttribute('aria-valuemax','100');
 progress.id='plDistrictTrack';
 progress.appendChild(el('i','pl-district-track-fill'));
 const badges=el('div','pl-district-milestone-list');
 badges.id='plDistrictMilestones';
 for(const m of MILESTONES){
  const badge=el('div','pl-district-milestone');
  badge.dataset.milestone=m.id;
  badge.append(el('strong','',m.name),el('small','',m.reward));
  badges.appendChild(badge);
 }
 const actions=el('div','pl-district-actions');
 const goal=el('span','pl-district-next-goal');goal.id='plDistrictNextGoal';
 const button=el('button','pl-district-next-button','Work on this goal');
 button.id='plDistrictNextButton';button.type='button';
 button.addEventListener('click',()=>{
  const progress=progressFor(window.state);
  if(window.state?.playType==='multi')return;
  // Connect to real game panels. No new fake economy action.
  const target=progress.nextGoal?.key==='locations'?'operations':'businesses';
  window.ProfitLandsWorkspace?.show?.(target);
  if(target==='businesses'&&progress.stats.shops===0)
   $('openBusinessShop')?.click?.();
 });
 actions.append(goal,button);
 root.append(header,description,progress,badges,actions);
 return root;
}
function active(){
 return Boolean(city&&view&&!view.hidden&&!document.hidden&&
  $('gameScreen')?.classList.contains('active')&&window.state?.playType!=='multi');
}
function render(force=false){
 if(!board)return false;
 if(!force&&!active())return false;
 const p=progressFor(window.state);
 const sig=[p.tier,p.stats.shops,p.stats.levels,p.stats.types,p.stats.locations].join(':');
 if(sig===lastSignature)return true;
 lastSignature=sig;
 const tier=$('plDistrictTier'),summary=$('plDistrictSummary');
 const track=$('plDistrictTrack'),goal=$('plDistrictNextGoal');
 const button=$('plDistrictNextButton');
 const stage=city?.querySelector?.('.pl-city-stage');
 for(let index=0;index<=MILESTONES.length;index++){
  city.classList.toggle('pl-district-tier-'+index,index===p.tier);
 }
 if(tier)tier.textContent='DISTRICT '+(p.tier+1)+' / '+(MILESTONES.length+1);
 if(summary)summary.textContent=p.complete?
  'District complete. Your business portfolio built a full town.':
  p.current.name+' — next landmark: '+p.current.reward+'.';
 const percent=p.current?.progress??100;
 if(track){
  track.setAttribute('aria-valuenow',String(percent));
  const fill=track.querySelector?.('.pl-district-track-fill');
  if(fill)fill.style.width=percent+'%';
 }
 const cells=$('plDistrictMilestones')?.children||[];
 for(let i=0;i<cells.length;i++){
  const cell=cells[i];
  cell.classList.toggle('is-unlocked',p.steps[i]?.done===true);
  cell.classList.toggle('is-current',i===p.tier);
  cell.setAttribute('aria-label',p.steps[i]?.name+': '+(p.steps[i]?.done?'unlocked':'locked'));
 }
 if(goal)goal.textContent=p.complete?
  'All four landmarks developed. Keep expanding your empire.':
  (p.nextGoal.label+': '+Math.min(p.nextGoal.need,p.nextGoal.value)+' / '+p.nextGoal.need);
 if(button)button.textContent=p.complete?'Manage businesses':
  p.nextGoal?.key==='locations'?'Manage locations':
  p.stats.shops===0?'Open first business':'Grow businesses';
 if(previousTier!==null&&p.tier>previousTier&&active()&&!reduced()){
  board.classList.remove('pl-district-celebrate');
  // Restart only when a genuinely new district tier is reached.
  void board.offsetWidth;
  board.classList.add('pl-district-celebrate');
  stage?.classList.add('pl-district-unlocked');
  setTimeout(()=>{
   board?.classList.remove('pl-district-celebrate');
   stage?.classList.remove('pl-district-unlocked');
  },1100);
 }
 previousTier=p.tier;renders++;
 return true;
}
function mount(){
 if(board)return true;
 city=$('plLivingCity');
 view=city?.closest?.('.pl-workspace-view')||null;
 const stage=city?.querySelector?.('.pl-city-stage');
 if(!city||!view||!stage)return false;
 addLandmarks(stage);
 board=buildBoard();
 city.insertAdjacentElement('afterend',board);
 window.addEventListener('profitlands:viewchange',event=>{
  if(event?.detail?.view==='overview')render(true);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
 if(typeof window.setInterval==='function')interval=window.setInterval(()=>render(),1800);
 render(true);
 return true;
}
function init(){
 if(!mount()&&typeof MutationObserver==='function'){
  const game=$('gameScreen');
  if(!game)return;
  const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
  observer.observe(game,{childList:true,subtree:true});
 }
}
window.ProfitLandsDistrictDevelopment={
 mount,refresh:()=>render(true),statsFor,progressFor,
 diagnostics:()=>({mounted:!!board,tier:previousTier,updates:renders,
  running:!!interval,active:active(),reduced:reduced()})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();