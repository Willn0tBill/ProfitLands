/* ProfitLands CrazyGames SDK integration */
(function(){
  const isCG=/(^|\\.)crazygames\\./i.test(location.hostname);
  const cg={enabled:isCG,dataReady:false,gameplayStart(){try{window.CrazyGames?.SDK?.game?.gameplayStart?.()}catch(e){}},gameplayStop(){try{window.CrazyGames?.SDK?.game?.gameplayStop?.()}catch(e){}}};
  window.profitlandsCrazyGames=cg;
  async function boot(){
    if(!isCG)return;
    try{
      if(!window.CrazyGames?.SDK)return;
      await window.CrazyGames.SDK.init();
      cg.dataReady=!!window.CrazyGames.SDK.data;
      if(cg.dataReady){
        const raw=window.CrazyGames.SDK.data.getItem('profitlands-v2');
        if(raw){try{Object.assign(state,JSON.parse(raw));}catch(e){console.warn('CrazyGames save read failed',e)}}
        else {const old=localStorage.getItem('profitlands-v2');if(old)window.CrazyGames.SDK.data.setItem('profitlands-v2',old)}
      }
      try{
        const user=await window.CrazyGames.SDK.user?.getUser?.();
        if(user?.username){state.playerName=user.username;if(!state.companyName)state.companyName=user.username+' Company';}
      }catch(e){}
      window.profitlandsSaveHook=()=>{try{window.CrazyGames.SDK.data?.setItem('profitlands-v2',JSON.stringify(state))}catch(e){console.warn('CrazyGames save failed',e)}};
      if(window.render)render();
      if(!state.started)window.startProfitLands?.();else{state.started=true;render();startTimer?.();cg.gameplayStart()}
    }catch(e){console.warn('CrazyGames SDK initialization failed',e);if(!state.started)window.startProfitLands?.()}
  }
  window.addEventListener('load',boot,{once:true});
})();
