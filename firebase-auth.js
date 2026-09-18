/* ProfitLands Firebase account + cloud-save layer */
(function(){
  const CONFIG=window.PROFITLANDS_FIREBASE_CONFIG||{};
  const configured=CONFIG.apiKey && !String(CONFIG.apiKey).includes('PASTE_');
  let auth=null,db=null,currentUser=null,saveTimer=null,loadingCloud=false;
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
  function settings(){const p=window.profitlandsProfile||{};open(`<div class="auth-view"><span class="eyebrow">ACCOUNT SETTINGS</span><h2>Your ProfitLands identity</h2><div class="settings-grid"><div><label class="auth-label">PLAYER NAME</label><input id="setPlayer" class="auth-input" maxlength="24" value="${esc(p.playerName||'')}"></div><div><label class="auth-label">COMPANY NAME</label><input id="setCompany" class="auth-input" maxlength="40" value="${esc(p.companyName||'')}"></div></div><div id="setError" class="auth-error"></div><div class="auth-buttons"><button class="primary-button" id="saveSettings">Save Changes</button><button class="secondary-button" id="signOutButton">Sign Out</button></div></div>`);$('saveSettings').onclick=async()=>{const n=clean($('setPlayer').value),c=clean($('setCompany').value),problem=invalidName(n)||validCompany(c);if(problem){$('setError').textContent=problem;return}try{await saveProfile(currentUser.uid,{playerName:n,companyName:c});window.profitlandsProfile={playerName:n,companyName:c};state.playerName=n;state.companyName=c;localStorage.setItem(PROFILE_KEY,JSON.stringify(window.profitlandsProfile));save();close();refresh();render()}catch(e){$('setError').textContent=errorText(e)}};$('signOutButton').onclick=()=>auth.signOut()}
  function saveProfile(uid,data){return db.collection('users').doc(uid).set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}
  function localSaveExists(){try{return !!localStorage.getItem('profitlands-v2')}catch(e){return false}}
  function saveLastGameMeta(savedState){return {mode:savedState.mode,playType:savedState.playType,day:savedState.day,cash:savedState.cash,netWorth:typeof netWorth==='function'?netWorth():0,started:savedState.started!==false,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}}
  async function loadCloud(){
    if(!currentUser||!db)return;
    loadingCloud=true;
    try{
      const p=await db.collection('users').doc(currentUser.uid).get();
      if(p.exists){window.profitlandsProfile=p.data();state.playerName=p.data().playerName||'';state.companyName=p.data().companyName||'';localStorage.setItem(PROFILE_KEY,JSON.stringify(window.profitlandsProfile))}
      const lastRef=db.collection('users').doc(currentUser.uid).collection('saves').doc('last-game');
      const lastSnap=await lastRef.get();
      if(lastSnap.exists && lastSnap.data().state){
        const cloudState=lastSnap.data().state;
        Object.assign(state,cloudState);
        state.started=false;
        localStorage.setItem('profitlands-v2',JSON.stringify(state));
        window.profitlandsLastCloudSave={...lastSnap.data(),hasSave:true};
      }else if(localSaveExists()){
        const local=JSON.parse(localStorage.getItem('profitlands-v2'));
        window.profitlandsLastCloudSave={...saveLastGameMeta(local),state:local,hasSave:true,localOnly:true};
        await db.collection('users').doc(currentUser.uid).collection('saves').doc('last-game').set({state:local,...saveLastGameMeta(local),saveVersion:2},{merge:true});
      }else{
        window.profitlandsLastCloudSave={hasSave:false};
      }
    }catch(e){console.warn('Cloud load failed',e);window.profitlandsLastCloudSave={hasSave:false,error:true}}
    loadingCloud=false;
    render();
    refresh();
  }
  let lastCloudSignature='';
  function cloudSignature(){
    try{
      const copy=JSON.parse(JSON.stringify(state));
      delete copy.timeLeft;
      return JSON.stringify(copy);
    }catch(e){return ''}
  }
  async function cloudSave(force=false){
    if(!currentUser||!db||loadingCloud)return false;
    const signature=cloudSignature();
    if(!force && signature && signature===lastCloudSignature)return true;
    try{
      const snapshotState=JSON.parse(JSON.stringify(state));
      const saveId=state.mode+'-'+state.playType;
      const payload={
        state:snapshotState,
        mode:state.mode,
        playType:state.playType,
        day:state.day,
        playerName:state.playerName||(window.profitlandsProfile?.playerName||''),
        companyName:state.companyName||(window.profitlandsProfile?.companyName||''),
        saveVersion:2,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(currentUser.uid).collection('saves').doc(saveId).set(payload,{merge:true});
      await db.collection('users').doc(currentUser.uid).collection('saves').doc('last-game').set({...payload,started:snapshotState.started!==false},{merge:true});
      window.profitlandsLastCloudSave={...payload,hasSave:true};
      lastCloudSignature=signature;
      return true;
    }catch(e){
      console.error('Cloud save failed:',e);
      return false;
    }
  }
  const cloudSaveLater=()=>{
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>cloudSave(false),1000);
  };
  function renderResumeCard(){
    const home=document.getElementById('homeScreen');
    if(!home)return;
    let box=document.getElementById('profitlandsResumeCard');
    const saved=window.profitlandsLastCloudSave;
    const localRaw=(()=>{try{return localStorage.getItem('profitlands-v2')}catch(e){return null}})();
    let localState=null;try{localState=localRaw?JSON.parse(localRaw):null}catch(e){}
    const data=saved?.hasSave?saved:(localState&&(localState.started||localState.day>1)?{...localState,hasSave:true,localOnly:true}:null);
    if(!data){box?.remove();return}
    if(!box){box=document.createElement('div');box.id='profitlandsResumeCard';box.className='panel';const target=home.querySelector('.home-content')||home;target.insertBefore(box,target.firstChild)}
    const s=data.state||data;
    const nw=Number(data.netWorth||s.cash||0);
    box.innerHTML='<span class="eyebrow">SAVED GAME</span><h3>Continue your last empire</h3><p class="modal-sub">'+(data.localOnly?'Saved on this device':'Saved to your account')+' · '+(s.mode||'Standard')+' · '+(s.playType==='multi'?'Multiplayer':'Singleplayer')+' · Day '+(s.day||1)+'</p><div class="auth-buttons"><button class="primary-button" id="resumeLastGame">Continue Game <span>→</span></button><button class="secondary-button" id="discardResume">Start New Game</button></div>';
    box.querySelector('#resumeLastGame').onclick=()=>{
      Object.assign(state,s);
      state.timeLeft=Math.max(0,Number(state.timeLeft)||0);state.dayEndsAt=Date.now()+(state.timeLeft||MODES[state.mode]?.daySeconds||900)*1000;
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
    if(!currentUser){
      box.innerHTML='<button class="account-chip" id="plSignIn">Sign In</button><button class="account-chip" id="plCreate">Create Account</button>';
      $('plSignIn').onclick=signIn;
      $('plCreate').onclick=create;
    }else{
      const p=window.profitlandsProfile||{};
      box.innerHTML=`<button class="account-chip" id="plAccount">${esc(p.playerName||'Account')}</button>`;
      $('plAccount').onclick=settings;
    }
  }
  function install(){
    styles();
    if(!configured){
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
      document.addEventListener('click',e=>{
        if(window.profitLandsPlatform?.externalAuthDisabled)return;
        if(e.target.closest('#startGame')&&!currentUser){
          e.preventDefault();
          e.stopImmediatePropagation();
          signIn()
        }
      },true);
      auth.onAuthStateChanged(async u=>{
        currentUser=u;
        if(u){
          await loadCloud();
          refresh();
          await cloudSave(true);
          if(!window.profitLandsPlatform?.externalAuthDisabled&&$('homeScreen')?.classList.contains('active'))setTimeout(welcome,120)
        }else{
          lastCloudSignature='';
          refresh()
        }
      });
      window.profitlandsFirebase={signIn,create,settings,cloudSave}
    }catch(e){
      console.error(e);
      const n=document.querySelector('.local-note');
      if(n){n.textContent='Firebase could not initialize. Check firebase-config.js.';n.classList.add('firebase-status','bad')}
    }
  }
  window.addEventListener('load',install);
})();
