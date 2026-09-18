/* ProfitLands performance-aware motion layer.
   Rich motion is enabled on capable devices and automatically reduced on weaker devices. */
(function(){
  const cores=navigator.hardwareConcurrency||4;
  const memory=navigator.deviceMemory||4;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const capable=!reduced && (cores>=8 || memory>=8);
  document.documentElement.classList.toggle('high-performance',capable);
  document.documentElement.classList.toggle('reduced-motion',!!reduced);
  window.ProfitLandsMotion={enabled:capable&&!reduced};

  if(!capable||reduced)return;

  const selectors='.hero,.stat,.panel,.business-card,.stock,.action-button,.news-item,.event-banner,.major-card,.economy-stats>div,.economy-tier';
  let observer;
  const seen=new WeakSet();
  const observe=()=>{
    if(!observer){
      observer=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(!entry.isIntersecting||seen.has(entry.target))return;
          seen.add(entry.target);
          entry.target.classList.add('motion-in');
          entry.target.style.setProperty('--motion-delay',Math.min(180,(entry.target.dataset.motionIndex||0)*35)+'ms');
        });
      },{threshold:.08});
    }
    document.querySelectorAll(selectors).forEach((el,i)=>{
      if(!seen.has(el)){el.dataset.motionIndex=i%6;observer.observe(el)}
    });
  };
  const schedule=()=>requestAnimationFrame(observe);
  window.addEventListener('load',schedule,{once:true});
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(!button||button.disabled)return;
    button.classList.remove('motion-press');
    void button.offsetWidth;
    button.classList.add('motion-press');
  });
})();