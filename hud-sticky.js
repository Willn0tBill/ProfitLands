/* Lightweight, read-only status bar. Does not alter saved gameplay or scrolling. */
(() => {
  'use strict';
  const screen = document.getElementById('gameScreen');
  const hud = screen?.querySelector('.game-hud');
  const bar = document.getElementById('floatingHud');
  if (!screen || !hud || !bar) return;
  const el = id => document.getElementById(id);
  const numbers = [
    ['floatDay','gameDay'],
    ['floatTimer','timer'],
    ['floatCash','cash'],
    ['floatActions','actionsLeft']
  ];
  let queued = false;
  function refresh() {
    queued = false;
    const active = screen.classList.contains('active');
    if (!active) {bar.hidden = true;return;}
    const bottom = hud.getBoundingClientRect().bottom;
    const shouldShow = bottom <= 12 && window.scrollY > 60;
    if (shouldShow) for (const [target,source] of numbers) {
      const out=el(target),input=el(source);
      if (out && input && out.textContent !== input.textContent) out.textContent=input.textContent;
    }
    bar.hidden = !shouldShow;
  }
  function requestRefresh(){
    if(queued) return;
    queued=true;
    window.requestAnimationFrame(refresh);
  }
  bar.querySelector('#floatingBackTop')?.addEventListener('click', () => {
    hud.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  });
  window.addEventListener('scroll',requestRefresh,{passive:true});
  window.addEventListener('resize',requestRefresh,{passive:true});
  new MutationObserver(requestRefresh).observe(screen,{attributes:true,attributeFilter:['class']});
  // Update the clock only while the mini bar is visible, without modifying the game timer.
  const timer = el('timer');
  if (timer) new MutationObserver(() => {if(!bar.hidden)requestRefresh()}).observe(timer,{childList:true,characterData:true,subtree:true});
  requestRefresh();
})();
