/* /play/ route bootstrapping. Leaves the existing game engine and saves intact. */
(function(){
  'use strict';
  const q=new URLSearchParams(location.search);
  const mode=q.get('mode'),type=q.get('type');
  const allowedModes=new Set(['fast','standard','long','persistent']);
  const allowedTypes=new Set(['single','multi']);
  const setup=()=>{
    // The player still confirms Start New Empire and is asked for a profile.
    // Never auto-reset a saved or cloud empire on a page navigation.
    if(q.get('new')==='1'){
      if(allowedModes.has(mode))document.querySelector('.mode-card[data-mode="'+mode+'"]')?.click();
      if(allowedTypes.has(type))document.querySelector('.type-card[data-type="'+type+'"]')?.click();
      const start=document.getElementById('startGame');
      start?.focus({preventScroll:true});
    }
    const settings=document.getElementById('openSettings');
    if(settings){
      settings.title='Open display and accessibility settings';
      settings.addEventListener('click',e=>{
        e.preventDefault();e.stopImmediatePropagation();
        if(typeof window.save==='function'&&window.state?.started)window.save();
        location.href='../settings/';
      },true);
    }
    if(q.get('resume')==='1'){
      const box=document.getElementById('homeScreen');
      if(box){
        const info=document.createElement('p');
        info.className='local-note';
        info.textContent='Choose Continue Game below to restore a saved empire, or start a new one.';
        box.prepend(info);
      }
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();