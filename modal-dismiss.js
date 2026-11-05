/* ProfitLands dialog dismiss controls.
 * Always close from the actual click (mouse/keyboard/touch) and avoid
 * repositioning the close button during pointer animations.
 */
(function(){
'use strict';
function closeModal(modal){
 if(!modal||modal.classList?.contains('hidden')||modal.id==='economyModal')return false;
 modal.classList.add('hidden');
 return true;
}
function topOpenModal(){
 const nodes=document.querySelectorAll('.modal:not(.hidden)');
 return nodes.length?nodes[nodes.length-1]:null;
}
document.addEventListener('click',event=>{
 const target=event.target;
 if(!(target instanceof Element))return;
 const close=target.closest('button.modal-close,button[data-close]');
 if(close){
  const modal=close.closest('.modal');
  if(!modal||modal.id==='economyModal')return;
  event.preventDefault();
  // A single delegated handler survives dialogs being re-rendered and
  // executes before legacy click handlers can replace the button.
  if(closeModal(modal))event.stopPropagation();
  return;
 }
 const modal=target.closest('.modal');
 if(modal&&target===modal)closeModal(modal);
},true);
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 if(closeModal(topOpenModal()))event.preventDefault();
});
window.ProfitLandsModalDismiss={closeModal};
})();