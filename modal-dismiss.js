/* ProfitLands modal light-dismiss behavior */
(function(){
  function closeModal(modal){
    if(!modal)return;
    modal.classList.add('hidden');
  }

  document.addEventListener('click',function(event){
    const target=event.target;
    if(!(target instanceof Element))return;
    const modal=target.closest('.modal');
    if(!modal)return;

    // Clicking the dark area outside the actual modal card closes it.
    // Clicking inside the card leaves the UI open.
    if(target===modal){
      closeModal(modal);
    }
  });

  // Also support touch taps on mobile browsers where the backdrop may
  // receive pointer events differently from a normal mouse click.
  document.addEventListener('pointerup',function(event){
    const target=event.target;
    if(!(target instanceof Element))return;
    const modal=target.closest('.modal');
    if(!modal||target!==modal)return;
    closeModal(modal);
  });
})();
