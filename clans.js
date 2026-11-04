/* ProfitLands Clans: account-based online groups. No public chat, payments or economy boosts.
 * Requires the accompanying firestore.rules to be DEPLOYED to Firebase.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const validName=value=>/^[\p{L}\p{N}][\p{L}\p{N} ._'-]{2,31}$/u.test(value);
const validTag=value=>/^[A-Z0-9]{2,5}$/.test(value);
const validId=value=>/^[a-zA-Z0-9]{12,30}$/.test(value);
let db=null,auth=null,user=null,busy=false,nonce=0,lastNotice='',lastError=false;
const root=()=> $('clanContent');
const multiplayer=()=>window.state?.playType==='multi';
const memberRef=()=>db.collection('users').doc(user.uid).collection('clanMembership').doc('current');
const nameFor=()=>clean(window.profitlandsProfile?.playerName||user?.displayName||'Player').slice(0,24)||'Player';
function notice(message,error=false){lastNotice=message;lastError=error}
function alertMarkup(){return lastNotice?'<p class="pl-clan-alert '+(lastError?'error':'')+'" role="status">'+esc(lastNotice)+'</p>':''}
function explain(error){
 if(error?.code==='permission-denied')return 'Online clans are not enabled on this Firebase project yet. The new Firestore rules must be deployed by the project owner.';
 if(error?.code==='unavailable')return 'Could not reach the server. Check your connection and retry.';
 return error?.message||'Something went wrong. Please retry.';
}
function noLogin(){
 const el=root();if(!el)return;
 el.innerHTML='<div class="pl-clan-intro"><span class="pl-clan-emblem">🛡️</span><div><h3>Build a clan with other tycoons</h3><p>Start or join a clan to see your fellow players. Sign in to use the online system.</p><button type="button" id="clanSignIn" class="pl-clan-primary">Sign in to Clans</button></div></div>'+
 '<p class="pl-clan-note">Clans use player names, not emails. No public chat or real-money features.</p>';
 $('clanSignIn').onclick=()=>window.profitlandsFirebase?.signIn?.();
}
function guestOrLoading(){
 const el=root();if(!el)return;
 el.innerHTML='<div class="pl-clan-intro"><span class="pl-clan-emblem">🛡️</span><div><h3>Online Clans</h3><p>Cloud connection is not ready. You can continue playing your empire without Clans.</p></div></div>';
}
function renderDirectory(clans){
 const el=root();if(!el)return;
 const rows=clans.map(c=>'<div class="pl-clan-row"><div><strong>['+esc(c.tag)+'] '+esc(c.name)+'</strong><small>'+esc(c.description||'A tycoon clan')+'</small></div><button type="button" data-clan-join="'+esc(c.id)+'">Join</button></div>').join('');
 el.innerHTML='<div class="pl-clan-intro"><span class="pl-clan-emblem">🏰</span><div><span class="eyebrow">CLAN HALL</span><h3>Create a team or join one</h3><p>Clans are online groups tied to your player account. One clan per account.</p></div></div>'+alertMarkup()+
 '<div class="pl-clan-columns"><section class="pl-clan-box"><h4>Found a clan</h4><label for="clanName">Clan name</label><input id="clanName" maxlength="32" placeholder="The Trade Guild" autocomplete="off">'+
 '<label for="clanTag">Clan tag (2–5 characters)</label><input id="clanTag" maxlength="5" placeholder="TTG" autocomplete="off" autocapitalize="characters">'+
 '<label for="clanDescription">Short description</label><textarea id="clanDescription" maxlength="180" rows="3" placeholder="What brings your tycoons together?"></textarea><button id="clanCreate" class="pl-clan-primary" type="button">Create clan</button></section>'+
 '<section class="pl-clan-box"><h4>Join a clan</h4><p>Know a clan ID? Paste it here to join. Clan IDs are public, not secret passwords.</p>'+
 '<label for="clanJoinId">Clan ID</label><input id="clanJoinId" maxlength="30" placeholder="Paste a clan ID" autocomplete="off">'+
 '<button id="clanJoin" class="pl-clan-primary" type="button">Join by ID</button></section></div>'+
 '<div class="pl-clan-box"><h4>Browse clans</h4><p>Join an existing group. Names and rosters are visible to signed-in players.</p><div class="pl-clan-directory">'+(rows||'<p class="pl-clan-note">No clans are listed yet. You could found the first.</p>')+'</div></div>';
 $('clanCreate').onclick=()=>createClan($('clanName').value,$('clanTag').value,$('clanDescription').value);
 $('clanJoin').onclick=()=>joinClan($('clanJoinId').value);
 el.querySelectorAll('[data-clan-join]').forEach(button=>button.onclick=()=>joinClan(button.dataset.clanJoin));
}
function renderMembership(clan,memberDocs){
 const el=root();if(!el)return;
 const isLeader=clan.leaderUid===user.uid;
 const rows=memberDocs.map(d=>'<div class="pl-clan-member"><span>👤 '+esc(d.displayName||'Player')+'</span><small>'+esc(d.role==='leader'?'Founder':'Member')+'</small></div>').join('');
 el.innerHTML='<div class="pl-clan-intro"><span class="pl-clan-emblem">🛡️</span><div><span class="eyebrow">YOUR CLAN</span><h3>['+esc(clan.tag)+'] '+esc(clan.name)+'</h3><p>'+esc(clan.description||'Growing our empires together.')+'</p></div></div>'+alertMarkup()+
 '<div class="pl-clan-box"><div class="pl-clan-toolbar"><div><strong>Members</strong><p>Showing '+memberDocs.length+' player'+(memberDocs.length===1?'':'s')+(memberDocs.length===50?' (first 50)':'')+'</p></div><button id="clanRefresh" type="button">Refresh roster</button></div><div class="pl-clan-roster">'+rows+'</div></div>'+
 '<div class="pl-clan-box pl-clan-share"><h4>Invite other players</h4><p>Share this public clan ID to let others join. This is not a private access code.</p><div class="pl-clan-copy"><code id="clanCopyValue">'+esc(clan.id)+'</code><button id="clanCopy" type="button">Copy ID</button></div></div>'+
 '<button id="clanLeave" class="pl-clan-leave" type="button">'+(isLeader?'Disband clan':'Leave clan')+'</button>';
 $('clanRefresh').onclick=()=>refresh();
 $('clanCopy').onclick=async()=>{
   try{await navigator.clipboard.writeText(clan.id);notice('Clan ID copied.');}
   catch(e){notice('Select the clan ID above to copy it.',true)}
   $('clanCopy').textContent=lastNotice;
 };
 $('clanLeave').onclick=()=>leaveClan(clan,memberDocs);
}
async function refresh(){
 const el=root();if(!el)return;
 const token=++nonce;
 if(!multiplayer()){
   el.innerHTML='<div class="pl-clan-intro"><span class="pl-clan-emblem">🛡️</span><div><h3>Clans are multiplayer-only</h3><p>Switch to Multiplayer to manage your clan. Singleplayer saves and progress are separate.</p></div></div>';
   return false;
 }
 if(window.profitLandsPlatform?.externalAuthDisabled){
   el.innerHTML='<div class="pl-clan-box"><h3>Clans unavailable on this platform</h3><p>Online account features are disabled by this platform. You can keep playing locally.</p></div>';
   return false;
 }
 if(!auth||!db){guestOrLoading();return false}
 user=auth.currentUser;
 if(!user){noLogin();return false}
 el.innerHTML='<p class="pl-clan-loading" role="status">Loading Clans…</p>';
 try{
  const membership=await memberRef().get();
  if(token!==nonce)return false;
  if(membership.exists){
   const id=membership.data().clanId;
   if(!validId(id))throw Error('Invalid clan membership. Contact the game administrator.');
   const snap=await db.collection('clans').doc(id).get();
   if(token!==nonce)return false;
   if(!snap.exists){
     el.innerHTML=alertMarkup()+'<div class="pl-clan-box"><h3>This clan no longer exists.</h3><p>You can clear your membership and join another.</p><button class="pl-clan-primary" type="button" id="clanClear">Clear old membership</button></div>';
     $('clanClear').onclick=()=>leaveOrphan(id);
     return true;
   }
   const members=await db.collection('clans').doc(id).collection('members').limit(50).get();
   if(token!==nonce)return false;
   renderMembership({id,...snap.data()},members.docs.map(x=>x.data()));
  }else{
   const results=await db.collection('clans').limit(12).get();
   if(token!==nonce)return false;
   renderDirectory(results.docs.map(x=>({id:x.id,...x.data()})));
  }
  return true;
 }catch(e){
  if(token!==nonce)return false;
  notice(explain(e),true);
  el.innerHTML='<div class="pl-clan-box"><h3>Clans could not load</h3>'+alertMarkup()+'<button id="clanRetry" class="pl-clan-primary">Try again</button></div>';
  $('clanRetry').onclick=()=>refresh();
  return false;
 }
}
async function perform(work){
 if(busy||!user||!db||!multiplayer())return false;
 busy=true;
 try{await work();notice('Clan updated successfully.');return true}
 catch(e){notice(explain(e),true);return false}
 finally{busy=false;await refresh()}
}
async function createClan(name,tag,description){
 name=clean(name);tag=clean(tag).toUpperCase();description=clean(description);
 if(!validName(name)||!validTag(tag)||description.length>180){notice('Use a 3–32 character name, a 2–5 character letter/number tag and a description under 180 characters.',true);return refresh()}
 return perform(async()=>{
  const clan=db.collection('clans').doc(),index=memberRef(),roster=clan.collection('members').doc(user.uid);
  const stamp=firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx=>{
   if((await tx.get(index)).exists)throw Error('Leave your current clan before creating another.');
   tx.set(clan,{name,tag,description,leaderUid:user.uid,createdAt:stamp});
   tx.set(roster,{displayName:nameFor(),role:'leader',joinedAt:stamp});
   tx.set(index,{clanId:clan.id,role:'leader',joinedAt:stamp});
  });
 });
}
async function joinClan(id){
 id=clean(id);
 if(!validId(id)){notice('Enter a valid clan ID.',true);return refresh()}
 return perform(async()=>{
  const clan=db.collection('clans').doc(id),index=memberRef(),roster=clan.collection('members').doc(user.uid);
  const stamp=firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx=>{
   const membership=await tx.get(index);
   const target=await tx.get(clan);
   if(membership.exists)throw Error('Leave your current clan before joining another.');
   if(!target.exists)throw Error('Clan not found. Check its ID.');
   tx.set(roster,{displayName:nameFor(),role:'member',joinedAt:stamp});
   tx.set(index,{clanId:id,role:'member',joinedAt:stamp});
  });
 });
}
async function leaveOrphan(id){
 if(!window.confirm?.('Clear your old clan membership?'))return false;
 return perform(async()=>{
  const index=memberRef(),batch=db.batch();
  batch.delete(index);batch.delete(db.collection('clans').doc(id).collection('members').doc(user.uid));
  await batch.commit();
 });
}
async function leaveClan(clan,members){
 const leader=clan.leaderUid===user.uid;
 if(leader&&members.length>1){notice('The founder can disband only after other players have left. This prevents removing an active clan.',true);return refresh()}
 if(!window.confirm?.(leader?'Disband your clan? This deletes its group and roster.':'Leave this clan?'))return false;
 return perform(async()=>{
  const batch=db.batch(),ref=db.collection('clans').doc(clan.id);
  batch.delete(ref.collection('members').doc(user.uid));
  batch.delete(memberRef());
  if(leader)batch.delete(ref);
  await batch.commit();
 });
}
function install(){
 if(typeof firebase==='undefined'||!firebase.apps?.length){guestOrLoading();return}
 try{
  auth=firebase.auth();db=firebase.firestore();
  auth.onAuthStateChanged(u=>{user=u;refresh()});
 }catch(e){notice(explain(e),true);guestOrLoading()}
}
window.ProfitLandsClans={render:refresh,create:createClan,join:joinClan,leave:leaveClan,validate:{name:validName,tag:validTag,id:validId}};
window.addEventListener('load',install);
})();
