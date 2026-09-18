/* ProfitLands platform bridge. The game core talks to this interface only. */
(function(){
  if(window.profitLandsPlatform)return;
  window.profitLandsPlatform={
    name:'web', enabled:false, dataReady:false, externalAuthDisabled:false,
    save(state){try{localStorage.setItem('profitlands-v2',JSON.stringify(state))}catch(e){}},
    load(){try{const raw=localStorage.getItem('profitlands-v2');return raw?JSON.parse(raw):null}catch(e){return null}},
    gameplayStart(){}, gameplayStop(){}, setGameContext(){}, systemInfo:null
  };
})();
