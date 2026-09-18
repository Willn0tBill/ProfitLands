/* Optional CrazyGames adapter. The ProfitLands game core remains platform-independent. */
(function(){
  const platform=window.profitLandsPlatform||{};
  const isCrazyGamesHost=/(^|\\.)crazygames\\./i.test(location.hostname);
  if(!isCrazyGamesHost)return;
  const cg=Object.assign(platform,{name:'crazygames',enabled:true,externalAuthDisabled:true,dataReady:false,systemInfo:null});
  window.profitLandsPlatform=cg;
  async function boot(){
    try{
      if(!window.CrazyGames?.SDK)return;
      await window.CrazyGames.SDK.init();
      const sdk=window.CrazyGames.SDK;
      if(sdk.environment&&sdk.environment!=='crazygames')return;
      try{sdk.game.loadingStart?.()}catch(e){}
      cg.dataReady=!!sdk.data;
      cg.gameplayStart=()=>{try{sdk.game?.gameplayStart?.()}catch(e){}};
      cg.gameplayStop=()=>{try{sdk.game?.gameplayStop?.()}catch(e){}};
      cg.setGameContext=context=>{try{sdk.game?.setGameContext?.(context)}catch(e){}};
      cg.systemInfo=sdk.user?.systemInfo||null;
      if(sdk.data){
        try{
          const raw=await sdk.data.getItem('profitlands-v2');
          if(raw){try{Object.assign(state,JSON.parse(raw))}catch(e){console.warn('CrazyGames save read failed',e)}}
        }catch(e){console.warn('CrazyGames save read failed',e)}
        cg.save=s=>{try{sdk.data.setItem('profitlands-v2',JSON.stringify(s))}catch(e){console.warn('CrazyGames save failed',e)}};
      }
      try{
        const user=await sdk.user?.getUser?.();
        if(user?.username){state.playerName=user.username;if(!state.companyName)state.companyName=user.username+' Company'}
      }catch(e){}
      try{sdk.game.loadingStop?.()}catch(e){}
      render();
      if(state.started){startTimer();cg.gameplayStart()}
    }catch(e){
      try{window.CrazyGames?.SDK?.game?.loadingStop?.()}catch(_e){}
      console.warn('CrazyGames integration unavailable:',e);
    }
  }
  window.addEventListener('load',boot,{once:true});
})();
