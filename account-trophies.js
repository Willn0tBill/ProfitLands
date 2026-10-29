/* ProfitLands account-owned Trophy Room.
   Firebase account achievements live at users/{uid}.achievementBook.
   This deliberately does not use Steamworks, require new Firebase rules,
   or treat a per-empire save as the permanent source of truth.
*/
(function(){
'use strict';
const PREFIX='profitlands-account-badges-v1:';
const TRACK_COUNT=128,MAX_RANK=1024,MAX_FEATURED=5;
let uid=null,db=null,ready=false,serial=0,flushTimer=null,dirty=false,busy=false,synced=false;
const bookDefault=()=>({version:1,ranks:{},counters:{},featured:[],recent:[]});
const allowed=()=>new Set((window.ProfitLandsBadges?.INDUSTRIES||[]).flatMap(i=>
 (window.ProfitLandsBadges?.TRACKS||[]).map(t=>i[0]+'.'+t.id)));
const asNum=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const getStorage=(who)=>PREFIX+(who||'guest');
function clean(raw){
 const a=bookDefault(),valid=allowed();
 if(!raw||typeof raw!=='object')return a;
 for(const [key,value]of Object.entries(raw.ranks||{})){
  if(valid.has(key))a.ranks[key]=Math.min(MAX_RANK,Math.floor(asNum(value)));
 }
 for(const [key,value]of Object.entries(raw.counters||{})){
  if(valid.has(key))a.counters[key]=Math.min(Number.MAX_VALUE,asNum(value));
 }
 if(Array.isArray(raw.featured))a.featured=raw.featured.filter(x=>typeof x==='string').slice(-MAX_FEATURED);
 if(Array.isArray(raw.recent))a.recent=raw.recent.filter(x=>typeof x==='string').slice(0,10);
 return a;
}
function merge(...sources){
 const all=sources.map(clean),result=bookDefault();
 for(const b of all){
  for(const [key,value]of Object.entries(b.ranks))result.ranks[key]=Math.max(result.ranks[key]||0,value);
  // Taking the maximum, rather than summing, avoids double-counting the
  // same cumulative events when two devices synchronize duplicate saves.
  for(const [key,value]of Object.entries(b.counters))result.counters[key]=Math.max(result.counters[key]||0,value);
 }
 const validBadge=value=>{
  if(typeof value!=='string')return false;
  const items=value.split('.');
  return items.length===3&&allowed().has(items[0]+'.'+items[1])&&
    Number.isInteger(Number(items[2]))&&Number(items[2])>=1&&
    Number(items[2])<=(result.ranks[items[0]+'.'+items[1]]||0);
 };
 const featured=all.flatMap(x=>x.featured).filter(validBadge);
 result.featured=[...new Set(featured)].slice(-MAX_FEATURED);
 result.recent=[...new Set(all.flatMap(x=>x.recent).filter(validBadge))].slice(0,10);
 return result;
}
function localRead(who){
 try{const raw=localStorage.getItem(getStorage(who));return raw?JSON.parse(raw):null}catch(e){return null}
}
function localWrite(who,book){
 try{localStorage.setItem(getStorage(who),JSON.stringify(clean(book)));return true}catch(e){return false}
}
function current(){return window.state?.badgeBook||null}
function persistLocal(){
 if(!ready||!current())return false;
 return localWrite(uid,current());
}
function status(){return{account:uid?'account':'guest',synced:!!uid&&synced,pending:dirty||busy,loggedIn:!!uid}}
function repaint(){if(window.ProfitLandsWorkspace?.active?.()==='trophies')window.ProfitLandsBadges?.render?.()}
function changed(){
 if(!ready||!current())return;
 dirty=true;persistLocal();
 if(!uid)return;
 if(flushTimer!==null)return;
 flushTimer=setTimeout(()=>{flushTimer=null;flush()},15000);
}
async function flush(){
 if(!uid||!db||!dirty||busy||!current())return false;
 const owner=uid,epoch=serial,ref=db.collection('users').doc(uid);
 const snapshot=clean(current());
 busy=true;
 try{
  const combined=await db.runTransaction(async transaction=>{
   const snap=await transaction.get(ref);
   const remote=snap.exists?snap.data()?.achievementBook:null;
   const result=merge(remote,snapshot);
   transaction.set(ref,{achievementBook:result},{merge:true});
   return result;
  });
  if(epoch!==serial||owner!==uid)return false;
  window.state.badgeBook=merge(combined,current());
  localWrite(uid,window.state.badgeBook);
  synced=true;dirty=false;repaint();
  return true;
 }catch(e){
  if(epoch===serial&&uid===owner){dirty=true;synced=false;console.warn('Achievement account sync unavailable; saved locally.',e)}
  return false;
 }finally{busy=false}
}
function prepare(nextUid){
 const future=nextUid||null;
 if(ready&&current())persistLocal();
 if(future===uid)return;
 if(flushTimer!==null){clearTimeout(flushTimer);flushTimer=null}
 serial++;uid=null;db=null;ready=false;dirty=false;busy=false;synced=false;
 if(window.state)window.state.badgeBook=null;
}
async function onAuthChanged(user,database){
 const owner=user?.uid||null,epoch=++serial;
 uid=owner;db=owner?database:null;ready=false;synced=false;dirty=false;
 let cloud=null;
 if(owner&&db){
  try{
   const doc=await db.collection('users').doc(owner).get();
   cloud=doc.exists?doc.data()?.achievementBook:null;
  }catch(e){console.warn('Cloud achievements unavailable; using saved local trophies.',e)}
 }
 if(epoch!==serial||uid!==owner)return false;
 const stateBook=current(),accountBook=localRead(owner);
 // The Firebase cloud game save has already been loaded before this hook.
 // When signed out on a device associated with another user, do not import
 // that other person's account trophies into the guest collection.
 const deviceOwner=(()=>{try{return localStorage.getItem('profitlands-local-owner')}catch(e){return null}})();
 const legacyAllowed=Boolean(owner)||!deviceOwner;
 const combined=merge(accountBook,cloud,legacyAllowed?stateBook:null);
 if(window.state)window.state.badgeBook=combined;
 ready=true;synced=!!cloud&&!!owner;
 localWrite(owner,combined);
 if(owner){
  dirty=true;changed();
 }
 repaint();
 return true;
}
function beforePageHide(){persistLocal()}
function init(){
 window.addEventListener('pagehide',beforePageHide);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')persistLocal();
 });
}
window.ProfitLandsAccountTrophies={prepare,onAuthChanged,changed,flush,merge,clean,status,localRead,persistLocal};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();