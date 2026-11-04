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
 if(!Number.isFinite(number)||number<0)return '—';
 return '$'+(number>=1e12?(number/1e12).toFixed(2)+'T':number>=1e9?(number/1e9).toFixed(2)+'B':number>=1e6?(number/1e6).toFixed(2)+'M':Math.round(number).toLocaleString('en-US'));
};
let period='day',targetUid='',players=[],busy=false,latest=0,lastChatAt=0,mounted=false;
const page=()=> $('worldContent');
const message=text=>{const status=$('worldStatus');if(status)status.textContent=text};
function showUnavailable(){
 const root=page();if(!root)return;
 root.innerHTML='<div class="pl-online-callout" role="status"><span>🌎</span><div><h3>Shared world is not connected yet</h3><p>Multiplayer Preview still runs a local economy. Real leaderboards, rival attacks, and chat need the server-authoritative online engine before they can be used. Your singleplayer empire remains safe.</p></div></div>'+renderRules();
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
 root.innerHTML='<div class="pl-online-callout pl-online-live"><span>🌎</span><div><h3>ProfitLands World 1</h3><p>Shared economy connected. Online activity and scores come from the game server.</p></div></div>'+
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
 $('worldShield').onclick=()=>defend();
 $('worldPvpToggle').onclick=()=>togglePvP();
 updatePeriod();updateButtons();
}
function updatePeriod(){
 document.querySelectorAll('[data-lb]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.lb===period)));
}
async function loadLeaderboard(){
 if(!connected())return;
 const stamp=++latest,board=$('worldLeaderboard');
 if(board)board.textContent='Loading verified scores…';
 try{
  const entries=await online().getLeaderboard(period);
  if(stamp===latest&&board)board.innerHTML=leaderboardRows(entries);
 }catch(e){if(stamp===latest&&board)board.textContent='Server rankings unavailable. Try refreshing.'}
}
async function loadPlayers(){
 if(!connected())return;
 try{
  players=await online().getPlayers();
  if(!Array.isArray(players))players=[];
  renderPlayers();
 }catch(e){message('Could not load players.');players=[];renderPlayers()}
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
  await Promise.all([loadLeaderboard(),loadPlayers()]);
  return true;
 }catch(e){message('Attack rejected by the server: '+(e?.message||'Please retry.'));return false}
 finally{busy=false;updateButtons()}
}
async function defend(){
 if(!connected()||busy)return false;
 if(!window.confirm?.('Buy a temporary PvP shield using in-game cash? The server will calculate the final price.'))return false;
 busy=true;
 try{await online().requestDefense();message('Protection request sent to the world server.');return true}
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
 const ready=connected(),input=$('worldChatInput'),send=$('worldChatSend');
 if(input){input.disabled=!ready;input.placeholder=ready?'Message World 1…':'World chat unavailable until the online server is ready'}
 if(send)send.disabled=!ready;
 const status=$('worldChatStatus');if(status)status.textContent=ready?'Online World 1 chat':'Not connected · Preview only';
 const list=$('worldChatMessages');if(list&&!ready)list.textContent='No live chat connection. Messages are not simulated or stored locally.';
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
 if(!connected()||typeof online().getChat!=='function')return;
 try{renderChatMessages(await online().getChat())}catch(e){}
}
function render(){
 if(!page())return false;
 if(!active()){page().innerHTML='<p class="pl-online-note">Multiplayer features appear only in multiplayer mode.</p>';updateChat();return false}
 if(!connected())showUnavailable();
 else{renderOnline();loadLeaderboard();loadPlayers();refreshChat()}
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
