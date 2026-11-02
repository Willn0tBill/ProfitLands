/* ProfitLands difficulty model.
   Difficulty changes gameplay pressure, not the real country tax/data inputs. */
(function(){
'use strict';
const LEVELS=Object.freeze([
  {
    id:'startup',name:'Startup',subtitle:'Beginner',
    description:'More breathing room while you learn the economy.',
    startCash:1500,revenue:1.12,expenses:.94,event:0.78,stockVol:.88,actionSeconds:12,bankruptcy:1.25
  },
  {
    id:'executive',name:'Executive',subtitle:'Experienced',
    description:'The intended ProfitLands balance.',
    startCash:1000,revenue:1,expenses:1,event:1,stockVol:1,actionSeconds:15,bankruptcy:1
  },
  {
    id:'tycoon',name:'Tycoon',subtitle:'Pro',
    description:'Tighter margins, slower actions, and harsher markets.',
    startCash:750,revenue:.95,expenses:1.06,event:1.18,stockVol:1.12,actionSeconds:18,bankruptcy:.9
  },
  {
    id:'hostile',name:'Hostile Takeover',subtitle:'Unwinnable',
    description:'Deliberately unfair. Markets hit harder and recovery is brutal.',
    startCash:500,revenue:.82,expenses:1.20,event:1.55,stockVol:1.38,actionSeconds:25,bankruptcy:.72
  }
]);
const byId=id=>LEVELS.find(x=>x.id===id)||LEVELS[1];
const current=()=>byId(window.state?.difficulty||'executive');
function ensure(){
  if(!window.state)return null;
  if(!LEVELS.some(x=>x.id===state.difficulty))state.difficulty='executive';
  return current();
}
function setDifficulty(id){
  if(!window.state||window.state.started)return false;
  state.difficulty=byId(id).id;
  render();
  return true;
}
function render(){
  const d=ensure();if(!d)return;
  document.querySelectorAll('[data-difficulty]').forEach(card=>{
    const active=card.dataset.difficulty===d.id;
    card.classList.toggle('selected',active);
    card.setAttribute('aria-pressed',String(active));
  });
  const label=document.getElementById('difficultySummary');
  if(label)label.textContent=d.name+' · '+d.subtitle+' — '+d.description;
  const hud=document.getElementById('difficultyHudLabel');
  if(hud)hud.textContent=d.name;
}
function init(){
  if(typeof state==='undefined')return;
  ensure();render();
  document.querySelectorAll('[data-difficulty]').forEach(card=>{
    card.addEventListener('click',()=>setDifficulty(card.dataset.difficulty));
  });
}
window.ProfitLandsDifficulty={LEVELS,byId,current,ensure,setDifficulty,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();