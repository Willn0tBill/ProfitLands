'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'game-experience.js'),'utf8');
test('game feedback is cosmetic and honors reduced-motion settings',()=>{
 const events={};const classes=new Set(['pl-reduced-motion']);
 const document={
  readyState:'loading',hidden:false,
  documentElement:{classList:{contains:x=>classes.has(x)}},
  addEventListener:(name,fn)=>{events[name]=fn}
 };
 const window={matchMedia:()=>({matches:false}),innerWidth:1200,innerHeight:800};
 vm.runInNewContext(source,{document,window,navigator:{deviceMemory:8},console});
 const fx=window.ProfitLandsGameFX;
 assert.equal(fx.isReducedMotion(),true);
 assert.equal(fx.celebrate('Nice move!'),false);
 classes.delete('pl-reduced-motion');
 assert.equal(fx.isReducedMotion(),false);
 assert.equal(typeof events.DOMContentLoaded,'function');
 assert.doesNotMatch(source,/localStorage\.setItem|state\.cash\s*[+\-*/]?=/);
});
test('play page loads visual feedback and respects the reduced-motion preference',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'game-experience.css'),'utf8');
 assert.match(html,/game-experience\.css/);
 assert.match(html,/game-experience\.js/);
 assert.match(css,/pl-reduced-motion/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/pl-game-steps/);
 assert.match(css,/pl-game-burst/);
});
