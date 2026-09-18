/* ProfitLands compact panel controls */
(function(){
  function setPanel(panel,open){
    panel.classList.toggle('open',open);
    const btn=panel.querySelector('.panel-toggle');
    if(btn)btn.setAttribute('aria-expanded',String(open));
  }
  document.querySelectorAll('.collapsible-panel').forEach(panel=>{
    const btn=panel.querySelector('.panel-toggle');
    if(!btn)return;
    btn.addEventListener('click',()=>setPanel(panel,!panel.classList.contains('open')));
    btn.addEventListener('keydown',e=>{
      if(e.key==='Escape')setPanel(panel,false);
    });
  });
})();