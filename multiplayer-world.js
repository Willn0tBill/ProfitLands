/* ProfitLands multiplayer World Hub.
 * This is the CLIENT shell only. No fake leaderboards, simulated players or
 * client-side cash deductions. All online actions require a trusted backend.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const rules=()=>window.ProfitLandsPvPRules;
const online=()=>window.ProfitLandsOnline;
const active=()=>window.state?.playType==='multi'&&Boolean($('gameScreen')?.classList.contains('active'));
const connected=()=>active()&&online()?.isConnected?.()===true;
const regionalWorlds=()=>online()?.getWorlds?.()||[
 {id:'world1',region:'Americas',label:'World 1 · Americas'},
 {id:'world-europe',region:'Europe',label:'World 2 · Europe'},
 {id:'world-asia',region:'Asia',label:'World 3 · Asia'}];
const regionId=()=>online()?.getSelectedWorld?.()||'world1';
const region=()=>regionalWorlds().find(w=>w.id===regionId())||regionalWorlds()[0];
const worldDisplay=()=>regionId()==='world1'?'World 1':region().label;
function regionSelector(){
 return '<div class="pl-world-region-switch" role="group" aria-label="Select multiplayer region">'+
 regionalWorlds().map(w=>'<button type="button" data-world-region="'+esc(w.id)+
 '" aria-pressed="'+(w.id===regionId()?'true':'false')+'"><strong>'+esc(w.region)+
 '</strong><small>'+esc(w.label)+'</small></button>').join('')+
 '</div><p class="pl-online-note pl-world-region-note">Three independent worlds · 64 accounts per region · Separate cash, rankings and PvP.</p>';
}
function bindRegionSelector(root){
 (root.querySelectorAll?.('[data-world-region]')||[]).forEach(btn=>btn.addEventListener('click',()=>{
  const next=btn.dataset.worldRegion;
  if(next===regionId())return;
  const chat=$('worldChatMessages');if(chat)chat.textContent='Switching regional chat…';
  const blocked=$('worldChatBlockedList');if(blocked)blocked.replaceChildren();
  const moderator=$('worldChatModerator');if(moderator)moderator.hidden=true;
  if(online()?.selectWorld?.(next)){
   ownPlayer=null;liveWallet=null;liveCorrection='';players=[];targetUid='';period='day';
   chatNextAt=0;chatFailures=0;nextAutoRetryAt=0;autoFailures=0;
   latest++;empireStamp++;playersStamp++;lastWorldRefreshAt=0;
   render();
  }
 }));
 const heading=$('worldPanelHeading');if(heading)heading.textContent=region().label+' · Tycoon Arena';
}
const signedIn=()=>{
 try{return Boolean(window.profitlandsFirebase?.getCurrentUser?.()||window.firebase?.auth?.().currentUser)}
 catch(e){return false}
};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const cash=value=>{
 const number=Number(value);
 if(!Number.isFinite(number))return '—';
 if(number<0)return '-'+cash(-number);
 return '$'+(number>=1e12?(number/1e12).toFixed(2)+'T':number>=1e9?(number/1e9).toFixed(2)+'B':number>=1e6?(number/1e6).toFixed(2)+'M':Math.round(number).toLocaleString('en-US'));
};
let period='day',targetUid='',players=[],ownPlayer=null,busy=false,latest=0,empireStamp=0,playersStamp=0,lastChatAt=0,mounted=false,lastWorldRefreshAt=0,worldRefreshing=false;
let liveWallet=null,liveCorrection='';
let nextAutoRetryAt=0,autoFailures=0;
const CHAT_POLL_MS=180000;
let chatNextAt=0,chatFailures=0,chatRefreshing=false;
const AUTO_SYNC_KEY='profitlands-world1-auto-sync-v1',AUTO_SYNC_MS=300000,LIVE_TICK_MS=500;
// AFK affects unnecessary sync/poll traffic, never saved money or businesses.
// Repeated clicks and fake DOM events are NOT treated as evidence of activity.
// This is a courtesy idle guard, not proof of humanity: OS-level automation
// can synthesize genuine input, so financial integrity stays server-owned.
const AFK_IDLE_MS=15*60*1000,AFK_POINTER_DISTANCE=32;
let lastInteractionAt=Date.now(),lastPointerPosition=null;
function afkStatus(){
 const away=document.visibilityState==='hidden'||Date.now()-lastInteractionAt>=AFK_IDLE_MS;
 return {away,idleSeconds:Math.max(0,Math.floor((Date.now()-lastInteractionAt)/1000))};
}
function updateAfkStatus(){
 const label=$('worldAfkStatus');
 if(!label)return;
 const value=afkStatus().away?
  'AFK · Automatic world sync and chat polling paused. Your saved empire and offline earnings are safe. Move, type, or interact to resume.':
  'Active · World updates pause after 15 minutes without interaction. Repeated clicks alone do not count.';
 if(label.textContent!==value)label.textContent=value;
}
function trustedActivity(event){
 if(!active()||document.visibilityState==='hidden'||event?.isTrusted!==true)return false;
 if(event.type==='pointermove'){
  const x=Number(event.clientX),y=Number(event.clientY);
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  const last=lastPointerPosition;
  if(last&&Math.hypot(x-last.x,y-last.y)<AFK_POINTER_DISTANCE)return false;
  lastPointerPosition={x,y};
 }else if(event.type==='keydown'){
  if(event.repeat||['Shift','Control','Alt','Meta'].includes(event.key))return false;
 }else if(event.type!=='touchstart'&&event.type!=='wheel')return false;
 lastInteractionAt=Date.now();updateAfkStatus();
 return true;
}
function confirmedGameplay(){
 // Called only after an actual verified server purchase or upgrade succeeds.
 lastInteractionAt=Date.now();updateAfkStatus();
}

// Opt-out remains respected; new players get the conservative 5-minute sync.
let autoSyncEnabled=true;
try{autoSyncEnabled=window.localStorage?.getItem(AUTO_SYNC_KEY)!=='0'}catch(e){}
const liveMoney=value=>{
 const amount=Number(value);
 if(!Number.isFinite(amount)||amount<0)return cash(amount);
 return amount<1000000?'$'+amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):cash(amount);
};
function liveWalletTick(){
 if(!liveWallet||!connected()||busy||afkStatus().away||
  window.ProfitLandsWorkspace?.active?.()!=='world'||liveWallet.uid!==ownPlayer?.uid||
  liveWallet.worldId!==regionId())return false;
 const elapsed=Math.min(21600,Math.max(0,(Date.now()-liveWallet.at)/1000));
 const projected=Math.max(0,Math.min(1e12,liveWallet.cash+elapsed*liveWallet.rate));
 const netWorth=Math.max(0,Math.min(1e12,liveWallet.netWorth+elapsed*liveWallet.rate));
 const cashLabel=$('worldLiveCash'),worthLabel=$('worldLiveWorth');
 if(!cashLabel||!worthLabel)return false;
 cashLabel.textContent=liveMoney(projected);
 worthLabel.textContent=liveMoney(netWorth);
 const catalog=online()?.getCatalog?.()||[];
 const companyCap=Number(ownPlayer?.enterprise?.companyCap)||80;
 const full=(ownPlayer?.businesses?.length||0)>=companyCap;
 for(const button of $('worldStore')?.querySelectorAll('[data-world-buy]')||[]){
  const def=catalog.find(x=>x.id===button.dataset.worldBuy);
  if(!def)continue;
  const lacking=projected<def.cost;
  button.disabled=full||lacking;
  const reason=full?companyCap+'-business limit reached':
   lacking?'Need '+cash(Math.ceil(def.cost-projected))+' more':'Ready to buy (server verifies)';
  button.title=reason;
  const info=$('worldBuyInfo-'+def.id);if(info)info.textContent=reason;
 }
 for(const button of $('worldStore')?.querySelectorAll('[data-world-upgrade]')||[]){
  const index=Number(button.dataset.worldUpgrade);
  const business=ownPlayer?.businesses?.[index];
  const def=catalog.find(x=>x.id===business?.type);
  if(!business||!def)continue;
  const maxed=business.level>=30;
  const cost=Math.ceil(def.cost*(1+business.level*.75));
  const lacking=projected<cost;
  button.disabled=maxed||lacking;
  const reason=maxed?'Maximum level reached':
   lacking?'Need '+cash(Math.ceil(cost-projected))+' more online cash':
   'Upgrade (server verifies balance)';
  button.title=reason;
 }
 if(lastWorldRefreshAt>0)updateSyncAgeLabel();
 return true;
}
function updateSyncAgeLabel(){
 const label=$('worldLastSynced');
 if(!label||!lastWorldRefreshAt)return;
 const age=Math.max(0,Date.now()-lastWorldRefreshAt);
 const when=age<1000?'just now':age<60000?Math.floor(age/1000)+'s ago':
  Math.floor(age/60000)+'m ago';
 label.textContent='Server-verified snapshot '+when+' · live balance is estimated';
}
function syncLabel(){
 lastWorldRefreshAt=Date.now();
 updateSyncAgeLabel();
}
function updateAutoSyncButton(){
 const button=$('worldAutoSync');
 if(!button)return;
 button.setAttribute('aria-pressed',String(autoSyncEnabled));
 button.textContent=autoSyncEnabled?'Server sync: On (5 min)':'Server sync: Off';
}
function toggleAutoSync(){
 autoSyncEnabled=!autoSyncEnabled;
 try{window.localStorage?.setItem(AUTO_SYNC_KEY,autoSyncEnabled?'1':'0')}catch(e){}
 updateAutoSyncButton();
 message(autoSyncEnabled?'Your live balance animates every half-second; the server verifies it every 5 minutes while World is visible.':'Server auto-sync disabled. Your live estimate still animates, and purchases are verified by the server.');
}
function autoSyncTick(){
 if(!autoSyncEnabled||!connected()||busy||worldRefreshing||Date.now()<nextAutoRetryAt||afkStatus().away||
  document.visibilityState==='hidden'||window.ProfitLandsWorkspace?.active?.()!=='world')return false;
 if(Date.now()-lastWorldRefreshAt<AUTO_SYNC_MS)return false;
 // Only the account ledger is needed for background balance correction.
 // Leaderboards/rivals are fetched on entry and explicit manual refresh.
 lastWorldRefreshAt=Date.now();
 worldRefreshing=true;
 void loadEmpire().then(ok=>{
  if(ok){autoFailures=0;nextAutoRetryAt=0;return}
  autoFailures=Math.min(4,autoFailures+1);
  nextAutoRetryAt=Date.now()+Math.min(3600000,AUTO_SYNC_MS*(2**autoFailures));
 }).catch(()=>{
  autoFailures=Math.min(4,autoFailures+1);
  nextAutoRetryAt=Date.now()+Math.min(3600000,AUTO_SYNC_MS*(2**autoFailures));
 }).finally(()=>{worldRefreshing=false});
 return true;
}
function pvpStatus(){
 const status=$('worldPvpStatus'),toggle=$('worldPvpToggle'),shield=$('worldShield');
 if(status){
  if(!ownPlayer)status.textContent='Loading your server-verified PvP status…';
  else{
   const now=Math.floor(Date.now()/1000);
   const activeShield=Number(ownPlayer.protectedUntil)>now
    ?' · Protected until '+new Date(ownPlayer.protectedUntil*1000).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
   const cooldown=Number(ownPlayer.nextAttackAt)>now
    ?' · Attack cooldown until '+new Date(ownPlayer.nextAttackAt*1000).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
   status.textContent='Your PvP: '+(ownPlayer.pvpEnabled?'On':'Off')+activeShield+cooldown;
  }
 }
 if(toggle){toggle.textContent=ownPlayer?.pvpEnabled?'Turn PvP off':'Enable PvP';toggle.disabled=busy||!ownPlayer}
 if(shield)shield.disabled=busy||!ownPlayer;
}

const page=()=> $('worldContent');
const message=text=>{const status=$('worldStatus');if(status)status.textContent=text};
function showUnavailable(){
 const root=page();if(!root)return;
 const configured=online()?.isConfigured?.()===true;
 const initial=configured?(regionId()==='world1'?'Checking whether World 1 is online…':'Checking '+region().region+' server…'):'World 1 server setup is not finished. The free Cloudflare Worker and D1 database must be deployed first.';
 root.innerHTML=regionSelector()+'<div class="pl-online-callout" role="status"><span>🌎</span><div><h3>'+ (configured?esc(region().label)+' connection':'World 1 setup required') +'</h3><p id="worldAvailability">'+initial+'</p><button type="button" id="worldConnect" class="pl-online-connect" disabled>'+(configured?'Checking server…':'Server not configured')+'</button><p id="worldConnectError" role="status"></p></div></div>'+renderRules();
 bindRegionSelector(root);
 const button=$('worldConnect'),status=$('worldAvailability');
 if(!button||!configured)return;
 const current=()=>active()&&page()===root&&$('worldConnect')===button;
 const connect=async()=>{
  button.disabled=true;button.textContent='Connecting…';
  try{await online()?.connect?.();if(connected()){render();return}throw Error('Online server is unreachable. Please verify deployment.')}
  catch(e){
   if(!current())return;
   $('worldConnectError').textContent=String(e?.message||'Cannot join World 1.').slice(0,220);
   button.disabled=false;button.textContent='Try connecting again';
   if(/sign in/i.test(String(e?.message||'')))window.profitlandsFirebase?.signIn?.();
  }
 };
 const check=async(force=false)=>{
  button.disabled=true;button.textContent='Checking server…';
  let ready=false;
  try{ready=await online()?.probe?.(force)===true}catch(e){}
  if(!current())return;
  if(ready){
   status.textContent=window.profitlandsFirebase?.isAuthReady?.()===false
    ?worldDisplay()+' server is online. Restoring your account session…'
    :signedIn()
     ?worldDisplay()+' server is online. Your account is signed in and ready to connect; each region keeps its own empire.'
     :worldDisplay()+' server is online. Sign in to join; every region has an independent empire.';
   button.textContent='Connect to '+worldDisplay();button.disabled=false;button.onclick=connect;
  }else{
   status.textContent=worldDisplay()+' is not serving its multiplayer API yet. Your other regions and local save remain safe. Retry the server check.';
   button.textContent='Retry server check';button.disabled=false;button.onclick=()=>check(true);
  }
 };
 check();
}
function renderRules(){
 return '<div class="pl-online-info"><h4>Regional multiplayer rules</h4>'+
  '<p>Americas, Europe and Asia each have their own server-owned cash, shops, purchases and rankings, with up to 64 accounts per world, 80 businesses per player, 16 locations per company, and six hours of offline earnings. Switching regions does not transfer money or shops.</p>'+
  '<p>PvP is optional, spends in-game money and has newcomer protection, cooldowns and temporary shields. Attacks reduce earnings for a limited time; they do not delete businesses or steal saved games.</p>'+
  '<p>Regional chat masks profanity automatically and provides reporting, player blocking, spam protection and an emergency shutdown. Automatic World refresh is opt-in to protect the free server quota.</p></div>';
}
function leaderboardRows(rows){
 if(!Array.isArray(rows)||!rows.length)return '<p class="pl-online-empty">No verified scores for this period.</p>';
 return rows.slice(0,20).map((p,index)=>'<div class="pl-lb-row"><span class="pl-lb-rank">#'+(index+1)+'</span><span class="pl-lb-player">'+esc(p.displayName||'Player')+'</span><strong>'+cash(p.score)+'</strong></div>').join('');
}
function renderPlayers(){
 const root=$('worldRivals');if(!root)return;
 if(targetUid&&!players.some(p=>p.uid===targetUid))targetUid='';
 if(!players.length){root.innerHTML='<p class="pl-online-empty">No online rivals available.</p>';updateButtons();return}
 root.innerHTML='<label for="pvpTarget">Choose a rival</label><select id="pvpTarget"><option value="">Choose a player…</option>'+
  players.filter(p=>p.uid).slice(0,100).map(p=>'<option value="'+esc(p.uid)+'" '+(p.uid===targetUid?'selected':'')+'>'+esc(p.displayName||'Player')+(p.pvpEnabled?' · PvP enabled':' · PvP off')+'</option>').join('')+'</select>';
 $('pvpTarget').addEventListener('change',e=>{targetUid=e.target.value;updateButtons()});
 updateButtons();
}
function updateButtons(){
 const rival=players.find(p=>p.uid===targetUid);
 const canAttack=connected()&&ownPlayer?.pvpEnabled===true&&rival?.pvpEnabled===true&&!busy;
 for(const button of document.querySelectorAll('[data-pvp-attack]')){
  button.disabled=!canAttack;
  button.title=!ownPlayer?.pvpEnabled?'Enable your own PvP participation first.'
   :!rival?'Choose a rival first.':!rival.pvpEnabled?'This rival has PvP turned off.'
   :busy?'An online action is already processing.':'Final cost and eligibility are checked by World 1.';
 }
}
function renderOnline(){
 const root=page();if(!root)return;
 root.innerHTML=regionSelector()+'<div class="pl-online-callout pl-online-live"><span>🌎</span><div><h3>'+esc(region().label)+'</h3><p>Regional economy connected. Balances, purchases and rankings stay in this world.</p><div class="pl-world-sync-controls"><button type="button" id="worldRefresh" class="pl-online-connect">Refresh World</button><button type="button" id="worldAutoSync" class="pl-online-autosync" aria-pressed="true">Server sync: On (5 min)</button><small id="worldLastSynced">Loading World 1…</small></div></div></div>'+
 '<div class="pl-online-box" id="worldStore"><p role="status">Loading your server-owned empire…</p></div>'+ 
 '<div class="pl-online-layout"><section class="pl-online-box"><div class="pl-online-title"><h3>🏆 Money Leaderboard</h3><span>Server verified</span></div>'+
 '<div class="pl-online-tabs" role="group" aria-label="Leaderboard period"><button data-lb="day" type="button">Today</button><button data-lb="week" type="button">This week</button><button data-lb="all" type="button">All time</button></div>'+
 '<div id="worldLeaderboard" aria-live="polite" class="pl-online-scores">Loading verified scores…</div></section>'+
 '<section class="pl-online-box"><div class="pl-online-title"><h3>⚔️ Rival Actions</h3><span>In-game money only</span></div><p>Pay to disrupt one rival company, or protect your empire. Attacks cannot permanently delete a business.</p>'+
 '<p id="worldPvpStatus" class="pl-online-note" role="status">Loading your server-verified PvP status…</p><div id="worldRivals"></div><div class="pl-pvp-options">'+(rules()?.ATTACKS||[]).map(a=>
  '<button type="button" data-pvp-attack="'+esc(a.id)+'"><strong>'+esc(a.icon)+' '+esc(a.name)+'</strong><small>From '+cash(a.baseCost)+' · '+Math.round(a.penalty*100)+'% income penalty for '+Math.round(a.durationSeconds/60)+' min</small></button>').join('')+'</div>'+
 '<div class="pl-pvp-protection"><button type="button" id="worldShield">🛡️ Buy protection</button><button type="button" id="worldPvpToggle">Enable PvP</button></div>'+
 '<p class="pl-online-note">Final costs, attack eligibility and protection are verified by the server. Attacks have cooldowns; new players are protected.</p></section></div>'+
 '<div id="worldStatus" role="status" aria-live="polite" class="pl-online-status"></div>'+renderRules();
 root.querySelectorAll('[data-lb]').forEach(btn=>btn.addEventListener('click',()=>{
  period=btn.dataset.lb;updatePeriod();loadLeaderboard();
 }));
 root.querySelectorAll('[data-pvp-attack]').forEach(btn=>btn.addEventListener('click',()=>attack(btn.dataset.pvpAttack)));
 bindRegionSelector(root);
 $('worldRefresh').onclick=()=>refreshWorld();
 $('worldAutoSync').onclick=toggleAutoSync;
 $('worldShield').onclick=()=>defend();
 $('worldPvpToggle').onclick=()=>togglePvP();
 updateAutoSyncButton();updatePeriod();pvpStatus();updateButtons();
}
async function refreshWorld(){
 if(!connected()||worldRefreshing)return false;
 const now=Date.now(),button=$('worldRefresh');
 if(now-lastWorldRefreshAt<10000){message('Refresh is available every 10 seconds.');return false}
 lastWorldRefreshAt=now;
 worldRefreshing=true;
 if(button){button.disabled=true;button.textContent='Refreshing…'}
 try{
  const results=await Promise.all([loadEmpire(),loadLeaderboard(),loadPlayers()]);
  if(results.some(result=>result===false)){message('Some world information could not be refreshed. Try again.');return false}
  syncLabel();
  message('World balances and standings updated from the server.');
  return true;
 }catch(e){message('Unable to refresh right now.');return false}
 finally{worldRefreshing=false;if(button){button.disabled=false;button.textContent='Refresh World'}}
}
function updatePeriod(){
 document.querySelectorAll('[data-lb]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.lb===period)));
}
const fmt=amount=>cash(amount);
async function loadEmpire(){
 if(!connected())return false;
 const stamp=++empireStamp;
 const root=$('worldStore');if(!root)return false;
 try{
  const res=await online().getMyEmpire();
  const player=res?.player;
  if(!player||!Array.isArray(player.businesses))throw Error('Invalid empire response');
  if(stamp!==empireStamp||!connected()||root!==$('worldStore'))return false;
  const catalog=online().getCatalog?.()||[];
  const cap=Number(player.enterprise?.companyCap)||80;
  const full=player.businesses.length>=cap;
  const owned=player.businesses.map((business,index)=>{
   const def=catalog.find(x=>x.id===business.type);
   const name=def?.name||'Business';
   const upgradeCost=def?Math.ceil(def.cost*(1+business.level*.75)):null;
   const maxed=business.level>=30;
   const cannotBuy=upgradeCost===null||!Number.isFinite(upgradeCost)||maxed||player.cash<upgradeCost;
   const reason=maxed?'Maximum level reached':upgradeCost===null?'Upgrade unavailable'
    :player.cash<upgradeCost?'Need '+fmt(upgradeCost-player.cash)+' more online cash':'Upgrade this business';
   return '<div class="pl-lb-row"><span class="pl-lb-player">'+esc(name)+' · Lv '+business.level+'</span>'+
    '<button type="button" data-world-upgrade="'+index+'" title="'+esc(reason)+'" '+(cannotBuy?'disabled':'')+'>'+
    (maxed?'Max level':'Upgrade '+(upgradeCost===null?'':fmt(upgradeCost)))+'</button></div>';
  }).join('');
  const market=catalog.map(b=>{
   const lacking=player.cash<b.cost,locked=full||lacking;
   const reason=full?cap+'-business limit reached':lacking?'Need '+fmt(b.cost-player.cash)+' more':'Ready to buy';
   return '<button type="button" data-world-buy="'+esc(b.id)+'" title="'+esc(reason)+'" '+(locked?'disabled':'')+'>'+
    '<span>'+esc(b.name)+'<small id="worldBuyInfo-'+esc(b.id)+'">'+esc(reason)+'</small></span><strong>'+fmt(b.cost)+'</strong></button>';
  }).join('');
  const previous=liveWallet;
  liveCorrection='';
  if(previous&&!busy&&previous.uid===player.uid&&previous.worldId===regionId()){
   const age=Math.max(0,Math.min(21600,(Date.now()-previous.at)/1000));
   const predicted=Math.max(0,Math.min(1e12,previous.cash+age*previous.rate));
   const correction=Number(player.cash)-predicted;
   // Underlying finance, market news, penalties and tax bills can change
   // server-owned income. This label is a reconciliation, not a game credit.
   if(Number.isFinite(correction)&&
    Math.abs(correction)>Math.max(5,previous.rate*2))
    liveCorrection='Server balance reconciled by '+
     (correction>0?'+':'-')+cash(Math.abs(correction))+
     ' (taxes, other activity or changing earnings may apply).';
  }
  ownPlayer=player;
  liveWallet={uid:player.uid,worldId:regionId(),cash:Math.max(0,Number(player.cash)||0),
   netWorth:Math.max(0,Number(player.netWorth)||0),
   rate:Math.max(0,Math.min(250000000,Number(player.incomePerSecond)||0)),
   at:Date.now()};
  root.innerHTML='<div class="pl-online-title"><h3>🏪 My Online Empire</h3><span>'+esc(region().label)+' · Server balance</span></div>'+
   '<div class="pl-online-wallet"><div><small>Cash · live estimate</small><strong id="worldLiveCash" aria-live="off">'+liveMoney(player.cash)+'</strong></div>'+
   '<div><small>Net worth · live estimate</small><strong id="worldLiveWorth" aria-live="off">'+liveMoney(player.netWorth)+'</strong></div></div>'+
   '<p class="pl-online-note">Estimated income: +'+fmt(player.incomePerSecond||0)+'/sec · Display animates every 0.5 sec without server requests. Server sync every 5 min while this World tab is visible.</p>'+
   '<p class="pl-online-note" id="worldAfkStatus" role="status" aria-live="polite"></p>'+
   '<p class="pl-online-note" id="worldBalanceCorrection" role="status">'+esc(liveCorrection)+'</p>'+
   '<p class="pl-online-note">Offline income accrues for up to 6 hours between visits. Returning later does not erase saved holdings, but earnings beyond the six-hour cap are not credited.</p>'+
   '<p class="pl-online-note">'+player.businesses.length+' / '+cap+' online businesses · Purchases are disabled when your verified balance is too low.</p>'+
   '<h4>My shops</h4><div class="pl-online-scores">'+(owned||'<p class="pl-online-empty">Buy your first online shop to earn cash.</p>')+'</div>'+
   '<h4>Buy an online business</h4><div class="pl-online-market">'+market+'</div><p class="pl-online-note">Displayed earnings are estimated between server syncs. Purchases and upgrades always use server-verified balances; refresh manually for up-to-date rankings and other players.</p>';
  root.querySelectorAll('[data-world-buy]').forEach(button=>button.onclick=()=>changeEmpire('buy',button.dataset.worldBuy));
  root.querySelectorAll('[data-world-upgrade]').forEach(button=>button.onclick=()=>changeEmpire('upgrade',Number(button.dataset.worldUpgrade)));
  window.ProfitLandsWorldExtended?.render?.(player,root);
  updateAfkStatus();liveWalletTick();syncLabel();
  pvpStatus();updateButtons();
  return true;
 }catch(e){
  if(stamp===empireStamp&&root===$('worldStore')){
   if(ownPlayer&&$('worldLiveCash')){
    // Never destroy the active storefront just because one sync timed out.
    message('Server sync unavailable. Estimated balances remain visible; purchases are still server-verified.');
   }else root.textContent='Online empire unavailable: '+String(e?.message||'Retry connection').slice(0,150);
  }
  return false;
 }
}
async function changeEmpire(action,value){
 if(!connected()||busy)return false;
 busy=true;
 try{
  if(action==='buy')await online().buyBusiness(value);
  else if(action==='upgrade')await online().upgradeBusiness(value);
  else return false;
  confirmedGameplay();
  message('Online empire updated. Your in-game cash was verified by the server.');
  await Promise.all([loadEmpire(),loadLeaderboard()]);
  return true;
 }catch(e){message('Purchase rejected: '+String(e?.message||'Please retry.').slice(0,140));return false}
 finally{busy=false;pvpStatus();updateButtons()}
}
async function loadLeaderboard(){
 if(!connected())return false;
 const stamp=++latest,board=$('worldLeaderboard');
 if(board)board.textContent='Loading verified scores…';
 try{
  const entries=await online().getLeaderboard(period);
  if(stamp===latest&&board===$('worldLeaderboard'))board.innerHTML=leaderboardRows(entries);
  return true;
 }catch(e){if(stamp===latest&&board===$('worldLeaderboard'))board.textContent='Server rankings unavailable. Try refreshing.';return false}
}
async function loadPlayers(){
 if(!connected())return false;
 const stamp=++playersStamp;
 try{
  const next=await online().getPlayers();
  if(stamp!==playersStamp||!connected())return false;
  players=Array.isArray(next)?next:[];
  renderPlayers();
  updateButtons();
  return true;
 }catch(e){if(stamp===playersStamp){message('Could not load players.');players=[];renderPlayers()}return false}
}
async function attack(id){
 if(!connected()||busy||!targetUid||!rules()?.ATTACKS.some(x=>x.id===id))return false;
 if(ownPlayer?.pvpEnabled!==true){message('Enable your own PvP participation before attacking.');return false}
 const target=players.find(p=>p.uid===targetUid);
 if(!target||target.pvpEnabled!==true){message('Choose a player who has enabled PvP.');return false}
 const rule=rules().ATTACKS.find(x=>x.id===id);
 if(!window.confirm?.('Spend verified in-game cash to use '+rule.name+' against '+(target.displayName||'this rival')+'? The final cost will be checked by the server.'))return false;
 busy=true;updateButtons();pvpStatus();
 try{
  await online().requestAttack({targetUid,attackId:id});
  message('Attack submitted and validated by the world server.');
  await Promise.all([loadLeaderboard(),loadPlayers(),loadEmpire()]);
  return true;
 }catch(e){message('Attack rejected by the server: '+(e?.message||'Please retry.'));return false}
 finally{busy=false;updateButtons();pvpStatus()}
}
async function defend(){
 if(!connected()||busy)return false;
 if(!window.confirm?.('Buy a temporary PvP shield using in-game cash? The server will calculate the final price.'))return false;
 busy=true;
 try{await online().requestDefense();message('Protection activated by the world server.');await loadEmpire();return true}
 catch(e){message('Protection unavailable: '+(e?.message||'Please retry.'));return false}
 finally{busy=false;pvpStatus();updateButtons()}
}
async function togglePvP(){
 if(!connected()||busy)return false;
 busy=true;pvpStatus();updateButtons();
 try{
  const result=await online().togglePvP();
  if(result?.player)ownPlayer=result.player;
  pvpStatus();updateButtons();
  message('PvP is now '+(ownPlayer?.pvpEnabled?'enabled. Rivals can challenge your empire.':'disabled.')+' Verified by World 1.');
  await loadEmpire();
  return true;
 }
 catch(e){message('Could not update PvP preference: '+String(e?.message||'Please retry.').slice(0,130));return false}
 finally{busy=false;pvpStatus();updateButtons()}
}
function updateChat(){
 const dock=$('worldChatDock');if(!dock)return;
 dock.hidden=!active();if(!active())return;
 const ready=connected()&&online()?.chatEnabled?.()===true;
 const input=$('worldChatInput'),send=$('worldChatSend');
 if(input){input.disabled=!ready;input.maxLength=160;input.placeholder=ready?'Message '+region().region+' (160 characters max)':connected()?'Chat is temporarily unavailable':'Connect to regional chat first'}
 if(send)send.disabled=!ready;
 const status=$('worldChatStatus');
 if(status)status.textContent=ready?region().region+' chat · 20-second cooldown · profanity auto-masked · report/block available':connected()?'Regional chat is temporarily unavailable.':'Connect to your world to chat';
 const list=$('worldChatMessages');
 if(list&&!ready)list.textContent=connected()?'Regional chat is temporarily unavailable.':'Connect to a regional world to view chat.';
 if(!ready&&$('worldChatModerator'))$('worldChatModerator').hidden=true;
}
const chatStatus=text=>{const el=$('worldChatStatus');if(el)el.textContent=String(text).slice(0,170)};
function renderChatMessages(entries){
 const list=$('worldChatMessages');if(!list||!Array.isArray(entries))return;
 list.replaceChildren();
 const ownUid=window.profitlandsFirebase?.getCurrentUser?.()?.uid||window.firebase?.auth?.()?.currentUser?.uid||'';
 for(const msg of entries.slice(-40)){
  if(!msg||!msg.id)continue;
  const row=document.createElement('div');row.className='pl-world-message';
  const name=document.createElement('strong');name.textContent=String(msg.displayName||'Player').slice(0,30)+': ';
  const content=document.createElement('span');content.textContent=String(msg.text||'').slice(0,160);
  row.append(name,content);
  if(msg.uid&&msg.uid!==ownUid){
   const report=document.createElement('button');report.type='button';report.textContent='Report';
   report.setAttribute('aria-label','Report message from '+String(msg.displayName||'Player'));
   report.onclick=async()=>{
    if(!window.confirm?.('Report and hide this message for yourself?'))return;
    report.disabled=true;
    try{await online().reportMessage(msg.id);await refreshChat(true);chatStatus('Report received. Hidden for your account.')}
    catch(e){report.disabled=false;chatStatus('Report failed: '+String(e?.message||'Retry.'))}
   };
   const block=document.createElement('button');block.type='button';block.textContent='Block';
   block.setAttribute('aria-label','Block '+String(msg.displayName||'Player')+' from regional chat');
   block.onclick=async()=>{
    if(!window.confirm?.('Block this player in '+region().region+' chat?'))return;
    block.disabled=true;
    try{await online().blockChatUser(msg.uid);
     await Promise.all([refreshChat(true),refreshBlockedChat()]);
     chatStatus('Player blocked. You can unblock them below.');}
    catch(e){block.disabled=false;chatStatus('Block failed: '+String(e?.message||'Retry.'))}
   };
   row.append(report,block);
  }
  list.appendChild(row);
 }
 if(!list.children.length)list.textContent='No recent messages in this region.';
 list.scrollTop=list.scrollHeight;
}
async function refreshBlockedChat(){
 const list=$('worldChatBlockedList');if(!list||!connected())return false;
 const world=regionId();
 try{
  const blocked=await online().getBlockedChatUsers?.();
  if(world!==regionId()||!connected())return false;
  list.replaceChildren();
  if(!Array.isArray(blocked)||!blocked.length)return true;
  const heading=document.createElement('strong');heading.textContent='Blocked: ';list.appendChild(heading);
  for(const person of blocked){
   const button=document.createElement('button');button.type='button';
   button.textContent='Unblock '+String(person.displayName||'Player').slice(0,22);
   button.onclick=async()=>{
    button.disabled=true;
    try{await online().unblockChatUser(person.uid);await Promise.all([refreshChat(true),refreshBlockedChat()]);}
    catch(e){button.disabled=false;chatStatus('Unblock failed. Retry.')}
   };
   list.appendChild(button);
  }
  return true;
 }catch(e){return false}
}
async function refreshModerationQueue(){
 const panel=$('worldChatModerator'),list=$('worldChatReports');
 if(!panel||!list||!connected()||typeof online()?.getChatReports!=='function')return false;
 const world=regionId();
 try{
  const reported=await online().getChatReports();
  if(world!==regionId()||!connected())return false;
  panel.hidden=false;list.replaceChildren();
  if(!Array.isArray(reported)||!reported.length){
   list.textContent='No pending reports in this region.';return true;
  }
  for(const item of reported){
   const row=document.createElement('div');row.className='pl-chat-moderation-row';
   const label=document.createElement('span');
   label.textContent=String(item.displayName||'Player').slice(0,25)+': '+
    String(item.text||'').slice(0,160)+' · '+Number(item.reportCount||0)+' reports';
   row.appendChild(label);
   for(const decision of ['remove','dismiss']){
    const button=document.createElement('button');button.type='button';
    button.textContent=decision==='remove'?'Remove':'Dismiss';
    button.onclick=async()=>{
     button.disabled=true;
     try{await online().moderateChat(item.id,decision);
      await Promise.all([refreshModerationQueue(),refreshChat(true)]);
      chatStatus('Report '+(decision==='remove'?'removed':'dismissed')+'.');
     }catch(e){button.disabled=false;chatStatus('Moderation action failed.')}
    };
    row.appendChild(button);
   }
   list.appendChild(row);
  }
  return true;
 }catch(e){panel.hidden=true;return false}
}
async function submitChat(){
 if(!connected()||online()?.chatEnabled?.()!==true)return;
 const input=$('worldChatInput'),text=String(input?.value||'').trim();
 if(text.length<2||text.length>160||Date.now()-lastChatAt<3000)return;
 lastChatAt=Date.now();input.disabled=true;
 const world=regionId();
 try{
  await online().sendChat(text);
  if(world!==regionId())return;
  input.value='';await refreshChat(true);
  chatStatus('Message sent · '+region().region);
 }catch(e){chatStatus('Message not sent: '+String(e?.message||'Please retry.'))}
 finally{if(world===regionId())input.disabled=false}
}
async function refreshChat(force=false){
 if(!connected()||online()?.chatEnabled?.()!==true||
  typeof online().getChat!=='function'||chatRefreshing)return false;
 if(!force&&(afkStatus().away||Date.now()<chatNextAt))return false;
 chatRefreshing=true;
 const world=regionId();
 // Reserve the next slot before the network request, preventing duplicate
 // requests from the render and visibility events.
 chatNextAt=Date.now()+CHAT_POLL_MS;
 try{
  const result=await online().getChat();
  if(world===regionId()&&connected())renderChatMessages(result);
  chatFailures=0;
  return true;
 }catch(e){
  chatFailures=Math.min(4,chatFailures+1);
  chatNextAt=Date.now()+Math.min(900000,CHAT_POLL_MS*(2**chatFailures));
  chatStatus('Chat is temporarily unavailable. Automatic retries slow down when the server is busy.');
  return false;
 }finally{chatRefreshing=false}
}
function render(){
 if(!page())return false;
 if(!active()){liveWallet=null;page().innerHTML='<p class="pl-online-note">Multiplayer features appear only in multiplayer mode.</p>';updateChat();return false}
 if(!connected()){
  // Do not leave a previous account's balance or rivals visible.
  ownPlayer=null;liveWallet=null;liveCorrection='';players=[];targetUid='';
  showUnavailable();
 }else if(!$('worldStore')){
  // Connect emits a serverupdate and also calls render. Mount the online
  // panel only once instead of fetching the same data twice.
  renderOnline();
  Promise.all([loadEmpire(),loadLeaderboard(),loadPlayers()]).then(results=>{
   if(connected()&&results.every(Boolean)&&$('worldStore'))syncLabel();
  }).catch(()=>{});
  // Chat is fetched only when its panel is open; do not poll closed chat.
 }
 updateChat();return true;
}
function init(){
 if(mounted)return;
 mounted=true;
 $('worldChatToggle')?.addEventListener('click',()=>{
  const panel=$('worldChatPanel');if(!panel)return;
  panel.hidden=!panel.hidden;
  $('worldChatToggle').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden){updateChat();refreshChat(true);refreshBlockedChat();refreshModerationQueue();$('worldChatInput')?.focus()}
 });
 $('worldChatClose')?.addEventListener('click',()=>{
  $('worldChatPanel').hidden=true;$('worldChatToggle')?.setAttribute('aria-expanded','false');
 });
 $('worldChatForm')?.addEventListener('submit',e=>{e.preventDefault();submitChat()});
 $('worldChatRefreshReports')?.addEventListener('click',refreshModerationQueue);
 $('worldChatRefresh')?.addEventListener('click',()=>void refreshChat(true));
 // Pointerdown/click intentionally don't reset AFK: a static autoclicker
 // can generate thousands of clicks without any real navigation.
 for(const event of ['pointermove','keydown','touchstart','wheel'])
  document.addEventListener?.(event,trustedActivity,{passive:true});
 document.addEventListener?.('visibilitychange',updateAfkStatus);
 // Poll chat only while its panel is visible; no hidden-tab chatter.
 if(typeof window.setInterval==='function')window.setInterval(()=>{
  if(connected()&&online()?.chatEnabled?.()===true&&
    !$('worldChatPanel')?.hidden&&!afkStatus().away)void refreshChat();
 },30000);
 // Display-only 500 ms ticking never touches Workers or D1.
 if(typeof window.setInterval==='function')window.setInterval(liveWalletTick,LIVE_TICK_MS);
 // Server updates happen only every 5 minutes, while World is visible.
 if(typeof window.setInterval==='function')window.setInterval(autoSyncTick,15000);
 if(typeof window.setInterval==='function')window.setInterval(updateAfkStatus,15000);
 window.addEventListener('profitlands:viewchange',event=>{updateChat();if(event.detail?.view==='world')render()});
 window.addEventListener('profitlands:serverupdate',()=>{if(window.ProfitLandsWorkspace?.active?.()==='world')render();else updateChat()});
 // A restored session changes connection instructions without needing another sign-in.
 window.addEventListener('profitlands:authupdate',()=>{
  if(active()&&window.ProfitLandsWorkspace?.active?.()==='world'&&!connected())render();
 });
 updateChat();
}
window.ProfitLandsWorld={render,updateChat,attack,defend,online:connected,period:()=>period,
 refresh:refreshWorld,autoSyncIfDue:autoSyncTick,autoSyncEnabled:()=>autoSyncEnabled,liveWalletTick,
 afkStatus,trustedActivity};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
