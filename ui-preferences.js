/* Shared ProfitLands display preferences. HTML owns the controls; JS updates state. */
(function(){
  'use strict';
  const KEY='profitlands-ui-preferences-v1';
  const defaults={reducedMotion:false,compactDisplay:false,highContrast:false};
  function read(){
    try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...Object.fromEntries(Object.keys(defaults).map(k=>[k,stored[k]===true]))};}
    catch{return {...defaults}}
  }
  function apply(settings){
    const root=document.documentElement;
    for(const [key,cls] of Object.entries({reducedMotion:'pl-reduced-motion',compactDisplay:'pl-compact',highContrast:'pl-contrast'})){
      root.classList.toggle(cls,settings[key]===true);
    }
  }
  const values=read();
  apply(values);
  const init=()=>{
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
      Object.assign(values,defaults);apply(values);
      try{localStorage.removeItem(KEY)}catch(e){}
      for(const name of Object.keys(defaults)){
        const input=document.querySelector('[data-preference="'+name+'"]');if(input)input.checked=false;
      }
      const saved=document.getElementById('preferencesSaved');if(saved)saved.textContent='Display preferences reset. Your game progress was not changed.';
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.ProfitLandsPreferences={read:()=>({...values})};
})();