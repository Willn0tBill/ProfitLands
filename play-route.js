/* ProfitLands /play entry route.
 * / is the only homepage; /play/?new=1 is setup, /play/?resume=1 enters
 * the existing save after Firebase resolves. Navigation never resets a save.
 */
(function(){
'use strict';
const query=new URLSearchParams(location.search);
const mode=query.get('mode'),type=query.get('type');
const allowedModes=new Set(['fast','standard','long','persistent']);
const allowedTypes=new Set(['single','multi']);
let resumed=false;
function tryResume(){
 if(query.get('resume')!=='1'||resumed)return false;
 const button=document.getElementById('resumeLastGame');
 if(!button||button.disabled)return false;
 // This is the production local/cloud resume flow owned by firebase-auth.
 resumed=true;
 button.click();
 return true;
}
function setup(){
 if(query.get('new')==='1'){
  if(allowedModes.has(mode))document.querySelector('.mode-card[data-mode="'+mode+'"]')?.click();
  if(allowedTypes.has(type))document.querySelector('.type-card[data-type="'+type+'"]')?.click();
  const start=document.getElementById('startGame');
  start?.focus({preventScroll:true});
 }
 const settings=document.getElementById('openSettings');
 if(settings)settings.title='Game settings, local save and recovery';
 if(query.get('resume')==='1'){
  const home=document.getElementById('homeScreen');
  if(home){
   const info=document.createElement('p');
   info.className='local-note';
   info.id='plResumeStatus';
   info.setAttribute('role','status');
   info.textContent='Opening your saved empire. You can return to setup if there is no save.';
   home.prepend(info);
  }
  window.addEventListener('profitlands:resume-ready',()=>{
   if(tryResume())return;
   const info=document.getElementById('plResumeStatus');
   if(info)info.textContent='No saved empire is available for the current account on this device. You can set up a new one or return home.';
  });
  tryResume();
 }
}
window.ProfitLandsEntryRoute={tryResume,hasResumed:()=>resumed};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
})();