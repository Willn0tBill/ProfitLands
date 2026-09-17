/* ProfitLands mobile viewport fixes */
(function(){
  function scrollPageTop(){
    window.requestAnimationFrame(function(){
      window.scrollTo({top:0,left:0,behavior:'instant'});
    });
  }

  function resetModalScroll(modal){
    const card=modal?.querySelector('.modal-card');
    if(card)card.scrollTop=0;
    if(modal)modal.scrollTop=0;
  }

  document.addEventListener('click',function(event){
    const target=event.target;
    if(!(target instanceof Element))return;

    if(target.closest('#startGame') || target.closest('#backHome')){
      setTimeout(scrollPageTop,0);
    }

    const modal=target.closest('.modal');
    if(modal && target===modal)resetModalScroll(modal);
  });

  const observer=new MutationObserver(function(records){
    for(const record of records){
      if(record.type!=='attributes' || record.attributeName!=='class')continue;
      const el=record.target;
      if(el.id==='gameScreen' && el.classList.contains('active'))scrollPageTop();
      if(el.classList.contains('modal') && !el.classList.contains('hidden'))resetModalScroll(el);
    }
  });

  function observe(){
    document.querySelectorAll('.screen,.modal').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
})();
