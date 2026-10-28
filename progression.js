/* ProfitLands endless empire milestones.
   A wealth milestone is a checkpoint, never a win condition or a save reset.
   Number-based JS economies can grow to finite Number.MAX_VALUE; after that,
   math needs a different numeric representation, not an artificial $1T cap. */
(function(){
  'use strict';
  const suffixes={6:'M',9:'B',12:'T',15:'Qa',18:'Qi',21:'Sx',24:'Sp',27:'Oc',30:'No',33:'Dc'};
  function format(value){
    const n=Number(value);
    if(Number.isNaN(n))return '$0';
    if(!Number.isFinite(n))return n<0?'Beyond numeric range':'Beyond numeric range';
    const neg=n<0?'-':'',a=Math.abs(n);
    if(a<1e6)return neg+'$'+Math.round(a).toLocaleString('en-US');
    const exp=Math.floor(Math.log10(a)/3)*3;
    if(suffixes[exp])return neg+'$'+(a/10**exp).toFixed(2)+suffixes[exp];
    return neg+'$'+a.toExponential(2).replace('e+','e');
  }
  function milestone(netWorth){
    const n=Math.max(0,Number(netWorth)||0);
    // Decade checkpoints continue beyond $1 trillion: $10T, $100T,
    // $1Qa and so on. The meter resets for each NEW milestone.
    const log=n>0?Math.log10(n):0;
    const exponent=Math.max(4,Math.floor(log+1e-12)+1);
    const previous=10**Math.max(3,exponent-1);
    const target=exponent<=308?10**exponent:null;
    const lower=exponent===4?1000:previous;
    let percent;
    if(target!==null&&Number.isFinite(target))percent=Math.max(0,Math.min(100,(n-lower)/(target-lower)*100));
    else percent=Math.max(0,Math.min(100,(log-(exponent-1))*100));
    return {
      current:n,previous:lower,target,
      targetLabel:target===null?'$1e'+exponent:format(target),
      currentLabel:format(n),percent,
      exponent,
      // No reached threshold marks the end of gameplay.
      endless:true
    };
  }
  function render(netWorth){
    const m=milestone(netWorth);
    const label=document.getElementById('goalStatus'),bar=document.getElementById('goalProgressFill');
    if(label)label.textContent='Next wealth milestone: '+m.targetLabel+' · '+m.percent.toFixed(1)+'% of current stage';
    if(bar)bar.style.width=m.percent.toFixed(2)+'%';
    const finance=document.getElementById('financeNextMilestone');
    if(finance)finance.textContent=m.targetLabel;
    return m;
  }
  window.ProfitLandsProgression={format,milestone,render};
})();