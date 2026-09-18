/* Optional platform adapter. ProfitLands core does not depend on CrazyGames. */
(function(){
  const base={name:'web',enabled:false,dataReady:false,save(state){try{localStorage.setItem('profitlands-v2',JSON.stringify(state))}catch(e){}},load(){try{const raw=localStorage.getItem('profitlands-v2');return raw?JSON.parse(raw):null}catch(e){return null}},gameplayStart(){},gameplayStop(){}};
  window.profitLandsPlatform=base;
  const isCG=/(^|\\.)crazygames\\./i.test(location.hostname);
  if(!isCG)return;
  const cg={...base,name:'crazygames',enabled:true,dataReady:false};
  window.profitLandsPlatform=cg;
  async function boot(){
    try{
      if(!window.CrazyGames?.SDK)return;
      await window.CrazyGames.SDK.init();
      const sdk=window.CrazyGames.SDK;
      cg.dataReady=!!sdk.data;
      if(sdk.data){
        const raw=await sdk.data.getItem('profitlands-v2');
        if(raw){try{const saved=JSON.parse(raw);Object.assign(state,saved)}catch(e){console.warn('Platform save read failed',e)}}
        cg.save=s=>{try{sdk.data.setItem('profitlands-v2',JSON.stringify(s))}catch(e){console.warn('Platform save failed',e)}};
      }
      cg.gameplayStart=()=>{try{sdk.game.gameplayStart()}catch(e){}};
      cg.gameplayStop=()=>{try{sdk.game.gameplayStop()}catch(e){}};
      try{const user=await sdk.user.getUser();if(user?.username){state.playerName=user.username;if(!state.companyName)state.companyName=user.username+' Company'}}catch(e){}
      render();
      if(state.started){startTimer();cg.gameplayStart()}
    }catch(e){console.warn('CrazyGames integration unavailable:',e)}
  }
  window.addEventListener('load',boot,{once:true});
})();
