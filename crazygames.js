/* CrazyGames-only adapter. Other web and Steam builds retain their existing behavior.
 * Progress uses CrazyGames Automatic Progress Save (APS) for localStorage.
 * Never mix SDK Data and localStorage for the same save key.
 * https://docs.crazygames.com/other/aps/
 */
(function(){
  'use strict';
  const hosted=/(^|\.)crazygames\.com$/i.test(location.hostname);
  const packaged=document.querySelector('meta[name="profitlands-platform"]')?.content==='crazygames';
  if(!hosted&&!packaged)return;

  const cg=window.profitLandsPlatform||{};
  Object.assign(cg,{
    name:'crazygames',enabled:true,externalAuthDisabled:true,
    saveBackend:'aps-localStorage',dataReady:false,systemInfo:null
  });
  // app.js is the sole writer of profitlands-v2. The CrazyGames APS service
  // backs up that storage; no separate SDK Data save is made.
  cg.save=()=>{};
  window.profitLandsPlatform=cg;

  let sdk=null,initialized=false,playing=false;
  function emit(method){
    if(!initialized)return;
    try{sdk.game?.[method]?.()}catch(e){console.warn('CrazyGames event failed:',method,e)}
  }
  cg.gameplayStart=()=>{
    if(playing)return;
    playing=true;
    emit('gameplayStart');
  };
  cg.gameplayStop=()=>{
    if(!playing)return;
    playing=false;
    emit('gameplayStop');
  };
  cg.setGameContext=context=>{
    if(!initialized)return;
    try{sdk.game?.setGameContext?.(context)}catch(e){console.warn('CrazyGames context failed:',e)}
  };

  function hasSavedEmpire(){
    for(const key of ['profitlands-v2','profitlands-v2-backup']){
      try{
        const item=JSON.parse(localStorage.getItem(key)||'null');
        if(item&&['fast','standard','long','persistent'].includes(item.mode)&&
           Number.isFinite(Number(item.day))&&Array.isArray(item.businesses)&&
           item.stocks&&typeof item.stocks==='object')return true;
      }catch(e){/* Ignore a damaged save; app.js can recover its backup. */}
    }
    return false;
  }

  function presentUser(user){
    const topbar=document.querySelector('.topbar');
    if(!topbar)return;
    let chip=document.getElementById('plCrazyGamesPlayer');
    if(!chip){
      chip=document.createElement('div');
      chip.id='plCrazyGamesPlayer';
      chip.className='pl-cg-player';
      topbar.appendChild(chip);
    }
    chip.replaceChildren();
    if(user?.username){
      // These values are presentation only, never authentication credentials.
      const name=document.createElement('span');
      name.textContent=user.username;
      if(user.profilePictureUrl){
        const img=document.createElement('img');
        img.src=user.profilePictureUrl;
        img.alt='';
        img.width=24;
        img.height=24;
        chip.appendChild(img);
      }
      chip.appendChild(name);
      if(window.state){window.state.playerName=user.username;window.render?.()}
    }else{
      chip.textContent='Guest player';
    }
  }

  function quickStart(){
    const state=window.state;
    if(!state||state.started)return;
    // The local multiplayer selector is a prototype, not online multiplayer.
    state.playType='single';
    if(hasSavedEmpire()&&typeof window.resumeProfitLands==='function'){
      window.resumeProfitLands();
    }else if(typeof window.startProfitLands==='function'){
      window.startProfitLands();
    }
  }

  async function boot(){
    document.body?.classList.add('pl-crazygames');
    // Only first-time players see the optional quick-start guide by default.
    cg.freshEmpire=!hasSavedEmpire();
    if(cg.freshEmpire)document.body?.classList.add('pl-cg-first-session');
    // Give players real gameplay immediately; SDK initialization is not a
    // prerequisite for starting the local offline economy.
    quickStart();
    const candidate=window.CrazyGames?.SDK;
    if(!candidate)return;
    try{
      await candidate.init();
      if(candidate.environment!=='crazygames'&&candidate.environment!=='local')return;
      sdk=candidate;
      initialized=true;
      cg.systemInfo=sdk.user?.systemInfo||null;
      if(playing)emit('gameplayStart');
      try{
        const user=sdk.user?.isUserAccountAvailable===false
          ?null
          :await sdk.user?.getUser?.();
        presentUser(user||null);
      }catch(e){presentUser(null)}
    }catch(e){
      console.warn('CrazyGames SDK unavailable; local game remains playable:',e);
    }
  }
  window.addEventListener('load',boot,{once:true});
})();
