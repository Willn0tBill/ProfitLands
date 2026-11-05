/* ProfitLands game shell repairs.
 * Small HUD controls, optional user-initiated fullscreen, and reliable modal X.
 * Does not touch saved game state or account data.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const PREF_KEY='profitlands-fullscreen-invite-dismissed';
let controls=null,invite=null;
function gameActive(){
 return $('gameScreen')?.classList.contains('active')===true;
}
function closeFromButton(event){
 const target=event.target;
 const button=target?.closest?.('.modal-close,button[data-close]');
 const modal=button?.closest?.('.modal');
 if(!modal||modal.classList.contains('hidden'))return;
 // Capturing ahead of other animation handlers prevents the closing button
 // from becoming a positioned ripple host during the click.
 event.preventDefault();
 event.stopImmediatePropagation?.();
 button.classList.remove('pl-motion-ripple-host','motion-press');
 const preferred=button.dataset?.close;
 const id=typeof preferred==='string'?preferred:null;
 if(id&&id!==modal.id)return;
 modal.classList.add('hidden');
 const fallback=$('gameScreen')?.querySelector?.('.pl-workspace-nav-item.active')||
  $('startGame')||$('homeScreen')?.querySelector?.('button');
 if(typeof fallback?.focus==='function')fallback.focus({preventScroll:true});
}
async function toggleFullscreen(){
 if(!gameActive())return false;
 try{
  if(document.fullscreenElement){
   if(typeof document.exitFullscreen==='function')await document.exitFullscreen();
   else throw Error('Fullscreen exit is not supported.');
  }else{
   const element=document.documentElement;
   if(typeof element?.requestFullscreen!=='function')throw Error('Fullscreen is unavailable in this browser.');
   await element.requestFullscreen({navigationUI:'hide'});
  }
  updateButton();
  hideInvite();
  return true;
 }catch(error){
  const status=$('plFullscreenStatus');
  if(status)status.textContent='Fullscreen was not enabled. You can still play in the compact layout.';
  return false;
 }
}
function updateButton(){
 const b=$('plFullscreenToggle');
 if(!b)return;
 const fullscreen=Boolean(document.fullscreenElement);
 b.textContent=fullscreen?'Exit fullscreen':'Fullscreen';
 b.setAttribute('aria-pressed',String(fullscreen));
 b.title=fullscreen?'Exit browser fullscreen (Esc also works)':'Use more screen space for the game';
}
function hideInvite(){
 if(!invite)return;
 invite.hidden=true;
 try{sessionStorage.setItem(PREF_KEY,'1')}catch(e){}
}
function offerFullscreen(){
 if(!gameActive()||document.fullscreenElement||!invite)return;
 try{if(sessionStorage.getItem(PREF_KEY)==='1')return}catch(e){}
 invite.hidden=false;
}
function ensure(){
 if(controls)return true;
 const game=$('gameScreen');
 const host=game?.querySelector?.('.game-controls');
 if(!host)return false;
 controls=document.createElement('span');controls.className='pl-game-quick-controls';
 const button=document.createElement('button');
 button.id='plFullscreenToggle';button.type='button';
 button.addEventListener('click',toggleFullscreen);
 controls.appendChild(button);
 host.appendChild(controls);
 invite=document.createElement('aside');
 invite.id='plFullscreenInvite';invite.className='pl-fullscreen-invite';invite.hidden=true;
 invite.setAttribute('aria-label','Fullscreen game option');
 const heading=document.createElement('h3');heading.textContent='More room for your empire';
 const description=document.createElement('p');
 description.textContent='Enter fullscreen for a wider game view, or stay in the compact layout. You can exit fullscreen with Esc.';
 const status=document.createElement('p');status.id='plFullscreenStatus';status.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='pl-fullscreen-actions';
 const yes=document.createElement('button');yes.type='button';yes.textContent='Enter fullscreen';
 yes.addEventListener('click',toggleFullscreen);
 const no=document.createElement('button');no.type='button';no.textContent='Not now';
 no.addEventListener('click',hideInvite);
 actions.append(yes,no);
 invite.append(heading,description,status,actions);
 document.body.appendChild(invite);
 updateButton();
 return true;
}
function init(){
 document.addEventListener('click',closeFromButton,true);
 ensure();
 document.addEventListener('fullscreenchange',updateButton);
 // Gameplay navigation can switch without a full page reload.
 document.addEventListener('click',event=>{
  if(event.target?.closest?.('#startGame,#resumeLastGame,#continueGame')){
   setTimeout(()=>{if(ensure())offerFullscreen()},100);
  }
 });
 const game=$('gameScreen');
 if(typeof MutationObserver==='function'&&game){
  const observer=new MutationObserver(()=>{
   if(gameActive()){if(ensure())offerFullscreen()}
   else if(invite)invite.hidden=true;
  });
  observer.observe(game,{attributes:true,attributeFilter:['class']});
 }
 if(gameActive())offerFullscreen();
}
window.ProfitLandsGameShell={
 toggleFullscreen,offerFullscreen,closeFromButton,diagnostics:()=>({
  active:gameActive(),fullscreen:!!document.fullscreenElement,
  controls:!!controls,inviteVisible:!!invite&&!invite.hidden
 })
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();