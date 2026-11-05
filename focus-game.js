/* ProfitLands Focus Mode.
 * A compact, full-viewport game console with one lightweight actions menu.
 * Browser fullscreen is strictly opt-in from a user click and the game still
 * works on iOS and other environments without the Fullscreen API.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const supported=()=>typeof document.documentElement?.requestFullscreen==='function';
const storageKey='profitlands-fullscreen-choice-v1';
let screen,hud,menu,menuButton,fullscreenButton,dialog,controls,observer;
let initialized=false,asked=false;
function el(tag,cls,text){
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(text!==undefined)x.textContent=text;
 return x;
}
function isPlaying(){return !!screen?.classList.contains('active')}
function menuOpen(open){
 if(!hud)return;
 hud.classList.toggle('pl-focus-menu-open',Boolean(open));
 menuButton?.setAttribute('aria-expanded',String(Boolean(open)));
}
function remember(){
 try{sessionStorage.setItem(storageKey,'1')}catch(e){}
}
function prompted(){
 try{return sessionStorage.getItem(storageKey)==='1'}catch(e){return asked}
}
function closeDialog(){
 if(!dialog)return;
 dialog.hidden=true;
 dialog.classList.remove('open');
 remember();
}
async function fullscreen(){
 if(!supported())return false;
 try{
  if(!document.fullscreenElement)await document.documentElement.requestFullscreen();
  else if(typeof document.exitFullscreen==='function')await document.exitFullscreen();
  closeDialog();
  menuOpen(false);
  syncFullscreen();
  return true;
 }catch(e){
  const note=$('plFocusPromptStatus');
  if(note)note.textContent='Fullscreen is unavailable in this browser. You can keep playing in the compact game view.';
  return false;
 }
}
function syncFullscreen(){
 if(!fullscreenButton)return;
 const on=Boolean(document.fullscreenElement);
 fullscreenButton.textContent=on?'Exit fullscreen':'Enter fullscreen';
 fullscreenButton.setAttribute('aria-pressed',String(on));
}
function ensureDialog(){
 if(dialog)return dialog;
 dialog=el('section','pl-focus-prompt');
 dialog.id='plFocusPrompt';
 dialog.hidden=true;
 dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','plFocusPromptTitle');
 const card=el('div','pl-focus-prompt-card');
 card.append(el('span','pl-focus-kicker','GAME DISPLAY'),
  el('h2','', 'Play with more room?'));
 card.querySelector('h2').id='plFocusPromptTitle';
 card.appendChild(el('p','', 'Enter fullscreen for an immersive game, or continue in the compact browser view. Your save is unchanged.'));
 const status=el('p','pl-focus-prompt-status');status.id='plFocusPromptStatus';
 status.setAttribute('role','status');
 const buttons=el('div','pl-focus-prompt-actions');
 const go=el('button','pl-focus-enter','Enter fullscreen');go.type='button';
 go.id='plFocusEnter';
 go.addEventListener('click',()=>{fullscreen()});
 const stay=el('button','pl-focus-stay','Continue in browser');stay.type='button';
 stay.id='plFocusStay';
 stay.addEventListener('click',closeDialog);
 buttons.append(go,stay);
 card.append(status,buttons);
 dialog.appendChild(card);
 document.body.appendChild(dialog);
 return dialog;
}
function ask(){
 if(!isPlaying()||!supported()||asked||prompted())return false;
 asked=true;
 ensureDialog();
 dialog.hidden=false;
 dialog.classList.add('open');
 $('plFocusEnter')?.focus?.({preventScroll:true});
 return true;
}
function sync(){
 const active=isPlaying();
 document.body.classList.toggle('pl-focus-playing',active);
 if(!active){menuOpen(false);if(dialog)dialog.hidden=true;return}
 ask();
}
function init(){
 if(initialized)return;
 screen=$('gameScreen');
 const head=screen?.querySelector('.pl-workspace-hud .game-head');
 hud=screen?.querySelector('.pl-workspace-hud .game-hud');
 controls=head?.querySelector('.game-controls');
 if(!screen||!head||!hud||!controls)return;
 initialized=true;
 document.body.classList.add('pl-focus-enabled');
 menuButton=el('button','pl-focus-menu-button','Menu');
 menuButton.id='plGameMenu';menuButton.type='button';
 menuButton.setAttribute('aria-expanded','false');
 menuButton.setAttribute('aria-controls','plGameControls');
 menuButton.setAttribute('aria-haspopup','true');
 menuButton.addEventListener('click',()=>menuOpen(!hud.classList.contains('pl-focus-menu-open')));
 head.appendChild(menuButton);
 controls.id='plGameControls';
 controls.setAttribute('aria-label','Game actions');
 if(supported()){
  fullscreenButton=el('button','small-button pl-focus-fullscreen','Enter fullscreen');
  fullscreenButton.id='plFullscreenToggle';fullscreenButton.type='button';
  fullscreenButton.addEventListener('click',fullscreen);
  controls.prepend(fullscreenButton);
  document.addEventListener('fullscreenchange',syncFullscreen);
  syncFullscreen();
 }
 document.addEventListener('click',event=>{
  if(!hud.classList.contains('pl-focus-menu-open'))return;
  if(!event.target?.closest?.('#plGameMenu,#plGameControls'))menuOpen(false);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&hud.classList.contains('pl-focus-menu-open'))menuOpen(false);
  if(event.key==='Escape'&&dialog&&!dialog.hidden){
   closeDialog();event.preventDefault();
  }
 });
 window.addEventListener('profitlands:viewchange',()=>menuOpen(false));
 if(typeof MutationObserver==='function'){
  observer=new MutationObserver(sync);
  observer.observe(screen,{attributes:true,attributeFilter:['class']});
 }
 sync();
}
window.ProfitLandsFocus={
 init,ask,menuOpen,fullscreen,diagnostics:()=>({
  initialized,playing:isPlaying(),fullscreenAvailable:supported(),
  fullscreenActive:Boolean(document.fullscreenElement),dialogVisible:!!dialog&&!dialog.hidden,
  menuOpen:!!hud?.classList.contains('pl-focus-menu-open')
 })
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();