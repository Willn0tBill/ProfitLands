/* ProfitLands top stat explanations */
(function(){
  const stats=[...document.querySelectorAll('.stat-dropdown')];
  if(!stats.length)return;

  function setOpen(card,open){
    card.classList.toggle('open',open);
    card.setAttribute('aria-expanded',String(open));
  }

  stats.forEach(card=>{
    const toggle=()=>setOpen(card,!card.classList.contains('open'));
    card.addEventListener('click',toggle);
    card.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        toggle();
      }
      if(e.key==='Escape')setOpen(card,false);
    });
  });

  document.addEventListener('click',e=>{
    if(!e.target.closest('.stat-dropdown'))stats.forEach(card=>setOpen(card,false));
  });
})();