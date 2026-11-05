/* Shared ProfitLands display preferences. HTML owns the controls; JS updates state. */
(function(){
  'use strict';
  const KEY='profitlands-ui-preferences-v1';
  const COLORWAY_KEY='profitlands-colorway-v1';
  const readColorway=()=>{
    try{return localStorage.getItem(COLORWAY_KEY)==='vivid'?'vivid':'classic'}
    catch{return 'classic'}
  };
  const defaults={reducedMotion:false,compactDisplay:false,highContrast:false};
  function read(){
    try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...Object.fromEntries(Object.keys(defaults).map(k=>[k,stored[k]===true]))};}
    catch{return {...defaults}}
  }
  function apply(settings){
    const root=document.documentElement;
    root.classList.toggle('pl-colorway-vivid',readColorway()==='vivid');
    for(const [key,cls] of Object.entries({reducedMotion:'pl-reduced-motion',compactDisplay:'pl-compact',highContrast:'pl-contrast'})){
      root.classList.toggle(cls,settings[key]===true);
    }
  }
  const values=read();
  apply(values);
  function syncControls(){
    const colorwayControl=document.querySelector('[data-colorway]');
    if(colorwayControl)colorwayControl.value=readColorway();
    for(const name of Object.keys(defaults)){
      const input=document.querySelector('[data-preference="'+name+'"]');
      if(input)input.checked=values[name];
    }
  }
  // Settings can be open in a second tab. Follow that tab without
  // overwriting game progress or persisting a redundant update.
  window.addEventListener?.('storage',event=>{
    if(event.key!==KEY&&event.key!==COLORWAY_KEY&&event.key!==null)return;
    Object.assign(values,read());
    apply(values);
    syncControls();
    const saved=document.getElementById('preferencesSaved');
    if(saved)saved.textContent='Display preferences updated from another tab.';
  });
  const init=()=>{
    const colorwayControl=document.querySelector('[data-colorway]');
    if(colorwayControl){
      colorwayControl.value=readColorway();
      colorwayControl.addEventListener('change',()=>{
        const value=colorwayControl.value==='vivid'?'vivid':'classic';
        try{localStorage.setItem(COLORWAY_KEY,value)}catch(e){console.warn('Cannot persist visual style',e)}
        apply(values);
        const saved=document.getElementById('preferencesSaved');
        if(saved)saved.textContent='Appearance updated. Your saved empire was not changed.';
      });
    }
    for(const name of Object.keys(defaults)){
      const input=document.querySelector('[data-preference="'+name+'"]');
      if(!input)continue;
      input.checked=values[name];
      input.addEventListener('change',()=>{
        values[name]=input.checked;
        apply(values);
        try{localStorage.setItem(KEY,JSON.stringify(values))}catch(e){console.warn('Cannot persist display preference',e)}
        const saved=document.getElementById('preferencesSaved');if(saved)saved.textContent='Display preferences saved to this browser.';
      });
    }
    const reset=document.getElementById('resetPreferences');
    reset?.addEventListener('click',()=>{
      Object.assign(values,defaults);
      try{localStorage.removeItem(KEY);localStorage.removeItem(COLORWAY_KEY)}catch(e){}
      apply(values);
      syncControls();
      const saved=document.getElementById('preferencesSaved');if(saved)saved.textContent='Display preferences reset. Your game progress was not changed.';
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.ProfitLandsPreferences={read:()=>({...values}),colorway:readColorway};
})();