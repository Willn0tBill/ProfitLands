/* ProfitLands v0.8 balanced action regeneration.
   World modes determine market-cycle length and action capacity, not cash/sec.
   Actions refill gradually during active play to avoid long-mode lockout. */
(function(){
'use strict';
const intervals=Object.freeze({fast:90,standard:120,long:180,persistent:300});
function interval(mode){return intervals[mode]||intervals.standard}
function valid(state,mode){return !!state&&Number.isFinite(Number(state.actions))&&Number.isFinite(Number(mode?.actions))}
function tick(now=Date.now()){
  if(!state.started||!document.getElementById('gameScreen')?.classList.contains('active')||document.visibilityState==='hidden'){
    state.actionRegenAt=now;return 0;
  }
  const m=MODES[state.mode],limit=Number(m?.actions)||6;
  if(state.actions>=limit){state.actionRegenAt=now;return 0}
  if(!Number.isFinite(state.actionRegenAt)||state.actionRegenAt<=0||state.actionRegenAt>now){state.actionRegenAt=now;return 0}
  const diff=now-state.actionRegenAt,required=interval(state.mode)*1000;
  if(diff<required)return 0;
  // At most one action per visible tick; background catch-up cannot be farmed.
  state.actions=Math.min(limit,state.actions+1);
  state.actionRegenAt=now;
  const el=document.getElementById('actionsLeft');if(el)el.textContent=state.actions;
  const status=document.getElementById('actionRegenStatus');if(status)status.textContent='A management action has regenerated.';
  return 1;
}
function status(){
  const label=document.getElementById('actionRegenStatus');if(!label)return;
  const m=MODES[state.mode],limit=m?.actions||6,period=interval(state.mode);
  label.textContent=state.actions>=limit?'Actions full · max '+limit:'Regenerates +1 action every '+period+'s of active play';
}
function reset(){state.actionRegenAt=Date.now();status()}
function evaluateMode(mode,profitPerMinute,minutes=30){
  const marketCycles=Math.floor(minutes*60/(MODES[mode]?.daySeconds||900));
  const actions=MODES[mode]?.actions||6;
  return{mode,marketCycles,baseIncome:profitPerMinute*minutes,regenSeconds:interval(mode),startingActions:actions,maxActions:actions,estimatedReplenishments:Math.floor(minutes*60/interval(mode))};
}
window.ProfitLandsBalance={interval,tick,status,reset,evaluateMode,intervals};
})();