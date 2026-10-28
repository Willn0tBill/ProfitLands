/* ProfitLands large-number ledger v1
   Cash is stored canonically in state.cashHuge ("1.234e1000").
   state.cash remains a finite numeric compatibility mirror for legacy modules.
   No third-party runtime dependency. This is a 14-significant-digit idle-game
   representation, not a precise general-purpose accounting library. */
(function(){
'use strict';
const MAX_EXP=1000000000,MAX_MIRROR=1e290;
const fail=()=>{throw new RangeError('Invalid large monetary value')};
function parse(input){
  if(input&&typeof input==='object'&&Number.isFinite(input.m)&&Number.isFinite(input.e))return norm(input.m,input.e);
  if(typeof input==='number'){
    if(!Number.isFinite(input))return fail();
    if(input===0)return{m:0,e:0};
    const e=Math.floor(Math.log10(Math.abs(input)));
    return norm(input/10**e,e);
  }
  const s=String(input??'0').trim();
  const m=s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e([+-]?\d+))?$/i);
  if(!m)return fail();
  let digits=m[1],sign=digits.startsWith('-')?-1:1;digits=digits.replace(/^[+-]/,'');
  const dot=digits.indexOf('.'),left=dot<0?digits.length:dot;
  const all=digits.replace('.',''),first=all.search(/[1-9]/);
  if(first<0)return{m:0,e:0};
  const exponent=Number(m[2]||0)+left-first-1;
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>MAX_EXP)return fail();
  return norm(sign*Number(all.slice(first,first+15)[0]+'.'+all.slice(first+1,first+15)),exponent);
}
function norm(m,e){
  if(!Number.isFinite(m)||!Number.isSafeInteger(e)||Math.abs(e)>MAX_EXP)return fail();
  if(!m)return{m:0,e:0};
  let delta=Math.floor(Math.log10(Math.abs(m)));
  m/=10**delta;e+=delta;
  if(Math.abs(m)>=10){m/=10;e++}
  if(Math.abs(m)<1){m*=10;e--}
  if(Math.abs(e)>MAX_EXP)return fail();
  m=Number(m.toPrecision(14));
  if(Math.abs(m)>=10){m/=10;e++}
  return{m,e};
}
function cmp(a,b){
 a=parse(a);b=parse(b);
 if(a.m===0&&b.m===0)return 0;
 const as=Math.sign(a.m),bs=Math.sign(b.m);
 if(as!==bs)return as>bs?1:-1;
 if(a.e!==b.e)return a.e>b.e?as:-as;
 return a.m===b.m?0:a.m>b.m?1:-1;
}
function add(a,b){
 a=parse(a);b=parse(b);
 if(!a.m)return b;if(!b.m)return a;
 if(a.e<b.e){const t=a;a=b;b=t}
 const diff=a.e-b.e;
 if(diff>18)return a;
 return norm(a.m+b.m*10**(-diff),a.e);
}
function neg(a){a=parse(a);return{m:-a.m,e:a.e}}
function sub(a,b){return add(a,neg(b))}
function mul(a,b){a=parse(a);b=parse(b);if(!a.m||!b.m)return{m:0,e:0};return norm(a.m*b.m,a.e+b.e)}
function div(a,b){a=parse(a);b=parse(b);if(!b.m)return fail();return norm(a.m/b.m,a.e-b.e)}
function number(a){a=parse(a);if(!a.m)return 0;if(a.e>290)return Math.sign(a.m)*MAX_MIRROR;if(a.e< -290)return 0;return a.m*10**a.e}
function raw(a){a=parse(a);return a.m===0?'0':a.m.toString()+'e'+a.e}
function format(input){
 const v=parse(input),negative=v.m<0?'-':'',n=Math.abs(v.m);
 if(v.m===0)return '$0';
 if(v.e<6&&v.e>=0)return negative+'$'+Math.round(number({m:n,e:v.e})).toLocaleString('en-US');
 const names={6:'M',9:'B',12:'T',15:'Qa',18:'Qi',21:'Sx',24:'Sp',27:'Oc',30:'No',33:'Dc'};
 const group=Math.floor(v.e/3)*3,decimal=n*10**(v.e-group);
 if(names[group])return negative+'$'+decimal.toFixed(2)+names[group];
 return negative+'$'+n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+'e'+v.e;
}
let stateRef=null;
function attach(state){
 if(!state||typeof state!=='object')return;
 stateRef=state;
 let current;
 try{current=parse(state.cashHuge??state.cash??0)}catch(e){current=parse(Number.isFinite(state.cash)?state.cash:0)}
 state.cashHuge=raw(current);
 state.cash=number(current);
 return current;
}
function ensure(){
 if(!stateRef&&window.state)attach(window.state);
 if(!stateRef)return null;
 try{const v=parse(stateRef.cashHuge??stateRef.cash??0);stateRef.cash=number(v);return v}
 catch(e){return attach(stateRef)}
}
function set(value){
 if(!stateRef&&window.state)attach(window.state);
 if(!stateRef)return fail();
 const val=parse(value);stateRef.cashHuge=raw(val);stateRef.cash=number(val);return val;
}
function balance(){return ensure()||parse(0)}
function canAfford(amount){return cmp(balance(),amount)>=0}
function gain(amount){return set(add(balance(),amount))}
function spend(amount){
 if(cmp(amount,0)<0||!canAfford(amount))return false;
 set(sub(balance(),amount));return true;
}
function netWorth(extra=0){return add(balance(),extra)}
function transfer(n){return raw(parse(n))}
const API=Object.freeze({parse,cmp,add,sub,mul,div,number,raw,format,attach,ensure,balance,set,canAfford,gain,spend,netWorth,transfer,MAX_EXP});
window.ProfitLandsMoney=API;
})();