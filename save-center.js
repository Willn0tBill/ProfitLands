/* ProfitLands Save Center — opt-in local backups and guarded recovery.
 * No economy changes, no new game-save fields, no external dependencies.
 * The CrazyGames package uses APS and does not expose manual file import.
 */
(function(){
'use strict';
const KEY='profitlands-v2';
const BACKUP='profitlands-v2-backup';
const PREIMPORT='profitlands-v2-before-import';
const MAX_FILE=4*1024*1024;
const DURATIONS=Object.freeze({fast:300,standard:900,long:3600,persistent:86400});
const MODE_SET=new Set(Object.keys(DURATIONS));
const blockedKeys=new Set(['__proto__','constructor','prototype']);
const $=id=>document.getElementById(id);
let root=null,note=null,importer=null,lastMessage='';
const playing=()=>Boolean($('gameScreen')?.classList.contains('active')&&window.state?.started);
const isCrazyGames=()=>window.profitLandsPlatform?.name==='crazygames';
const isSignedIn=()=>Boolean(window.profitlandsFirebase?.getCurrentUser?.());
const fmtDate=ms=>{
 const n=Number(ms);
 return Number.isFinite(n)&&n>0?new Date(n).toLocaleString():'Not yet saved';
};
function currentMeta(){
 let parsed=null;
 try{parsed=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
 return {available:Boolean(parsed&&typeof parsed==='object'),lastSaved:parsed?.savedAt||null,
  businesses:Array.isArray(parsed?.businesses)?parsed.businesses.length:0,
  day:Number.isFinite(Number(parsed?.day))?Number(parsed.day):0,
  backupAvailable:Boolean((()=>{try{return localStorage.getItem(BACKUP)}catch(e){return null}})())};
}
function inspectShape(x,depth,counts){
 if(depth>32)throw Error('The backup is nested too deeply.');
 counts.objects++;
 if(counts.objects>150000)throw Error('The backup contains too many entries.');
 if(x===null)return;
 if(typeof x==='number'&&!Number.isFinite(x))throw Error('The backup contains invalid numbers.');
 if(typeof x==='string'){
  if(x.length>65536||/[<>]/.test(x))throw Error('The backup contains unsupported text or HTML.');
  return;
 }
 if(typeof x!=='object')return;
 if(Array.isArray(x)){
  if(x.length>50000)throw Error('The backup contains an oversized collection.');
  for(const value of x)inspectShape(value,depth+1,counts);
  return;
 }
 if(Object.getPrototypeOf(x)!==Object.prototype)throw Error('The backup has an invalid structure.');
 for(const [key,value] of Object.entries(x)){
  if(blockedKeys.has(key))throw Error('The backup contains an unsafe field.');
  inspectShape(value,depth+1,counts);
 }
}
function parseSnapshot(text){
 if(typeof text!=='string'||text.length>MAX_FILE)throw Error('Select a ProfitLands JSON save smaller than 4 MB.');
 let data;
 try{data=JSON.parse(text)}catch(e){throw Error('This file is not valid JSON.')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('This file is not a ProfitLands empire.');
 inspectShape(data,0,{objects:0});
 if(!MODE_SET.has(data.mode))throw Error('The backup has an unknown game mode.');
 if(data.saveVersion!==4)throw Error('This version of Save Center supports ProfitLands v4 saves only.');
 if(!Number.isSafeInteger(data.day)||data.day<1||data.day>1000000000)throw Error('The saved game day is invalid.');
 if(!Number.isFinite(data.cash)||data.cash<0)throw Error('The saved cash balance is invalid.');
 if(typeof data.cashHuge!=='string')throw Error('The backup is missing its large-money ledger.');
 try{
  const bank=window.ProfitLandsMoney?.parse?.(data.cashHuge);
  if(!bank||bank.m<0)throw Error('Invalid amount');
 }catch(e){throw Error('The saved large-money ledger is invalid.')}
 if(!Array.isArray(data.businesses)||data.businesses.length>100)throw Error('The business portfolio is invalid.');
 const allowed=new Set((window.BUSINESS_TYPES||[]).map(b=>b.id));
 if(allowed.size<1)throw Error('Business catalogue is not available.');
 for(const business of data.businesses){
  if(!business||typeof business!=='object'||!allowed.has(business.type))throw Error('An unknown business type was found.');
  if(typeof business.name!=='string'||business.name.length>120)throw Error('A business name is invalid.');
  if(business.locations!==undefined&&(!Array.isArray(business.locations)||business.locations.length>400))throw Error('A location list is invalid.');
  for(const location of business.locations||[]){
   if(!location||typeof location!=='object')throw Error('A business location is invalid.');
   if(location.level!==undefined&&(!Number.isSafeInteger(location.level)||location.level<1||location.level>100000000))throw Error('A location level is invalid.');
  }
 }
 if(!data.stocks||typeof data.stocks!=='object'||Array.isArray(data.stocks))throw Error('Stock holdings are invalid.');
 for(const holding of Object.values(data.stocks)){
  if(!holding||typeof holding!=='object'||!Number.isFinite(Number(holding.shares))||Number(holding.shares)<0)throw Error('Stock holdings are invalid.');
 }
 if(!Array.isArray(data.news)||data.news.length>10000)throw Error('The news history is invalid.');
 if(data.actions!==undefined&&(!Number.isFinite(Number(data.actions))||Number(data.actions)<0))throw Error('The action balance is invalid.');
 return data;
}
function message(text,error=false){
 lastMessage=text;
 if(note){note.textContent=text;note.dataset.error=error?'true':'false'}
}
function manualSave(){
 if(!playing()){message('Open an empire before saving.',true);return false}
 try{
  window.save?.();
  const raw=localStorage.getItem(KEY);
  if(!raw)throw Error('Your browser did not store the save.');
  const saved=JSON.parse(raw);
  if(!saved||!Number.isFinite(saved.savedAt))throw Error('Save verification failed.');
  message('Local snapshot saved at '+fmtDate(saved.savedAt)+'.');
  renderStatus();
  return true;
 }catch(e){message('Local save failed: '+e.message,true);return false}
}
function download(){
 if(isCrazyGames()){message('CrazyGames manages its own platform saves.',true);return false}
 if(!manualSave())return false;
 try{
  const raw=localStorage.getItem(KEY);
  parseSnapshot(raw);
  const blob=new Blob([raw],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='ProfitLands-Day-'+window.state.day+'-backup.json';
  a.style.display='none';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  message('Backup downloaded. Store it somewhere private.');
  return true;
 }catch(e){message('Could not export backup: '+e.message,true);return false}
}
function applySnapshot(data){
 const current=window.state;
 if(!current)throw Error('Game is not initialized.');
 const before=JSON.stringify(current);
 const previous=localStorage.getItem(KEY);
 // Reserve an independent recovery copy; normal autosaves rotate a different key.
 if(previous)localStorage.setItem(PREIMPORT,previous);
 try{
  Object.assign(current,data);
  current.started=true;
  const duration=DURATIONS[current.mode]||900;
  const remaining=Number(current.timeLeft);
  if(!Number.isFinite(Number(current.dayEndsAt))||Number(current.dayEndsAt)<=Date.now()){
   current.timeLeft=Math.min(duration,Math.max(1,Number.isFinite(remaining)?remaining:duration));
   current.dayEndsAt=Date.now()+current.timeLeft*1000;
  }
  window.ProfitLandsMoney?.attach?.(current);
  window.restoreProfitLandsMarket?.();
  window.ProfitLandsBalance?.migrate?.();
  window.ProfitLandsLocationOps?.normalizeAll?.();
  window.ProfitLandsGrowth?.ensure?.();
  window.save?.();
  window.render?.();
  window.startTimer?.();
  window.ProfitLandsGrowth?.render?.();
  window.ProfitLandsWorkspace?.show?.('overview');
  $('settingsModal')?.classList.add('hidden');
  return true;
 }catch(e){
  // Do not strand the active player in a partially imported empire.
  Object.assign(current,JSON.parse(before));
  window.ProfitLandsMoney?.attach?.(current);
  if(previous)localStorage.setItem(KEY,previous);
  window.render?.();
  throw e;
 }
}
function restore(raw,source='file',confirmed=false){
 if(!playing()){message('Open a game before restoring an empire.',true);return false}
 if(isCrazyGames()){message('CrazyGames restores progress through its platform save system.',true);return false}
 if(isSignedIn()){message('Sign out of your ProfitLands account before importing a device backup to avoid overwriting cloud progress.',true);return false}
 let data;
 try{data=parseSnapshot(raw)}catch(e){message(e.message,true);return false}
 const summary='Restore '+source+'? Day '+data.day+' · '+data.businesses.length+' companies. This replaces the active local empire. A recovery copy will be kept.';
 if(!confirmed&&!window.confirm?.(summary)){message('Restore cancelled; your current empire was not changed.');return false}
 try{
  applySnapshot(data);
  message('Restored Day '+data.day+' from '+source+'.');
  return true;
 }catch(e){message('Restore failed; original save retained: '+e.message,true);return false}
}
function fromBackup(){
 let raw;
 try{raw=localStorage.getItem(BACKUP)}catch(e){}
 if(!raw){message('There is no automatic recovery snapshot on this browser.',true);return false}
 return restore(raw,'automatic backup');
}
function renderStatus(){
 if(!root)return;
 const data=currentMeta();
 const summary=root.querySelector('[data-save-state]');
 if(summary)summary.textContent=(data.available?'Day '+data.day+' · '+data.businesses+' companies · Last saved '+fmtDate(data.lastSaved):'No saved empire found on this device.');
 const b=root.querySelector('[data-save-restore]');
 if(b)b.disabled=!data.backupAvailable||isCrazyGames();
 const manual=root.querySelector('[data-save-now]');
 if(manual)manual.disabled=!playing();
 const file=root.querySelector('[data-save-import]');
 if(file)file.disabled=isCrazyGames()||isSignedIn();
}
function elem(tag,cls,text){
 const e=document.createElement(tag);
 if(cls)e.className=cls;if(text!==undefined)e.textContent=text;
 return e;
}
function addButton(section,label,attr,action){
 const button=elem('button','pl-save-action',label);
 button.type='button';button.dataset[attr]='';button.addEventListener('click',action);
 section.appendChild(button);return button;
}
function initialize(){
 const modal=$('settingsModal');
 if(!modal||root)return;
 const original=modal.querySelector('.settings-list');
 const description=modal.querySelector('.modal-sub');
 if(description)description.textContent='Manage local saves, recovery, and display settings. Your empire continues earning while this panel is open.';
 original?.remove();
 root=elem('div','pl-save-center');
 const summary=elem('div','pl-save-summary');
 const headline=elem('strong','', 'Save & Recovery');
 const status=elem('p','','Checking your latest local snapshot...');
 status.dataset.saveState='';
 summary.append(headline,status);root.appendChild(summary);
 const actions=elem('div','pl-save-actions');
 addButton(actions,'Save now','saveNow',manualSave);
 if(!isCrazyGames()){
  addButton(actions,'Download backup','saveDownload',download);
  addButton(actions,'Import backup','saveImport',()=>importer?.click());
  addButton(actions,'Restore last backup','saveRestore',fromBackup);
  importer=elem('input');
  importer.type='file';importer.accept='.json,application/json';importer.hidden=true;
  importer.addEventListener('change',async()=>{
   const file=importer.files?.[0];if(!file)return;
   try{
    if(file.size>MAX_FILE)throw Error('Backup files must be smaller than 4 MB.');
    const raw=await file.text();
    restore(raw,file.name);
   }catch(e){message(e.message,true)}
   importer.value='';
  });
  actions.appendChild(importer);
 }else{
  actions.appendChild(elem('p','pl-save-info','CrazyGames handles progress through its platform save system. File import and export are disabled here.'));
 }
 root.appendChild(actions);
 const prefs=elem('div','pl-save-display');
 const link=elem('a','pl-save-display-link','Display & accessibility settings');
 link.href='../settings/';link.addEventListener('click',()=>{if(playing())window.save?.()});
 prefs.append(link,elem('p','','Change reduced motion, compact display and high contrast without resetting progress.'));
 root.appendChild(prefs);
 note=elem('p','pl-save-note','');note.setAttribute('role','status');note.setAttribute('aria-live','polite');root.appendChild(note);
 modal.querySelector('.modal-card')?.appendChild(root);
 $('openSettings')?.addEventListener('click',renderStatus);
 renderStatus();
}
window.ProfitLandsSaveCenter={parseSnapshot,restore,fromBackup,manualSave,download,currentMeta,initialize,applySnapshot};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
else initialize();
})();