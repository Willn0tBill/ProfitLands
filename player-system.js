/* ProfitLands player identity + player-driven market/news layer */
(function(){
  const PLAYER_KEY='profitlands-player-name';
  const originalNames={};
  let approvedStart=false;
  let lastDay=0;
  let lastBusinessSignature='';

  function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function cleanName(v){return v.trim().replace(/\s+/g,' ');}

  /* Deliberately keeps the filter broad. It rejects common profanity and offensive slur-like terms
     without displaying the blocked vocabulary to players. */
  const blockedParts=[
    'fuck','shit','bitch','asshole','bastard','dick','piss','cunt','nigger','nigga','faggot','fag','retard'
  ];
  function invalidName(name){
    const normalized=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    if(normalized.length<2||normalized.length>24)return 'Name must be 2–24 characters.';
    if(!/^[\p{L}\p{N} ._'’-]+$/u.test(name))return 'Please use letters, numbers, spaces, or simple punctuation.';
    if(blockedParts.some(w=>normalized.includes(w)))return 'That name is not allowed. Please try another name.';
    return '';
  }

  function ensureModal(){
    if(document.getElementById('playerNameModal'))return;
    const modal=document.createElement('div');
    modal.id='playerNameModal';modal.className='modal hidden';
    modal.innerHTML=`<div class="modal-card player-name-card"><span class="eyebrow">PLAYER PROFILE</span><h2>Name your empire</h2><p class="modal-sub">Choose the name that ProfitLands News will use when it reports on your company and market activity.</p><label class="player-name-label" for="playerNameInput">YOUR NAME</label><input id="playerNameInput" class="player-name-input" maxlength="24" autocomplete="nickname" placeholder="Enter your name"><div id="playerNameError" class="player-name-error"></div><button id="playerNameContinue" class="primary-button">Continue <span>→</span></button></div>`;
    document.body.appendChild(modal);
    const input=modal.querySelector('#playerNameInput');
    const error=modal.querySelector('#playerNameError');
    modal.querySelector('#playerNameContinue').onclick=()=>{
      const name=cleanName(input.value);const problem=invalidName(name);
      if(problem){error.textContent=problem;input.focus();return;}
      state.playerName=name;localStorage.setItem(PLAYER_KEY,name);save();
      modal.classList.add('hidden');approvedStart=true;$('startGame').click();
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter')modal.querySelector('#playerNameContinue').click()});
  }

  function askForName(){
    ensureModal();const modal=$('playerNameModal'),input=$('playerNameInput'),error=$('playerNameError');
    error.textContent='';input.value=state.playerName||localStorage.getItem(PLAYER_KEY)||'';modal.classList.remove('hidden');setTimeout(()=>input.focus(),30);
  }

  function news(text){if(!text)return;state.news=state.news||[];state.news.push(text);if(state.news.length>30)state.news=state.news.slice(-30);save();render();}

  function businessSignature(){
    return (state.businesses||[]).map(b=>`${b.type}:${b.level}:${b.locations?.length||b.chainCount+1}:${b.marketing}:${b.efficiency}`).join('|');
  }

  function stockImpact(){
    const impacts={nova:0,harbor:0,atlas:0,skyline:0};
    (state.businesses||[]).forEach(b=>{
      const locations=b.locations?.length||b.chainCount+1;const profit=typeof totalBusinessProfit==='function' ? 0 : 0;
      const strength=Math.min(3,locations*.35+(b.level-1)*.12+(b.popularity||55)/100*.18);
      if(['software'].includes(b.type))impacts.nova+=strength;
      if(['coffee','restaurant','gamestore','hotel'].includes(b.type))impacts.harbor+=strength;
      if(['factory','logistics'].includes(b.type))impacts.atlas+=strength;
      if(['dealership'].includes(b.type))impacts.skyline+=strength;
      if(['logistics'].includes(b.type))impacts.harbor+=strength*.18;
      if(['gamestore'].includes(b.type))impacts.nova+=strength*.12;
    });
    STOCKS.forEach(s=>{
      const p=impacts[s.id]||0;const pressure=Math.min(4.5,p*1.15);const noise=(Math.random()-.5)*1.4;
      s._change=Math.max(-9,Math.min(9,noise+pressure));
      s.price=Math.max(.5,+(s.price*(1+s._change/100)).toFixed(2));
    });
    return impacts;
  }

  function playerBusinessNews(){
    const name=esc(state.playerName||'the player');const businesses=state.businesses||[];
    if(!businesses.length){news(`${name} is still looking for the right opportunity after entering ProfitLands.`);return;}
    const b=businesses.reduce((a,x)=>(x.level+(x.locations?.length||1))>(a.level+(a.locations?.length||1))?x:a,businesses[0]);
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);const locations=b.locations?.length||b.chainCount+1;
    const headlines=[
      `${name}'s ${t.name} is gaining attention as the company expands its ProfitLands presence.`,
      `Investors are watching ${name} after the company reached ${locations} ${locations===1?'location':'locations'} in its ${t.name} chain.`,
      `${name} is becoming a more visible name in ProfitLands business news as its ${t.name} operation grows.`,
      `Market analysts are tracking ${name}'s expansion strategy after another strong business day.`,
      `${name}'s latest business moves are influencing demand across related industries.`
    ];
    news(headlines[state.day%headlines.length]);
  }

  function onNewDay(){
    if(!state.started)return;
    const impacts=stockImpact();
    const total=Object.values(impacts).reduce((a,b)=>a+b,0);
    playerBusinessNews();
    const name=esc(state.playerName||'the player');
    if(total>1.5){news(`ProfitLands markets reacted to ${name}'s growing business activity, with several related stocks moving higher.`)}
    else if(total===0){news(`${name} has not entered the major business sectors yet, leaving today's market mostly unchanged.`)}
    else{news(`${name}'s business activity is beginning to show up in sector trading across ProfitLands.`)}
    render();save();
  }

  function watchBusinesses(){
    const sig=businessSignature();
    if(lastBusinessSignature==='' ){lastBusinessSignature=sig;return;}
    if(sig!==lastBusinessSignature){
      const before=lastBusinessSignature;lastBusinessSignature=sig;
      const name=esc(state.playerName||'Your company');
      const newest=(state.businesses||[])[state.businesses.length-1];
      if(newest){const t=BUSINESS_TYPES.find(x=>x.id===newest.type);news(`${name} made a new move in the ${t.name} sector, drawing attention from investors.`)}
      else news(`${name} changed its corporate portfolio, and investors are watching the move.`);
    }
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#startGame')&&!approvedStart){
      e.preventDefault();e.stopImmediatePropagation();askForName();
    }
  },true);

  const dayObserver=new MutationObserver(()=>{
    const d=Number($('gameDay')?.textContent||0);
    if(d&&lastDay&&d!==lastDay)setTimeout(onNewDay,0);
    if(d)lastDay=d;
  });
  dayObserver.observe(document.body,{subtree:true,childList:true,characterData:true});

  setInterval(()=>{if(state.started)watchBusinesses()},700);

  const savedName=localStorage.getItem(PLAYER_KEY);if(savedName)state.playerName=savedName;
  if(!state.playerName)state.playerName='';
})();
