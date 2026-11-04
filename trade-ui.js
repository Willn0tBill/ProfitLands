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
    const h=state.stocks?.[id]||{shares:0};
    // Cash and the stock price can change while this dialog is open.
    // Query the canonical large-money ledger, not only its numeric mirror.
    const getMaxBuy=()=>{
      if(!Number.isFinite(s.price)||s.price<=0)return 0;
      const ledger=window.ProfitLandsMoney;
      if(ledger?.canAfford){
        if(ledger.canAfford(999999*s.price))return 999999;
        let lo=0,hi=999999;
        while(lo<hi){
          const mid=Math.floor((lo+hi+1)/2);
          if(ledger.canAfford(mid*s.price))lo=mid;
          else hi=mid-1;
        }
        return lo;
      }
      return Math.max(0,Math.min(999999,Math.floor((Number(state.cash)||0)/s.price)));
    };
    let maxBuy=getMaxBuy();
    const content=document.getElementById('tradeContent');
    content.innerHTML=`<div class="trade-head"><div><h2>${s.name}</h2><p class="modal-sub">${s.ticker} · ${s.sector} · ${s.risk} risk</p></div><strong class="trade-price">${money(s.price)}</strong></div><div class="trade-tabs"><button type="button" class="trade-tab active" data-side="buy">Buy</button><button type="button" class="trade-tab" data-side="sell">Sell</button></div><div class="trade-position"><span>Owned</span><b>${h.shares} share${h.shares===1?'':'s'}</b></div><label class="trade-label" for="tradeQty">Shares</label><div class="quantity-row"><button type="button" class="qty-button" id="qtyMinus">−</button><input id="tradeQty" type="number" min="1" max="${Math.max(1,maxBuy,h.shares)}" value="1" inputmode="numeric"><button type="button" class="qty-button" id="qtyPlus">+</button></div><div class="trade-total"><span>Total</span><b id="tradeTotal">${money(s.price)}</b></div><div class="trade-limit" id="tradeLimit">You can buy up to ${maxBuy} share${maxBuy===1?'':'s'} with your current cash.</div><button type="button" class="primary-button trade-submit" id="tradeSubmit">Buy ${s.ticker}</button>`;
    const modal=document.getElementById('tradeModal');
    let side='buy';
    const qtyInput=document.getElementById('tradeQty');
    const total=document.getElementById('tradeTotal');
    const limit=document.getElementById('tradeLimit');
    const submit=document.getElementById('tradeSubmit');
    function refresh(){
      maxBuy=getMaxBuy();
      const max=side==='buy'?maxBuy:h.shares;
      qtyInput.max=Math.max(1,max);
      let q=Math.floor(Number(qtyInput.value));if(!Number.isFinite(q)||q<1)q=1;if(max===0&&side==='sell')q=1;q=Math.min(q,Math.max(1,max));qtyInput.value=q;
      total.textContent=money(q*s.price);
      if(side==='buy'){limit.textContent=state.actions<=0?'No actions remaining for a trade.':maxBuy?`You can buy up to ${maxBuy} share${maxBuy===1?'':'s'} with your current cash.`:'You do not have enough cash to buy a share.';submit.textContent=`Buy ${s.ticker}`;submit.disabled=state.actions<=0||maxBuy<1||q>maxBuy}else{limit.textContent=state.actions<=0?'No actions remaining for a trade.':h.shares?`You can sell up to ${h.shares} share${h.shares===1?'':'s'}.`:'You do not own this stock.';submit.textContent=`Sell ${s.ticker}`;submit.disabled=state.actions<=0||h.shares<1||q>h.shares}
    }
    document.querySelectorAll('.trade-tab').forEach(btn=>btn.onclick=()=>{side=btn.dataset.side;document.querySelectorAll('.trade-tab').forEach(x=>x.classList.toggle('active',x===btn));refresh()});
    document.getElementById('qtyMinus').onclick=()=>{qtyInput.value=Math.max(1,(Number(qtyInput.value)||1)-1);refresh()};
    document.getElementById('qtyPlus').onclick=()=>{qtyInput.value=(Number(qtyInput.value)||1)+1;refresh()};
    qtyInput.oninput=refresh;
    submit.onclick=()=>{
      const q=Number(qtyInput.value);
      if(!Number.isSafeInteger(q)||q<1||q>999999){refresh();toast('Choose a valid share quantity.');return}
      if(state.actions<=0){refresh();toast('No actions left.');return}
      const available=side==='buy'?getMaxBuy():h.shares;
      if(q>available){refresh();toast('Your available cash or shares changed. Review the updated order.');return}
      // A market cycle may have changed the price while the modal was open.
      // Never silently execute a different quantity or total than was quoted.
      if(total.textContent!==money(q*s.price)){
        refresh();toast('The stock price changed. Review the new order total.');return;
      }
      refresh();
      if(side==='buy'){
        const cost=q*s.price;if(q>maxBuy||(window.ProfitLandsMoney?!window.ProfitLandsMoney.spend(cost):state.cash<cost)){toast('Not enough cash for that trade.');return}
        if(!window.ProfitLandsMoney)state.cash-=cost;(state.stocks[id]||(state.stocks[id]={shares:0})).shares+=q;state.actions--;state.news.push(`You bought ${q} share${q===1?'':'s'} of ${s.ticker}.`);toast(`Bought ${q} ${s.ticker} share${q===1?'':'s'}.`);
      }else{
        if(q>h.shares){toast('You do not own that many shares.');return}
        (window.ProfitLandsMoney?window.ProfitLandsMoney.gain(q*s.price):state.cash+=q*s.price);state.stocks[id].shares-=q;state.actions--;state.news.push(`You sold ${q} share${q===1?'':'s'} of ${s.ticker}.`);toast(`Sold ${q} ${s.ticker} share${q===1?'':'s'}.`);
      }
      save();render();modal.classList.add('hidden');
    };
    modal.classList.remove('hidden');refresh();qtyInput.focus();
  }
  window.trade=openTrade;
})();
