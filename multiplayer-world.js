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
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const cash=value=>{
 const number=Number(value);
 if(!Number.isFinite(number))return '—';
 if(number<0)return '-'+cash(-number);
 return '$'+(number>=1e12?(number/1e12).toFixed(2)+'T':number>=1e9?(number/1e9).toFixed(2)+'B':number>=1e6?(number/1e6).toFixed(2)+'M':Math.round(number).toLocaleString('en-US'));
};
let period='day',targetUid='',players=[],busy=false,latest=0,empireStamp=0,playersStamp=0,lastChatAt=0,mounted=false,lastWorldRefreshAt=0,worldRefreshing=false;
const page=()=> $('worldContent');
const message=text=>{const status=$('worldStatus');if(status)status.textContent=text};
function showUnavailable(){
 const root=page();if(!root)return;
 root.innerHTML='<div class="pl-online-callout" role="status"><span>🌎</span><div><h3>Join the online tycoon world</h3><p>World 1 requires a live, authenticated server connection. Your local singleplayer save is separate.</p><button type="button" id="worldConnect" class="pl-online-connect">Connect to World 1</button><p id="worldConnectError" role="status"></p></div></div>'+renderRules();
 const button=$('worldConnect');if(button)button.onclick=async()=>{
  button.disabled=true;button.textContent='Connecting…';
  try{await online()?.connect?.();if(connected()){render();return}throw Error('Online server is unreachable. Please verify deployment.')}
  catch(e){$('worldConnectError').textContent=String(e?.message||'Cannot join World 1.').slice(0,220);button.disabled=false;button.textContent='Try connecting again';
   if(/sign in/i.test(String(e?.message||'')))window.profitlandsFirebase?.signIn?.()}
 };
}
function renderRules(){
 return '<div class="pl-online-info"><h4>How the shared world will work</h4><p>All players enter one persistent world. Rankings use verified in-game money: daily and weekly net-worth growth, plus all-time current net worth. No clan win points.</p><p>PvP is opt-in, costs in-game cash, has cooldowns and shields, and temporarily lowers a rival company\'s income. No one-click permanent empire deletion.</p><p>Chat will be shared across this world, with reporting, blocking, server rate limits and moderation before public launch.</p></div>';
}
function leaderboardRows(rows){
 if(!Array.isArray(rows)||!rows.length)return '<p class="pl-online-empty">No verified scores for this period.</p>';
 return rows.slice(0,20).map((p,index)=>'<div class="pl-lb-row"><span class="pl-lb-rank">#'+(index+1)+'</span><span class="pl-lb-player">'+esc(p.displayName||'Player')+'</span><strong>'+cash(p.score)+'</strong></div>').join('');
}
function renderPlayers(){
 const root=$('worldRivals');if(!root)return;
 if(!players.length){root.innerHTML='<p class="pl-online-empty">No online rivals available.</p>';return}
 root.innerHTML='<label for="pvpTarget">Choose a rival</label><select id="pvpTarget"><option value="">Choose a player…</option>'+
  players.filter(p=>p.uid).slice(0,100).map(p=>'<option value="'+esc(p.uid)+'" '+(p.uid===targetUid?'selected':'')+'>'+esc(p.displayName||'Player')+(p.pvpEnabled?' · PvP enabled':' · PvP off')+'</option>').join('')+'</select>';
 $('pvpTarget').addEventListener('change',e=>{targetUid=e.target.value;updateButtons()});
}
function updateButtons(){
 const canAttack=connected()&&Boolean(targetUid)&&!busy;
 for(const button of document.querySelectorAll('[data-pvp-attack]'))button.disabled=!canAttack;
}
function renderOnline(){
 const root=page();if(!root)return;
 root.innerHTML='<div class="pl-online-callout pl-online-live"><span>🌎</span><div><h3>ProfitLands World 1</h3><p>Shared economy connected. Online activity and scores come from the game server. Use Refresh World to check the latest totals.</p><button type="button" id="worldRefresh" class="pl-online-connect">Refresh World</button></div></div>'+
 '<div class="pl-online-box" id="worldStore"><p role="status">Loading your server-owned empire…</p></div>'+ 
 '<div class="pl-online-layout"><section class="pl-online-box"><div class="pl-online-title"><h3>🏆 Money Leaderboard</h3><span>Server verified</span></div>'+
 '<div class="pl-online-tabs" role="group" aria-label="Leaderboard period"><button data-lb="day" type="button">Today</button><button data-lb="week" type="button">This week</button><button data-lb="all" type="button">All time</button></div>'+
 '<div id="worldLeaderboard" aria-live="polite" class="pl-online-scores">Loading verified scores…</div></section>'+
 '<section class="pl-online-box"><div class="pl-online-title"><h3>⚔️ Rival Actions</h3><span>In-game money only</span></div><p>Pay to disrupt one rival company, or protect your empire. Attacks cannot permanently delete a business.</p>'+
 '<div id="worldRivals"></div><div class="pl-pvp-options">'+(rules()?.ATTACKS||[]).map(a=>
  '<button type="button" data-pvp-attack="'+esc(a.id)+'"><strong>'+esc(a.icon)+' '+esc(a.name)+'</strong><small>From '+cash(a.baseCost)+' · '+Math.round(a.penalty*100)+'% income penalty for '+Math.round(a.durationSeconds/60)+' min</small></button>').join('')+'</div>'+
 '<div class="pl-pvp-protection"><button type="button" id="worldShield">🛡️ Buy protection</button><button type="button" id="worldPvpToggle">Toggle my PvP participation</button></div>'+
 '<p class="pl-online-note">Final costs, attack eligibility and protection are verified by the server. Attacks have cooldowns; new players are protected.</p></section></div>'+
 '<div id="worldStatus" role="status" aria-live="polite" class="pl-online-status"></div>'+renderRules();
 root.querySelectorAll('[data-lb]').forEach(btn=>btn.addEventListener('click',()=>{
  period=btn.dataset.lb;updatePeriod();loadLeaderboard();
 }));
 root.querySelectorAll('[data-pvp-attack]').forEach(btn=>btn.addEventListener('click',()=>attack(btn.dataset.pvpAttack)));
 $('worldRefresh').onclick=()=>refreshWorld();
 $('worldShield').onclick=()=>defend();
 $('worldPvpToggle').onclick=()=>togglePvP();
 updatePeriod();updateButtons();
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
  const owned=player.businesses.map((business,index)=>{
   const def=catalog.find(x=>x.id===business.type);
   const name=def?.name||'Business';
   const upgradeCost=def?Math.ceil(def.cost*(1+business.level*.75)):null;
   return '<div class="pl-lb-row"><span class="pl-lb-player">'+esc(name)+' · Lv '+business.level+'</span>'+
    '<button type="button" data-world-upgrade="'+index+'" '+(upgradeCost===null||business.level>=30?'disabled':'')+'>Upgrade '+(upgradeCost===null?'':fmt(upgradeCost))+'</button></div>';
  }).join('');
  const market=catalog.map(b=>'<button type="button" data-world-buy="'+esc(b.id)+'">'+esc(b.name)+' <strong>'+fmt(b.cost)+'</strong></button>').join('');
  root.innerHTML='<div class="pl-online-title"><h3>🏪 My Online Empire</h3><span>World 1 · Server balance</span></div>'+
   '<div class="pl-online-wallet"><div><small>Cash</small><strong>'+fmt(player.cash)+'</strong></div><div><small>Net worth</small><strong>'+fmt(player.netWorth)+'</strong></div></div>'+
   '<h4>My shops</h4><div class="pl-online-scores">'+(owned||'<p class="pl-online-empty">Buy your first online shop to earn cash.</p>')+'</div>'+
   '<h4>Buy an online business</h4><div class="pl-online-market">'+market+'</div><p class="pl-online-note">Online cash and upgrades are completely separate from your local singleplayer save. Earnings settle on the server.</p>';
  root.querySelectorAll('[data-world-buy]').forEach(button=>button.onclick=()=>changeEmpire('buy',button.dataset.worldBuy));
  root.querySelectorAll('[data-world-upgrade]').forEach(button=>button.onclick=()=>changeEmpire('upgrade',Number(button.dataset.worldUpgrade)));
  return true;
 }catch(e){if(stamp===empireStamp&&root===$('worldStore'))root.textContent='Online empire unavailable: '+String(e?.message||'Retry connection').slice(0,150);return false}
}
async function changeEmpire(action,value){
 if(!connected()||busy)return false;
 busy=true;
 try{
  if(action==='buy')await online().buyBusiness(value);
  else if(action==='upgrade')await online().upgradeBusiness(value);
  else return false;
  message('Online empire updated. Your in-game cash was verified by the server.');
  await Promise.all([loadEmpire(),loadLeaderboard()]);
  return true;
 }catch(e){message('Purchase rejected: '+String(e?.message||'Please retry.').slice(0,140));return false}
 finally{busy=false}
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
  return true;
 }catch(e){if(stamp===playersStamp){message('Could not load players.');players=[];renderPlayers()}return false}
}
async function attack(id){
 if(!connected()||busy||!targetUid||!rules()?.ATTACKS.some(x=>x.id===id))return false;
 const target=players.find(p=>p.uid===targetUid);
 if(!target||target.pvpEnabled!==true){message('Choose a player who has enabled PvP.');return false}
 const rule=rules().ATTACKS.find(x=>x.id===id);
 if(!window.confirm?.('Spend verified in-game cash to use '+rule.name+' against '+(target.displayName||'this rival')+'? The final cost will be checked by the server.'))return false;
 busy=true;updateButtons();
 try{
  await online().requestAttack({targetUid,attackId:id});
  message('Attack submitted and validated by the world server.');
  await Promise.all([loadLeaderboard(),loadPlayers(),loadEmpire()]);
  return true;
 }catch(e){message('Attack rejected by the server: '+(e?.message||'Please retry.'));return false}
 finally{busy=false;updateButtons()}
}
async function defend(){
 if(!connected()||busy)return false;
 if(!window.confirm?.('Buy a temporary PvP shield using in-game cash? The server will calculate the final price.'))return false;
 busy=true;
 try{await online().requestDefense();message('Protection activated by the world server.');await loadEmpire();return true}
 catch(e){message('Protection unavailable: '+(e?.message||'Please retry.'));return false}
 finally{busy=false}
}
async function togglePvP(){
 if(!connected()||busy)return false;
 busy=true;
 try{await online().togglePvP();message('PvP preference updated on the world server.');return true}
 catch(e){message('Could not update PvP preference.');return false}
 finally{busy=false}
}
function updateChat(){
 const dock=$('worldChatDock');if(!dock)return;
 dock.hidden=!active();
 if(!active())return;
 const ready=connected()&&online()?.chatEnabled?.()===true,input=$('worldChatInput'),send=$('worldChatSend');
 if(input){input.disabled=!ready;input.placeholder=ready?'Message World 1…':'World chat unavailable until the online server is ready'}
 if(send)send.disabled=!ready;
 const status=$('worldChatStatus');if(status)status.textContent=ready?'Online World 1 chat':connected()?'World chat disabled pending moderation':'Not connected · Preview only';
 const list=$('worldChatMessages');if(list&&!ready)list.textContent=connected()?'World chat is unavailable while reporting, blocking and moderation are prepared.':'No live chat connection. Messages are not simulated or stored locally.';
}
function renderChatMessages(entries){
 const list=$('worldChatMessages');
 if(!list)return;
 if(!Array.isArray(entries))return;
 list.replaceChildren();
 for(const msg of entries.slice(-35)){
  const row=document.createElement('div');row.className='pl-world-message';
  const name=document.createElement('strong');name.textContent=String(msg.displayName||'Player').slice(0,30)+': ';
  const content=document.createElement('span');content.textContent=String(msg.text||'').slice(0,220);
  row.append(name,content);
  if(msg.id&&online()?.reportMessage){
   const report=document.createElement('button');report.type='button';report.textContent='Report';
   report.setAttribute('aria-label','Report message from '+name.textContent.replace(/: $/,''));
   report.addEventListener('click',()=>{if(window.confirm?.('Report this message to the moderators?'))online().reportMessage(msg.id).catch(()=>{})});
   row.appendChild(report);
  }
  list.appendChild(row);
 }
 list.scrollTop=list.scrollHeight;
}
async function submitChat(){
 if(!connected())return;
 const input=$('worldChatInput');
 const text=String(input?.value||'').trim();
 if(!text||text.length>220||Date.now()-lastChatAt<3000)return;
 lastChatAt=Date.now();input.disabled=true;
 try{await online().sendChat(text);input.value='';await refreshChat()}
 catch(e){const el=$('worldChatStatus');if(el)el.textContent='Message not sent. Please retry.'}
 finally{input.disabled=false}
}
async function refreshChat(){
 if(!connected()||online()?.chatEnabled?.()!==true||typeof online().getChat!=='function')return;
 try{renderChatMessages(await online().getChat())}catch(e){}
}
function render(){
 if(!page())return false;
 if(!active()){page().innerHTML='<p class="pl-online-note">Multiplayer features appear only in multiplayer mode.</p>';updateChat();return false}
 if(!connected())showUnavailable();
 else{renderOnline();loadEmpire();loadLeaderboard();loadPlayers();refreshChat()}
 updateChat();return true;
}
function init(){
 if(mounted)return;
 mounted=true;
 $('worldChatToggle')?.addEventListener('click',()=>{
  const panel=$('worldChatPanel');if(!panel)return;
  panel.hidden=!panel.hidden;
  $('worldChatToggle').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden){updateChat();refreshChat();$('worldChatInput')?.focus()}
 });
 $('worldChatClose')?.addEventListener('click',()=>{
  $('worldChatPanel').hidden=true;$('worldChatToggle')?.setAttribute('aria-expanded','false');
 });
 $('worldChatForm')?.addEventListener('submit',e=>{e.preventDefault();submitChat()});
 window.addEventListener('profitlands:viewchange',event=>{updateChat();if(event.detail?.view==='world')render()});
 window.addEventListener('profitlands:serverupdate',()=>{if(window.ProfitLandsWorkspace?.active?.()==='world')render();else updateChat()});
 updateChat();
}
window.ProfitLandsWorld={render,updateChat,attack,defend,online:connected,period:()=>period};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
