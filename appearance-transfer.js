/* Opt-in appearance preferences transfer from the old GitHub Pages origin.
 * Transfers only the three non-sensitive UI booleans. Never reads or writes saves.
 */
(function(){
  'use strict';
  const OLD_ORIGIN='https://willn0tbill.github.io';
  const NEW_ORIGIN='https://profitlands.winotbill.workers.dev';
  const KEY='profitlands-ui-preferences-v1';
  const NAMES=['reducedMotion','compactDisplay','highContrast'];
  const OFFER='profitlands:display-offer-v1';
  const RECEIVED='profitlands:display-received-v1';
  const origin=window.location.origin;
  const status=()=>document.getElementById('preferencesSaved');
  const say=text=>{const node=status();if(node)node.textContent=text};
  const plainValues=value=>Object.fromEntries(NAMES.map(name=>[name,value?.[name]===true]));
  function oldSettings(){
    try{return plainValues(JSON.parse(localStorage.getItem(KEY)||'{}'))}
    catch{return plainValues(null)}
  }
  if(origin===OLD_ORIGIN&&new URLSearchParams(window.location.search).get('pl-appearance-transfer')==='1'){
    if(!window.opener){say('Open this page using the Restore previous appearance button on Cloudflare.');return}
    window.addEventListener('message',event=>{
      if(event.origin!==NEW_ORIGIN||event.source!==window.opener||event.data?.type!==RECEIVED)return;
      say('Display settings transferred. You can close this tab.');
      window.close();
    });
    window.opener.postMessage({type:OFFER,preferences:oldSettings()},NEW_ORIGIN);
    say('Sending your display preferences to the new ProfitLands website…');
    return;
  }
  if(origin!==NEW_ORIGIN)return;
  const init=()=>{
    const actions=document.querySelector('.pl-settings-section .pl-settings-actions');
    if(!actions||document.getElementById('restorePreviousAppearance'))return;
    const button=document.createElement('button');
    button.id='restorePreviousAppearance';
    button.type='button';
    button.className='secondary-button';
    button.textContent='Restore previous display settings';
    button.title='Copies only display preferences from the older GitHub Pages address; does not change or transfer saves.';
    actions.appendChild(button);
    let popup=null;
    window.addEventListener('message',event=>{
      if(event.origin!==OLD_ORIGIN||event.source!==popup||event.data?.type!==OFFER)return;
      const value=plainValues(event.data.preferences);
      try{
        localStorage.setItem(KEY,JSON.stringify(value));
        for(const name of NAMES){
          const input=document.querySelector('[data-preference="'+name+'"]');
          if(!input)continue;
          input.checked=value[name];
          input.dispatchEvent(new Event('change',{bubbles:true}));
        }
        say('Previous display settings restored. Game saves were not changed.');
        popup?.postMessage({type:RECEIVED},OLD_ORIGIN);
      }catch(e){
        say('Could not import the settings. Your existing preferences and save were not deleted.');
      }
    });
    button.addEventListener('click',()=>{
      popup=window.open(OLD_ORIGIN+'/ProfitLands/settings/?pl-appearance-transfer=1','profitlands-appearance-transfer','popup,width=650,height=650');
      if(!popup)say('Pop-up blocked. Allow this site to open the previous ProfitLands settings, then try again.');
      else say('Reading display settings from the previous ProfitLands website…');
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
