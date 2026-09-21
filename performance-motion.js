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
  let rafPending=false;
  const seen=new WeakSet();

  const ensureObserver=()=>{
    if(observer)return;
    observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting||seen.has(entry.target))return;
        seen.add(entry.target);
        observer.unobserve(entry.target);
        entry.target.classList.add('motion-in');
        entry.target.style.setProperty('--motion-delay',Math.min(180,(entry.target.dataset.motionIndex||0)*35)+'ms');
      });
    },{threshold:.08});
  };

  const observeRoot=root=>{
    ensureObserver();
    const nodes=[];
    if(root instanceof Element && root.matches(selectors))nodes.push(root);
    if(root?.querySelectorAll)nodes.push(...root.querySelectorAll(selectors));
    nodes.forEach((el,i)=>{
      if(seen.has(el))return;
      el.dataset.motionIndex=i%6;
      observer.observe(el);
    });
  };

  const pendingRoots=new Set();
  const schedule=root=>{
    if(root)pendingRoots.add(root);
    if(rafPending)return;
    rafPending=true;
    requestAnimationFrame(()=>{
      rafPending=false;
      if(!pendingRoots.size)observeRoot(document);
      else{
        pendingRoots.forEach(observeRoot);
        pendingRoots.clear();
      }
    });
  };

  window.addEventListener('load',()=>schedule(document),{once:true});
  new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType===1)schedule(node);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(!button||button.disabled)return;
    button.classList.remove('motion-press');
    requestAnimationFrame(()=>{
      button.classList.add('motion-press');
      setTimeout(()=>button.classList.remove('motion-press'),150);
    });
  });
})();