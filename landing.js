/* Lightweight homepage navigation. The game engine loads only on /play/. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const allowedModes=new Set(['fast','standard','long','persistent']);
  const allowedTypes=new Set(['single','multi']);
  let mode='standard',type='single';
  const makeUrl=()=>{
    const query=new URLSearchParams({new:'1',mode,type});
    return 'play/?'+query;
  };
  function setup(group,key,onChange){
    document.querySelectorAll(group).forEach(button=>button.addEventListener('click',()=>{
      const value=button.dataset[key];if(!onChange(value))return;
      document.querySelectorAll(group).forEach(x=>{x.classList.toggle('selected',x===button);x.setAttribute('aria-pressed',String(x===button))});
      $('landingStart').href=makeUrl();
      if($('multiNotice'))$('multiNotice').classList.toggle('hidden',type!=='multi');
    }));
  }
  setup('.mode-card','mode',v=>allowedModes.has(v)&&(mode=v,true));
  setup('.type-card','type',v=>allowedTypes.has(v)&&(type=v,true));
  $('landingStart').href=makeUrl();
  function progress(st){
    return st&&((Number(st.day)||1)>1||Math.abs(Number(st.cash)||0)>1000||(Array.isArray(st.businesses)&&st.businesses.length>0)||(Number(st.property)||0)>0||Object.values(st.stocks||{}).some(x=>(Number(x?.shares)||0)>0));
  }
  try{
    const saved=JSON.parse(localStorage.getItem('profitlands-v2')||'null');
    if(progress(saved)){
      $('landingSavedBox').hidden=false;
      $('savedDay').textContent=String(Math.max(1,Math.floor(Number(saved.day)||1)));
      $('savedMode').textContent=allowedModes.has(saved.mode)?saved.mode:'standard';
      $('savedBusinessCount').textContent=String(Array.isArray(saved.businesses)?saved.businesses.length:0);
    }
  }catch(e){console.warn('Saved empire preview unavailable',e)}
})();