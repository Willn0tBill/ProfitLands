/* ProfitLands account-owned Trophy Room.
   Firebase account achievements live at users/{uid}.achievementBook.
   This deliberately does not use Steamworks, require new Firebase rules,
   or treat a per-empire save as the permanent source of truth.
*/
(function(){
'use strict';
const PREFIX='profitlands-account-badges-v1:';
const MAX_RANK=1024,MAX_FEATURED=5;
let uid=null,db=null,ready=false,serial=0,revision=0,flushTimer=null,dirty=false,busy=false,synced=false,unsubscribe=null;
const bookDefault=()=>({version:1,ranks:{},counters:{},featured:[],featuredAt:0,recent:[]});
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
 a.featuredAt=asNum(raw.featuredAt);
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
 // Explicit showcase edits use a timestamp so deletions do not reappear on sync.
 // For pre-migration v1 books, keep the old union behavior without dropping badges.
 const newest=all.reduce((best,b)=>b.featuredAt>best.featuredAt?b:best,bookDefault());
 const featured=newest.featuredAt>0?newest.featured:all.flatMap(x=>x.featured);
 result.featured=[...new Set(featured.filter(validBadge))].slice(-MAX_FEATURED);
 result.featuredAt=newest.featuredAt;
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
function comparable(raw){
 const b=clean(raw);
 const pairs=o=>Object.keys(o).sort().map(k=>k+':'+o[k]).join('|');
 return pairs(b.ranks)+';'+pairs(b.counters)+';'+b.featuredAt+';'+b.featured.join(',');
}
function sameProgress(a,b){return comparable(a)===comparable(b)}
function repaint(){if(window.ProfitLandsWorkspace?.active?.()==='trophies')window.ProfitLandsBadges?.render?.()}
function scheduleFlush(delay=3000){
 if(!uid||!db||flushTimer!==null)return;
 flushTimer=setTimeout(()=>{flushTimer=null;flush()},delay);
}
function changed(){
 if(!ready||!current())return;
 revision++;dirty=true;persistLocal();synced=false;
 scheduleFlush();
}
async function flush(){
 if(!uid||!db||!dirty||busy||!current())return false;
 const owner=uid,epoch=serial,capturedRevision=revision,ref=db.collection('users').doc(uid);
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
  synced=true;dirty=revision!==capturedRevision;repaint();
  return true;
 }catch(e){
  if(epoch===serial&&uid===owner){dirty=true;synced=false;console.warn('Achievement account sync unavailable; saved locally.',e)}
  return false;
 }finally{
  if(epoch===serial&&owner===uid){
   busy=false;
   if(dirty)scheduleFlush(5000);
  }
 }
}
function stopListening(){
 if(typeof unsubscribe==='function'){try{unsubscribe()}catch(e){console.warn('Unable to stop trophy listener.',e)}}
 unsubscribe=null;
}
function watch(owner,epoch){
 if(!db?.collection)return;
 try{
  const ref=db.collection('users').doc(owner);
  if(typeof ref.onSnapshot!=='function')return; // Older test stubs do not implement listeners.
  unsubscribe=ref.onSnapshot(snap=>{
   if(epoch!==serial||owner!==uid||!ready)return;
   const remote=snap.exists?snap.data()?.achievementBook:null;
   const combined=merge(remote,current());
   if(!sameProgress(combined,current())){
    window.state.badgeBook=combined;
    localWrite(uid,combined);
    // A native Steam build also needs badges imported from another device.
    void window.ProfitLandsSteamAchievements?.sync?.();
    repaint();
   }
   synced=!snap.metadata?.fromCache;
   if(!sameProgress(remote,combined)){
    dirty=true;
    scheduleFlush();
   }else if(!busy){
    dirty=false;
   }
  },error=>{
   if(epoch!==serial||owner!==uid)return;
   synced=false;
   console.warn('Live trophy updates unavailable; local progress is preserved.',error);
   if(dirty)scheduleFlush(5000);
  });
 }catch(e){synced=false;console.warn('Trophy listener could not start.',e)}
}
function prepare(nextUid){
 const future=nextUid||null;
 if(ready&&current())persistLocal();
 if(future===uid)return;
 if(flushTimer!==null){clearTimeout(flushTimer);flushTimer=null}
 stopListening();
 serial++;revision=0;uid=null;db=null;ready=false;dirty=false;busy=false;synced=false;
 if(window.state)window.state.badgeBook=null;
}
async function onAuthChanged(user,database){
 stopListening();
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
  changed();
  watch(owner,epoch);
  void window.ProfitLandsSteamAchievements?.sync?.();
 }
 repaint();
 return true;
}
function guestAvailable(){
 const guest=localRead(null);
 return !!guest&&(Object.values(clean(guest).ranks).some(v=>v>0)||Object.values(clean(guest).counters).some(v=>v>0));
}
function importGuest(){
 if(!uid||!ready||!guestAvailable())return false;
 window.state.badgeBook=merge(current(),localRead(null));
 changed();void window.ProfitLandsSteamAchievements?.sync?.();repaint();return true;
}
function beforePageHide(){persistLocal();if(uid&&dirty)void flush()}
function init(){
 window.addEventListener('pagehide',beforePageHide);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')beforePageHide();
 });
}
window.ProfitLandsAccountTrophies={prepare,onAuthChanged,changed,flush,merge,clean,status,localRead,persistLocal,guestAvailable,importGuest};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();