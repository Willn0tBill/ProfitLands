/* Mobile-safe controls for ProfitLands */
(function(){
  function endGame(){
    if(!window.state?.started)return;
    const modal=document.getElementById('endGameModal'),content=document.getElementById('endGameContent');
    if(!modal||!content)return;
    content.innerHTML='<span class="eyebrow">END GAME</span><h2>Save and leave this empire?</h2><p class="modal-sub">Your current game will stay saved. You can return to it later.</p><div class="confirm-actions"><button type="button" id="cancelEndGame" class="secondary-button">Keep Playing</button><button type="button" id="confirmEndGame" class="primary-button">Save & End Game</button></div>';
    modal.classList.remove('hidden');
    document.getElementById('cancelEndGame').onclick=()=>modal.classList.add('hidden');
    document.getElementById('confirmEndGame').onclick=()=>{
      window.state.started=false;
      window.save?.();
      if(window.timerHandle)clearInterval(window.timerHandle);
      window.profitLandsPlatform?.gameplayStop?.();
      document.getElementById('gameScreen')?.classList.remove('active');
      document.getElementById('homeScreen')?.classList.add('active');
      modal.classList.add('hidden');
      window.toast?.('Game saved. You can continue your empire later.');
      window.scrollTo({top:0,left:0,behavior:'instant'});
    };
  }
  document.addEventListener('pointerup',e=>{
    const el=e.target instanceof Element?e.target.closest('#endGame'):null;
    if(!el)return;
    e.preventDefault();
    endGame();
  },{passive:false});
  window.ProfitLandsMobileControls={endGame};
})();