/* ProfitLands Firebase account + cloud-save layer */
(function(){
  const CONFIG=window.PROFITLANDS_FIREBASE_CONFIG||{};
  const configured=CONFIG.apiKey && !String(CONFIG.apiKey).includes('PASTE_');
  let auth=null,db=null,currentUser=null,saveTimer=null,loadingCloud=false;
  let cloudRevision=0,blockedCloud=false,pendingConflict=null,savingCloud=false;
  const guard=window.ProfitLandsCloudGuard;
  const BASE_KEY='profitlands-cloud-base-v1:';
  const BACKUP_KEY='profitlands-v2-conflict-backup';
  function knownBase(uid){try{return localStorage.getItem(BASE_KEY+uid)||''}catch(e){return ''}}
  function keepBaseline(uid,snapshot){
    const sig=guard?.fingerprint(snapshot)||'';
    if(sig&&uid)try{localStorage.setItem(BASE_KEY+uid,sig)}catch(e){}
  }
  const isValid=x=>x&&typeof x==='object'&&
    ['fast','standard','long','persistent'].includes(x.mode)&&
    Number.isFinite(Number(x.cash))&&Array.isArray(x.businesses)&&x.stocks&&typeof x.stocks==='object';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const brief=x=>'Day '+(Number(x?.day)||1)+' · '+(x?.businesses?.length||0)+' companies';
  function storeOtherSave(x){
    if(!isValid(x))return;
    const raw=JSON.stringify(x);
    localStorage.setItem(BACKUP_KEY,raw);
    if(localStorage.getItem(BACKUP_KEY)!==raw)throw Error('Cannot preserve the other save.');
  }
  function markConflict(local,cloud,revision){
    if(!isValid(cloud))return false;
    pendingConflict={local:copy(isValid(local)?local:state),cloud:copy(cloud),revision};
    blockedCloud=true;
    window.profitlandsCloudConflict={device:brief(pendingConflict.local),account:brief(pendingConflict.cloud)};
    refresh();showCloudConflict();
    return true;
  }
  function showCloudConflict(){
    if(!pendingConflict)return false;
    open('<div class="auth-view"><span class="eyebrow">SAVE CONFLICT</span><h2>Choose your empire</h2>'+
      '<p class="modal-sub">Progress differs between this device and your cloud account. Cloud saving is paused. Neither version will be silently overwritten.</p>'+
      '<div id="cloudConflictSummary" class="welcome-profile"></div>'+
      '<div class="auth-buttons"><button id="keepDeviceEmpire" class="primary-button">Keep this device</button>'+
      '<button id="useCloudEmpire" class="secondary-button">Use cloud empire</button></div>'+
      '<p class="modal-sub">The other version will be saved to this browser as a recovery copy.</p>'+
      '<p id="cloudConflictError" class="auth-error" role="status"></p></div>');
    $('cloudConflictSummary').textContent='Device: '+brief(pendingConflict.local)+' · Cloud: '+brief(pendingConflict.cloud);
    $('keepDeviceEmpire').onclick=()=>resolveConflict('local');
    $('useCloudEmpire').onclick=()=>resolveConflict('cloud');
    return true;
  }
  async function resolveConflict(choice){
    if(!pendingConflict||!currentUser||!['local','cloud'].includes(choice))return false;
    const info=pendingConflict,uid=currentUser.uid;
    const deviceBefore=copy(state);
    const localBefore=(()=>{try{return localStorage.getItem('profitlands-v2')}catch(e){return null}})();
    const prompt=choice==='local'
      ?'Keep this device and replace the cloud empire? The previous cloud save will be backed up locally.'
      :'Use the cloud empire instead? Current device progress will be backed up locally.';
    if(!window.confirm?.(prompt))return false;
    try{
      const playing=$('gameScreen')?.classList.contains('active')&&state.started;
      storeOtherSave(choice==='cloud'?(isValid(state)?copy(state):info.local):info.cloud);
      pendingConflict=null;blockedCloud=false;window.profitlandsCloudConflict=null;
      cloudRevision=info.revision;
      if(choice==='cloud'){
        window.stopProfitLandsTimer?.();
        const restored=copy(info.cloud);
        // The browser must accept the new snapshot BEFORE active state changes.
        localStorage.setItem('profitlands-v2',JSON.stringify(restored));
        Object.assign(state,restored);
        window.ProfitLandsMoney?.attach?.(state);
        window.ProfitLandsBalance?.migrate?.();
        window.restoreProfitLandsMarket?.();
        state.started=false;
        keepBaseline(uid,restored);
        try{localStorage.setItem('profitlands-local-owner',uid)}catch(e){}
        lastCloudSignature='';
        window.profitlandsLastCloudSave={state:restored,hasSave:true};
        close();refresh();render();
        if(playing)window.resumeProfitLands?.();
        return true;
      }
      // Preserve all local changes made while the conflict prompt was open.
      if(!playing){
        Object.assign(state,info.local);
        window.ProfitLandsMoney?.attach?.(state);
        window.ProfitLandsBalance?.migrate?.();
        window.restoreProfitLandsMarket?.();
        state.started=false;
      }
      keepBaseline(uid,info.cloud);
      try{localStorage.setItem('profitlands-local-owner',uid)}catch(e){}
      close();refresh();render();
      // A transaction below re-checks the revision if another device has
      // changed the account while this choice dialog was open.
      return await cloudSave(true);
    }catch(e){
      if(choice==='cloud'){
        Object.assign(state,deviceBefore);
        try{
          if(localBefore!==null)localStorage.setItem('profitlands-v2',localBefore);
        }catch(backupError){console.warn('Cannot restore prior local snapshot',backupError)}
        window.ProfitLandsMoney?.attach?.(state);
      }
      blockedCloud=true;pendingConflict=info;
      window.profitlandsCloudConflict={device:brief(info.local),account:brief(info.cloud)};
      const status=$('cloudConflictError');
      if(status)status.textContent='Could not resolve: '+(e?.message||'Unknown error');
      console.warn('Cloud conflict resolution failed',e);
      return false;
    }
  }
  const PROFILE_KEY='profitlands-profile-v1';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
  const invalidName=v=>{const n=clean(v),x=n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');if(x.length<2||x.length>24)return'Use 2–24 characters.';if(!/^[\p{L}\p{N} ._'’-]+$/u.test(n))return'Use letters, numbers, spaces, or simple punctuation.';const blocked=['fuck','shit','bitch','asshole','bastard','dick','piss','cunt','nigger','nigga','faggot','fag','retard'];if(blocked.some(w=>x.includes(w)))return'That name is not allowed. Please try another name.';return''};
  const validCompany=v=>{const n=clean(v);if(n.length<2||n.length>40)return'Company name must be 2–40 characters.';if(!/^[\p{L}\p{N} .,&'’\-]+$/u.test(n))return'Use letters, numbers, spaces, and simple punctuation.';return''};
  function styles(){if($('firebaseAuthStyles'))return;const s=document.createElement('style');s.id='firebaseAuthStyles';s.textContent='.account-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.account-chip{border:1px solid #2b3540;background:#11161d;color:#e8edf2;border-radius:999px;padding:9px 13px;font-size:13px;cursor:pointer}.auth-card{max-width:560px}.auth-view{display:flex;flex-direction:column;gap:12px}.auth-view h2{margin-bottom:2px}.auth-label{font-size:11px;letter-spacing:.12em;color:#87919d;font-weight:800}.auth-input{width:100%;box-sizing:border-box;background:#0c1117;color:#f2f5f7;border:1px solid #2a3540;border-radius:12px;padding:13px 14px;font:inherit;outline:none}.auth-input:focus{border-color:#8edb58;box-shadow:0 0 0 3px #8edb5818}.auth-error{min-height:20px;color:#ff8e8e;font-size:13px}.auth-success{color:#aef45f;font-size:13px}.auth-link{background:none;border:0;color:#aef45f;cursor:pointer;padding:3px;text-align:left;font:inherit}.auth-divider{display:flex;align-items:center;gap:10px;color:#68727d;font-size:12px;margin:3px 0}.auth-divider:before,.auth-divider:after{content:"";height:1px;background:#252e39;flex:1}.welcome-card{text-align:center}.welcome-profile{background:#0d131a;border:1px solid #252e39;border-radius:16px;padding:18px;margin:12px 0}.welcome-profile strong{display:block;font-size:22px}.welcome-profile small{display:block;color:#8f99a5;margin-top:5px}.auth-buttons{display:flex;gap:10px;flex-wrap:wrap}.auth-buttons>*{flex:1;min-width:160px}.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.firebase-status{font-size:12px;color:#89939e;margin-top:5px}.firebase-status.bad{color:#ff9b9b}@media(max-width:600px){.settings-grid{grid-template-columns:1fr}.auth-buttons{flex-direction:column}}';document.head.appendChild(s)}
  function modal(){styles();if($('firebaseAuthModal'))return;const m=document.createElement('div');m.id='firebaseAuthModal';m.className='modal hidden';m.innerHTML='<div class="modal-card auth-card"><button class="modal-close" id="authClose">×</button><div id="authContent"></div></div>';document.body.appendChild(m);$('authClose').onclick=()=>m.classList.add('hidden')}
  const open=html=>{modal();$('authContent').innerHTML=html;$('firebaseAuthModal').classList.remove('hidden')};const close=()=>{$('firebaseAuthModal')?.classList.add('hidden')};
  function errorText(e){const m={'auth/invalid-email':'That email address is not valid.','auth/user-not-found':'No account was found with that email.','auth/wrong-password':'That password is incorrect.','auth/invalid-credential':'The email or password is incorrect.','auth/email-already-in-use':'That email already has an account.','auth/weak-password':'Use a stronger password.','auth/too-many-requests':'Too many attempts. Try again later.','auth/network-request-failed':'Network connection failed. Try again.'};return m[e?.code]||e?.message||'Something went wrong. Please try again.'}
  function signIn(){open('<div class="auth-view"><span class="eyebrow">PROFITLANDS ACCOUNT</span><h2>Sign in</h2><p class="modal-sub">Your game saves are tied to your account.</p><label class="auth-label">EMAIL</label><input id="authEmail" class="auth-input" type="email" autocomplete="email" placeholder="you@example.com"><label class="auth-label">PASSWORD</label><input id="authPassword" class="auth-input" type="password" autocomplete="current-password" placeholder="Password"><div id="authError" class="auth-error"></div><button id="doSignIn" class="primary-button">Sign In <span>→</span></button><button id="forgotPassword" class="auth-link">Forgot password?</button><div class="auth-divider">OR</div><button id="goCreate" class="secondary-button">Create an account</button></div>');$('doSignIn').onclick=async()=>{try{await auth.signInWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value);close()}catch(e){$('authError').textContent=errorText(e)}};$('forgotPassword').onclick=async()=>{const e=$('authEmail').value.trim();if(!e){$('authError').textContent='Enter your email first.';return}try{await auth.sendPasswordResetEmail(e);$('authError').className='auth-success';$('authError').textContent='Password reset email sent.'}catch(x){$('authError').className='auth-error';$('authError').textContent=errorText(x)}};$('goCreate').onclick=create}
  async function create(){open('<div class="auth-view"><span class="eyebrow">NEW PLAYER</span><h2>Create your account</h2><p class="modal-sub">Your account keeps your identity and cloud saves available when you return.</p><label class="auth-label">EMAIL</label><input id="authEmail" class="auth-input" type="email" autocomplete="email" placeholder="you@example.com"><label class="auth-label">PASSWORD</label><input id="authPassword" class="auth-input" type="password" autocomplete="new-password" placeholder="At least 6 characters"><div class="settings-grid"><div><label class="auth-label">PLAYER NAME</label><input id="authPlayer" class="auth-input" maxlength="24" placeholder="Your name"></div><div><label class="auth-label">COMPANY NAME</label><input id="authCompany" class="auth-input" maxlength="40" placeholder="Your company"></div></div><div id="authError" class="auth-error"></div><button id="doCreate" class="primary-button">Create Account <span>→</span></button><button id="goLogin" class="auth-link">Already have an account? Sign in</button></div>');$('doCreate').onclick=async()=>{const e=$('authEmail').value.trim(),p=$('authPassword').value,n=clean($('authPlayer').value),c=clean($('authCompany').value),problem=invalidName(n)||validCompany(c);if(problem){$('authError').textContent=problem;return}if(p.length<6){$('authError').textContent='Password must be at least 6 characters.';return}try{const cred=await auth.createUserWithEmailAndPassword(e,p);await saveProfile(cred.user.uid,{playerName:n,companyName:c});window.profitlandsProfile={playerName:n,companyName:c};state.playerName=n;state.companyName=c;localStorage.setItem(PROFILE_KEY,JSON.stringify(window.profitlandsProfile));close();refresh()}catch(x){$('authError').textContent=errorText(x)}};$('goLogin').onclick=signIn}
  function welcome(){const p=window.profitlandsProfile||{};open(`<div class="auth-view welcome-card"><span class="eyebrow">WELCOME BACK</span><h2>Continue as ${esc(p.playerName||'Player')}?</h2><div class="welcome-profile"><strong>${esc(p.playerName||'Player')}</strong><small>${esc(p.companyName||'Your Company')}</small></div><div class="auth-buttons"><button class="primary-button" id="continueAccount">Continue as ${esc(p.playerName||'Player')} <span>→</span></button><button class="secondary-button" id="notYou">Not you?</button></div></div>`);$('continueAccount').onclick=close;$('notYou').onclick=()=>{auth.signOut();signIn()}}
  function settings(){const p=window.profitlandsProfile||{};const badgeCount=window.ProfitLandsBadges?.earnedCount?.()||0;const playing=$('gameScreen')?.classList.contains('active');
  const showcase=(window.ProfitLandsBadges?.showcased?.()||[]).slice(0,5);
  const guestImport=window.ProfitLandsAccountTrophies?.guestAvailable?.()
   ?'<button type="button" id="importGuestTrophies" class="secondary-button" style="margin-top:8px">Import guest trophies from this device</button>':'';
  const showcaseHtml=showcase.length
   ?'<div class="auth-featured" aria-label="Featured player achievements">'+showcase.map(b=>'<span title="'+esc(b.title)+'">'+esc(b.icon)+' '+esc(b.title)+'</span>').join('')+'</div>'
   :'<small style="display:block;margin-top:8px;opacity:.7">No featured badges yet. Choose up to five in the Trophy Room.</small>';
  open(`<div class="auth-view"><span class="eyebrow">ACCOUNT SETTINGS</span><h2>Your ProfitLands identity</h2><div class="settings-grid"><div><label class="auth-label">PLAYER NAME</label><input id="setPlayer" class="auth-input" maxlength="24" value="${esc(p.playerName||'')}"></div><div><label class="auth-label">COMPANY NAME</label><input id="setCompany" class="auth-input" maxlength="40" value="${esc(p.companyName||'')}"></div></div><div class="auth-trophies" style="padding:12px 0"><strong>${badgeCount.toLocaleString()} / 131,072 badges earned</strong><small style="display:block;opacity:.8">Your Trophy Room belongs to your ProfitLands account, separate from Steam achievements.</small><button type="button" id="openAccountTrophies" class="secondary-button" style="margin-top:8px" ${playing?"":"disabled"}>View my Trophy Room</button>${playing?"":"<small style=\"display:block\">Resume a game to browse your achievements.</small>"}${showcaseHtml}${guestImport}</div><div id="setError" class="auth-error"></div><div class="auth-buttons"><button class="primary-button" id="saveSettings">Save Changes</button><button class="secondary-button" id="signOutButton">Sign Out</button></div></div>`);$('openAccountTrophies').onclick=()=>{close();window.ProfitLandsWorkspace?.show?.('trophies')};if($('importGuestTrophies'))$('importGuestTrophies').onclick=()=>{if(window.ProfitLandsAccountTrophies?.importGuest?.()){close();settings()}};$('saveSettings').onclick=async()=>{const n=clean($('setPlayer').value),c=clean($('setCompany').value),problem=invalidName(n)||validCompany(c);if(problem){$('setError').textContent=problem;return}try{await saveProfile(currentUser.uid,{playerName:n,companyName:c});window.profitlandsProfile={playerName:n,companyName:c};state.playerName=n;state.companyName=c;localStorage.setItem(PROFILE_KEY,JSON.stringify(window.profitlandsProfile));save();close();refresh();render()}catch(e){$('setError').textContent=errorText(e)}};$('signOutButton').onclick=()=>auth.signOut()}
  function saveProfile(uid,data){return db.collection('users').doc(uid).set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}
  function localSaveExists(){try{return !!localStorage.getItem('profitlands-v2')}catch(e){return false}}
  function saveLastGameMeta(savedState){return {mode:savedState.mode,playType:savedState.playType,day:savedState.day,cash:savedState.cash,netWorth:typeof netWorth==='function'?netWorth():0,started:savedState.started!==false,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}}
  function localSave(){
    try{
      const raw=localStorage.getItem('profitlands-v2');
      return raw?JSON.parse(raw):null;
    }catch(e){return null}
  }
  function savedAt(st){return Number(st?.savedAt||0)}
  async function loadCloud(){
    if(!currentUser||!db)return;
    loadingCloud=true;
    const uid=currentUser.uid;
    let uploadLocal=false,loaded=false;
    try{
      const p=await db.collection('users').doc(uid).get();
      if(p.exists){
        window.profitlandsProfile=p.data();
        state.playerName=p.data().playerName||'';
        state.companyName=p.data().companyName||'';
        localStorage.setItem(PROFILE_KEY,JSON.stringify(window.profitlandsProfile));
      }
      const lastRef=db.collection('users').doc(uid).collection('saves').doc('last-game');
      const snap=await lastRef.get();
      const cloudDoc=snap.exists?snap.data():null;
      const remote=isValid(cloudDoc?.state)?cloudDoc.state:null;
      cloudRevision=guard?.revision(cloudDoc)||0;
      const deviceOwner=(()=>{try{return localStorage.getItem('profitlands-local-owner')}catch(e){return null}})();
      const rawLocal=(deviceOwner&&deviceOwner!==uid)?null:localSave();
      const local=isValid(rawLocal)?rawLocal:null;
      const choice=guard?.decide(local,remote,knownBase(uid))||'none';
      if(choice==='conflict'){
        markConflict(local,remote,cloudRevision);
        window.profitlandsLastCloudSave={hasSave:false,conflict:true};
      }else{
        const chosen=choice==='local'?local:choice==='cloud'?remote:null;
        if(chosen){
          const restored=copy(chosen);
          // Preserve the other account's local save before replacing this device.
          if(choice==='cloud'){
            if(deviceOwner&&deviceOwner!==uid){
              const oldDevice=localSave();
              if(isValid(oldDevice))localStorage.setItem('profitlands-v2-previous-owner:'+deviceOwner,JSON.stringify(oldDevice));
            }else if(local&&guard.fingerprint(local)!==guard.fingerprint(restored))storeOtherSave(local);
            localStorage.setItem('profitlands-v2',JSON.stringify(restored));
          }
          state.actionCapacityVersion=0;
          Object.assign(state,restored);
          window.ProfitLandsMoney?.attach?.(state);
          window.ProfitLandsBalance?.migrate?.();
          window.restoreProfitLandsMarket?.();
          state.started=false;
          if(choice==='cloud'){
            keepBaseline(uid,restored);
            window.profitlandsLastCloudSave={...cloudDoc,state:restored,hasSave:true};
          }else{
            window.profitlandsLastCloudSave={state:restored,hasSave:true,localOnly:!remote};
            uploadLocal=!remote||guard.fingerprint(remote)!==guard.fingerprint(restored);
          }
        }else window.profitlandsLastCloudSave={hasSave:false};
        loaded=true;
      }
    }catch(e){
      console.warn('Cloud load failed; device save remains available',e);
      window.profitlandsLastCloudSave={hasSave:false,error:true};
    }finally{
      loadingCloud=false;
      if(loaded)try{localStorage.setItem('profitlands-local-owner',uid)}catch(e){}
      render();refresh();
    }
    if(uploadLocal&&!blockedCloud)await cloudSave(true);
  }
  let lastCloudSignature='';
  function cloudSignature(){
    try{
      const copy=JSON.parse(JSON.stringify(state));
      delete copy.timeLeft;
      delete copy.savedAt;
      return JSON.stringify(copy);
    }catch(e){return ''}
  }
  async function cloudSave(force=false){
    if(!currentUser||!db||loadingCloud||blockedCloud||pendingConflict)return false;
    if(savingCloud){cloudSaveLater();return false}
    const signature=cloudSignature();
    if(!force&&signature&&signature===lastCloudSignature)return true;
    savingCloud=true;
    const uid=currentUser.uid;
    const snapshot=copy(state);
    try{
      const payload={
        state:snapshot,mode:snapshot.mode,playType:snapshot.playType,day:snapshot.day,
        playerName:snapshot.playerName||(window.profitlandsProfile?.playerName||''),
        companyName:snapshot.companyName||(window.profitlandsProfile?.companyName||''),
        saveVersion:4,updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      const ref=db.collection('users').doc(uid).collection('saves').doc('last-game');
      const next=await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        const remote=snap.exists?snap.data():null;
        const revision=guard.revision(remote);
        if(revision!==cloudRevision){
          const err=new Error('Cloud save changed on another device');
          err.code='profitlands/conflict';
          err.remote=remote;err.revision=revision;
          throw err;
        }
        tx.set(ref,{...payload,started:snapshot.started!==false,revision:revision+1},{merge:true});
        return revision+1;
      });
      cloudRevision=next;
      keepBaseline(uid,snapshot);
      // The per-mode snapshot is auxiliary. The revision-checked last-game
      // document is the authoritative save across devices.
      try{await db.collection('users').doc(uid).collection('saves').doc(snapshot.mode+'-'+snapshot.playType).set(payload,{merge:true})}
      catch(e){console.warn('Auxiliary mode copy could not be updated',e)}
      window.profitlandsLastCloudSave={...payload,revision:cloudRevision,hasSave:true};
      lastCloudSignature=signature;
      return true;
    }catch(e){
      if(e?.code==='profitlands/conflict'&&uid===currentUser?.uid){
        markConflict(snapshot,e.remote?.state,e.revision);
        console.warn('Cloud autosave paused because another device changed progress.');
      }else console.error('Cloud save failed; device progress remains available',e);
      return false;
    }finally{savingCloud=false}
  }
  const cloudSaveLater=()=>{
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>cloudSave(false),1000);
  };
  function renderResumeCard(){
    const home=document.getElementById('homeScreen');
    if(!home)return;
    let box=document.getElementById('profitlandsResumeCard');
    if(pendingConflict){
      if(!box){box=document.createElement('div');box.id='profitlandsResumeCard';box.className='panel';const target=home.querySelector('.home-content')||home;target.insertBefore(box,target.firstChild)}
      box.innerHTML='<span class="eyebrow">SAVE CONFLICT</span><h3>Your empires differ</h3>'+
        '<p class="modal-sub">Cloud saving is paused until you choose which progress to keep.</p>'+
        '<div class="auth-buttons"><button class="primary-button" id="reviewSaveConflict">Review saves</button></div>';
      $('reviewSaveConflict').onclick=showCloudConflict;return;
    }
    const saved=window.profitlandsLastCloudSave;
    const localRaw=(()=>{try{return localStorage.getItem('profitlands-v2')}catch(e){return null}})();
    let localState=null;try{localState=localRaw?JSON.parse(localRaw):null}catch(e){}
    const hasProgress=st=>!!st&&(Number(st.day)>1||Number(st.cash)!==1000||(Array.isArray(st.businesses)&&st.businesses.length>0)||Number(st.property)>0||Object.values(st.stocks||{}).some(h=>Number(h?.shares)>0));
    const owner=(()=>{try{return localStorage.getItem('profitlands-local-owner')}catch(e){return null}})();
    const safeLocal=owner&&currentUser&&owner!==currentUser.uid?null:localState;
    const data=saved?.hasSave?saved:(hasProgress(safeLocal)?{...safeLocal,hasSave:true,localOnly:true}:null);
    if(!data){box?.remove();return}
    if(!box){box=document.createElement('div');box.id='profitlandsResumeCard';box.className='panel';const target=home.querySelector('.home-content')||home;target.insertBefore(box,target.firstChild)}
    const s=data.state||data;
    const nw=Number(data.netWorth||s.cash||0);
    box.innerHTML='<span class="eyebrow">SAVED GAME</span><h3>Continue your last empire</h3><p class="modal-sub">'+(data.localOnly?'Saved on this device':'Saved to your account')+' · '+(s.mode||'Standard')+' · '+(s.playType==='multi'?'Multiplayer':'Singleplayer')+' · Day '+(s.day||1)+'</p><div class="auth-buttons"><button class="primary-button" id="resumeLastGame">Continue Game <span>→</span></button><button class="secondary-button" id="discardResume">Start New Game</button></div>';
    box.querySelector('#resumeLastGame').onclick=()=>{
      Object.assign(state,s);
      window.restoreProfitLandsMarket?.();
      const deadline=Number(state.dayEndsAt);
      if(!Number.isFinite(deadline)||deadline<=0)state.dayEndsAt=Date.now()+(Math.max(1,Number(state.timeLeft)||0)||MODES[state.mode]?.daySeconds||900)*1000;
      state.timeLeft=Math.max(0,Math.ceil((state.dayEndsAt-Date.now())/1000));
      window.resumeProfitLands?.();
      box.remove();
    };
    box.querySelector('#discardResume').onclick=()=>box.remove();
  }
  function refresh(){
    styles();
    const top=document.querySelector('.topbar');
    if(!top)return;
    renderResumeCard();
    let box=$('profitlandsAccountActions');
    if(window.profitLandsPlatform?.externalAuthDisabled){box?.remove();return}
    if(!box){
      box=document.createElement('div');
      box.id='profitlandsAccountActions';
      box.className='account-actions';
      top.appendChild(box);
    }
    const note=document.querySelector('.local-note');
    if(pendingConflict&&currentUser){
      box.innerHTML='<button class="account-chip" id="plReviewCloudConflict">Review save conflict</button>';
      $('plReviewCloudConflict').onclick=showCloudConflict;
    }else if(!currentUser){
      box.innerHTML='<button class="account-chip" id="plSignIn">Sign In</button><button class="account-chip" id="plCreate">Create Account</button>';
      $('plSignIn').onclick=signIn;
      $('plCreate').onclick=create;
      if(note)note.textContent='Playing without an account saves progress on this device.';
    }else{
      const p=window.profitlandsProfile||{};
      box.innerHTML=`<button class="account-chip" id="plAccount">${esc(p.playerName||'Account')}</button>`;
      $('plAccount').onclick=settings;
      if(note)note.textContent='Your progress will be saved to your ProfitLands account.';
    }
  }
  function install(){
    styles();
    if(!configured){
      window.ProfitLandsAccountTrophies?.onAuthChanged?.(null,null);
      refresh();
      const n=document.querySelector('.local-note');
      if(n){n.textContent='Firebase is not connected yet — add your Web App config in firebase-config.js.';n.classList.add('firebase-status','bad')}
      return
    }
    try{
      firebase.initializeApp(CONFIG);
      auth=firebase.auth();
      db=firebase.firestore();
      window.profitlandsSaveHook=()=>cloudSaveLater();
      auth.onAuthStateChanged(async u=>{
        clearTimeout(saveTimer);
        lastCloudSignature='';
        cloudRevision=0;blockedCloud=false;pendingConflict=null;
        window.profitlandsCloudConflict=null;
        window.ProfitLandsAccountTrophies?.prepare?.(u?.uid||null);
        currentUser=u;
        if(u){
          await loadCloud();
          await window.ProfitLandsAccountTrophies?.onAuthChanged?.(u,db);
          refresh();
        }else{
          lastCloudSignature='';
          await window.ProfitLandsAccountTrophies?.onAuthChanged?.(null,null);
          refresh();
        }
      });
      window.profitlandsFirebase={signIn,create,settings,cloudSave,refresh,getCurrentUser:()=>currentUser,
        cloudStatus:()=>({blocked:blockedCloud,conflict:!!pendingConflict,revision:cloudRevision}),
        showCloudConflict,resolveConflict}
    }catch(e){
      console.error(e);
      const n=document.querySelector('.local-note');
      if(n){n.textContent='Firebase could not initialize. Check firebase-config.js.';n.classList.add('firebase-status','bad')}
    }
  }
  window.addEventListener('load',install);
})();
