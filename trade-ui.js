/* ProfitLands stock trading UI */
(function(){
  function ensureModal(){
    if(document.getElementById('tradeModal'))return;
    const modal=document.createElement('div');
    modal.id='tradeModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modal-card trade-card"><button class="modal-close" id="tradeClose">×</button><span class="eyebrow">STOCK MARKET</span><div id="tradeContent"></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('tradeClose').onclick=()=>modal.classList.add('hidden');
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
  }
  function openTrade(id){
    const s=STOCKS.find(x=>x.id===id);if(!s)return;
    ensureModal();
    const h=state.stocks[id]||{shares:0};
    const maxBuy=Math.max(0,Math.floor(state.cash/s.price));
    const content=document.getElementById('tradeContent');
    content.innerHTML=`<div class="trade-head"><div><h2>${s.name}</h2><p class="modal-sub">${s.ticker} · ${s.sector} · ${s.risk} risk</p></div><strong class="trade-price">${money(s.price)}</strong></div><div class="trade-tabs"><button type="button" class="trade-tab active" data-side="buy">Buy</button><button type="button" class="trade-tab" data-side="sell">Sell</button></div><div class="trade-position"><span>Owned</span><b>${h.shares} share${h.shares===1?'':'s'}</b></div><label class="trade-label" for="tradeQty">Shares</label><div class="quantity-row"><button type="button" class="qty-button" id="qtyMinus">−</button><input id="tradeQty" type="number" min="1" max="${Math.max(1,maxBuy,h.shares)}" value="1" inputmode="numeric"><button type="button" class="qty-button" id="qtyPlus">+</button></div><div class="trade-total"><span>Total</span><b id="tradeTotal">${money(s.price)}</b></div><div class="trade-limit" id="tradeLimit">You can buy up to ${maxBuy} share${maxBuy===1?'':'s'} with your current cash.</div><button type="button" class="primary-button trade-submit" id="tradeSubmit">Buy ${s.ticker}</button>`;
    const modal=document.getElementById('tradeModal');
    let side='buy';
    const qtyInput=document.getElementById('tradeQty');
    const total=document.getElementById('tradeTotal');
    const limit=document.getElementById('tradeLimit');
    const submit=document.getElementById('tradeSubmit');
    function refresh(){
      const max=side==='buy'?maxBuy:h.shares;
      qtyInput.max=Math.max(1,max);
      let q=Math.floor(Number(qtyInput.value));if(!Number.isFinite(q)||q<1)q=1;if(max===0&&side==='sell')q=1;q=Math.min(q,Math.max(1,max));qtyInput.value=q;
      total.textContent=money(q*s.price);
      if(side==='buy'){limit.textContent=maxBuy?`You can buy up to ${maxBuy} share${maxBuy===1?'':'s'} with your current cash.`:'You do not have enough cash to buy a share.';submit.textContent=`Buy ${s.ticker}`;submit.disabled=maxBuy<1||q>maxBuy}else{limit.textContent=h.shares?`You can sell up to ${h.shares} share${h.shares===1?'':'s'}.`:'You do not own this stock.';submit.textContent=`Sell ${s.ticker}`;submit.disabled=h.shares<1||q>h.shares}
    }
    document.querySelectorAll('.trade-tab').forEach(btn=>btn.onclick=()=>{side=btn.dataset.side;document.querySelectorAll('.trade-tab').forEach(x=>x.classList.toggle('active',x===btn));refresh()});
    document.getElementById('qtyMinus').onclick=()=>{qtyInput.value=Math.max(1,(Number(qtyInput.value)||1)-1);refresh()};
    document.getElementById('qtyPlus').onclick=()=>{qtyInput.value=(Number(qtyInput.value)||1)+1;refresh()};
    qtyInput.oninput=refresh;
    submit.onclick=()=>{
      const q=Math.floor(Number(qtyInput.value));
      if(!Number.isFinite(q)||q<1)return;
      if(state.actions<=0){toast('No actions left.');return}
      if(side==='buy'){
        const cost=q*s.price;if(q>maxBuy||state.cash<cost){toast('Not enough cash for that trade.');return}
        state.cash-=cost;state.stocks[id].shares+=q;state.actions--;state.news.push(`You bought ${q} share${q===1?'':'s'} of ${s.ticker}.`);toast(`Bought ${q} ${s.ticker} share${q===1?'':'s'}.`);
      }else{
        if(q>h.shares){toast('You do not own that many shares.');return}
        state.cash+=q*s.price;state.stocks[id].shares-=q;state.actions--;state.news.push(`You sold ${q} share${q===1?'':'s'} of ${s.ticker}.`);toast(`Sold ${q} ${s.ticker} share${q===1?'':'s'}.`);
      }
      save();render();modal.classList.add('hidden');
    };
    modal.classList.remove('hidden');refresh();qtyInput.focus();
  }
  window.trade=openTrade;
})();
