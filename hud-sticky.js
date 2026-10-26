/* Keep the live empire HUD visible without covering the entire phone screen.
   No game-state changes and no extra timers. */
(() => {
  'use strict';
  const screen = document.getElementById('gameScreen');
  const hud = screen?.querySelector('.game-hud');
  const stats = screen?.querySelector('#hudStats');
  const button = document.getElementById('hudStatsToggle');
  if (!screen || !hud || !stats || !button) return;

  const narrow = window.matchMedia('(max-width:600px)');
  let manualExpanded = null;
  let lastScrolled = false;
  let lastActive = screen.classList.contains('active');
  let framePending = false;

  function refresh() {
    framePending = false;
    const active = screen.classList.contains('active');
    if (!active) {
      screen.classList.remove('hud-scrolled', 'hud-collapsed');
      manualExpanded = null;
      lastScrolled = false;
      lastActive = false;
      return;
    }
    if (!lastActive) manualExpanded = null;
    lastActive = true;
    const start = screen.getBoundingClientRect().top + window.scrollY;
    const scrolled = window.scrollY > start + 70;
    if (lastScrolled && !scrolled) manualExpanded = null;
    lastScrolled = scrolled;
    screen.classList.toggle('hud-scrolled', scrolled);

    const collapsed = narrow.matches && (manualExpanded === null ? scrolled : !manualExpanded);
    screen.classList.toggle('hud-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? 'Show stats ▾' : 'Hide stats ▴';
    button.setAttribute('aria-label', collapsed ? 'Show empire statistics' : 'Hide empire statistics');
  }

  function schedule() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(refresh);
  }

  button.addEventListener('click', () => {
    manualExpanded = screen.classList.contains('hud-collapsed');
    schedule();
  });

  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  narrow.addEventListener?.('change', () => {manualExpanded=null;schedule()});

  const observer = new MutationObserver(() => {
    const active = screen.classList.contains('active');
    if (active !== lastActive) schedule();
  });
  observer.observe(screen, {attributes:true, attributeFilter:['class']});
  schedule();
})();
