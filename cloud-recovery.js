/* Conflict-only save picker. Never chooses a version without player input. */
(function(root){
'use strict';
function summary(save){
 const s=save&&typeof save==='object'?save:{};
 const day=Math.max(1,Math.floor(Number(s.day)||1));
 const shops=Array.isArray(s.businesses)?s.businesses.length:0;
 const cash=Number.isFinite(Number(s.cash))?Number(s.cash).toLocaleString():'unknown';
 return 'Day '+day+' · '+shops+' business'+(shops===1?'':'es')+' · $'+cash;
}
function choose(local,cloud){
 return new Promise(resolve=>{
  if(!root?.document?.body){resolve('later');return;}
  const doc=root.document;
  doc.getElementById('plCloudRecoveryOverlay')?.remove();
  const styleId='plCloudRecoveryStyle';
  if(!doc.getElementById(styleId)){
   const style=doc.createElement('style');
   style.id=styleId;
   style.textContent='.pl-cloud-recovery{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(5,9,13,.90)}.pl-cloud-recovery-dialog{width:min(560px,100%);max-height:90vh;overflow:auto;border:1px solid #374654;border-radius:18px;padding:24px;background:#111820;color:#ecf4eb;box-shadow:0 20px 70px #000b}.pl-cloud-recovery-dialog h2{margin:0 0 12px}.pl-cloud-recovery-dialog p{line-height:1.5}.pl-cloud-versions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.pl-cloud-version{padding:12px;border-radius:12px;border:1px solid #364554;background:#19212a}.pl-cloud-version strong{display:block;margin-bottom:8px;color:#b9f285}.pl-cloud-recovery-actions{display:flex;gap:10px;flex-wrap:wrap}.pl-cloud-recovery-actions button{flex:1;min-width:135px;border-radius:10px;padding:11px 12px;cursor:pointer}.pl-cloud-recovery-actions button:focus-visible{outline:3px solid #aef45f;outline-offset:3px}@media(max-width:520px){.pl-cloud-versions{grid-template-columns:1fr}.pl-cloud-recovery-actions{flex-direction:column}}';
   doc.head.appendChild(style);
  }
  const overlay=doc.createElement('div');
  overlay.id='plCloudRecoveryOverlay';
  overlay.className='pl-cloud-recovery';
  const dialog=doc.createElement('section');
  dialog.className='pl-cloud-recovery-dialog';
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','plCloudRecoveryTitle');
  const eyebrow=doc.createElement('p');
  eyebrow.className='eyebrow';
  eyebrow.textContent='SAVE CONFLICT';
  const title=doc.createElement('h2');
  title.id='plCloudRecoveryTitle';
  title.textContent='Choose which empire to keep';
  const explanation=doc.createElement('p');
  explanation.textContent='Another device saved progress since this device last synced. Both versions can be backed up. Automatic cloud saving is paused until you choose.';
  const versions=doc.createElement('div');
  versions.className='pl-cloud-versions';
  for(const [name,save] of [['This device',local],['Cloud account',cloud]]){
   const box=doc.createElement('div');
   box.className='pl-cloud-version';
   const heading=doc.createElement('strong');
   heading.textContent=name;
   const detail=doc.createElement('span');
   detail.textContent=summary(save);
   box.append(heading,detail);
   versions.appendChild(box);
  }
  const caution=doc.createElement('p');
  caution.textContent='Choosing a version replaces the active save. A recovery copy of the other version is kept on this device.';
  const actions=doc.createElement('div');
  actions.className='pl-cloud-recovery-actions';
  const previous=doc.activeElement;
  const controls=[];
  const finish=value=>{
   overlay.remove();
   previous?.focus?.();
   resolve(value);
  };
  for(const [label,value,cls] of [
   ['Keep this device','local','primary-button'],
   ['Use cloud empire','cloud','secondary-button'],
   ['Decide later','later','secondary-button']
  ]){
   const button=doc.createElement('button');
   button.type='button';
   button.className=cls;
   button.textContent=label;
   button.addEventListener('click',()=>finish(value));
   controls.push(button);
   actions.appendChild(button);
  }
  overlay.addEventListener('keydown',event=>{
   if(event.key==='Escape'){
    event.preventDefault();
    event.stopPropagation();
    finish('later');
   }else if(event.key==='Tab'){
    const index=controls.indexOf(doc.activeElement);
    if(event.shiftKey&&index<=0){event.preventDefault();controls[controls.length-1].focus()}
    else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0].focus()}
   }
  });
  dialog.append(eyebrow,title,explanation,versions,caution,actions);
  overlay.appendChild(dialog);
  doc.body.appendChild(overlay);
  controls[0].focus();
 });
}
const api={choose,summary};
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ProfitLandsCloudRecovery=api;
})(typeof window!=='undefined'?window:null);
