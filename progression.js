/* ProfitLands rolling wealth milestones, compatible with arbitrary-exponent ledger. */
(function(){
  'use strict';
  const names={6:'M',9:'B',12:'T',15:'Qa',18:'Qi',21:'Sx',24:'Sp',27:'Oc',30:'No',33:'Dc'};
  function format(value){
    if(window.ProfitLandsMoney)return window.ProfitLandsMoney.format(value);
    const n=Number(value);
    if(!Number.isFinite(n))return '$0';
    const negative=n<0?'-':'',a=Math.abs(n);
    if(a<1e6)return negative+'$'+Math.round(a).toLocaleString('en-US');
    const exp=Math.floor(Math.log10(a)/3)*3;
    return negative+'$'+(names[exp]?(a/10**exp).toFixed(2)+names[exp]:a.toExponential(2).replace('e+','e'));
  }
  function milestone(netWorth){
    const big=window.ProfitLandsMoney;
    if(big){
      const current=big.parse(netWorth),positive=big.cmp(current,0)>0?current:big.parse(0);
      const exponent=Math.max(4,positive.e+1);
      const target=big.parse('1e'+exponent);
      const lower=big.parse('1e'+(exponent-1));
      let percent=positive.e<3?0:(positive.e<exponent-1?0:Math.max(0,Math.min(99.999999,(positive.m-1)/9*100)));
      if(positive.e>=exponent)percent=99.999;
      return {
        current:big.number(positive),currentRaw:big.raw(positive),
        previous:big.number(lower),target:big.number(target),targetRaw:big.raw(target),
        targetLabel:format(target),currentLabel:format(positive),
        percent,exponent,endless:true
      };
    }
    const n=Math.max(0,Number(netWorth)||0),log=n>0?Math.log10(n):0;
    const exponent=Math.max(4,Math.floor(log+1e-12)+1),lower=10**Math.max(3,exponent-1),target=10**exponent;
    return {current:n,previous:lower,target,targetLabel:format(target),currentLabel:format(n),
      percent:Number.isFinite(target)?Math.max(0,Math.min(99.999,(n-lower)/(target-lower)*100)):0,exponent,endless:true};
  }
  function render(value){
    const m=milestone(value),label=document.getElementById('goalStatus'),bar=document.getElementById('goalProgressFill');
    if(label)label.textContent='Next wealth milestone: '+m.targetLabel+' · '+m.percent.toFixed(1)+'% of current stage';
    if(bar)bar.style.width=m.percent.toFixed(2)+'%';
    const finance=document.getElementById('financeNextMilestone');
    if(finance)finance.textContent=m.targetLabel;
    return m;
  }
  window.ProfitLandsProgression={format,milestone,render};
})();