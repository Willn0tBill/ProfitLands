'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'mobile-console.js'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile-console.css'),'utf8');
const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');

test('mobile dock is loaded after existing workspace and focus mode layers',()=>{
 assert.ok(html.indexOf('mobile-console.js')>html.indexOf('focus-game.js'));
 assert.ok(html.indexOf('mobile-console.css')>html.indexOf('focus-game.css'));
 assert.ok(html.includes('mobile-console.js')&&html.includes('mobile-console.css'));
});

test('mobile one-tap navigation preserves Overview, Businesses, Operations and Arcade',()=>{
 for(const id of ['overview','businesses','operations','arcade'])
  assert.match(script,new RegExp("id:'"+id+"'"));
 assert.match(script,/secondaryGroups/);
 for(const id of ['markets','analytics','finance','corporate','advances','trophies'])
  assert.ok(script.includes("'"+id+"'"),id+' is still accessible');
 assert.match(script,/primaryOnline/);
 assert.match(script,/id:'world'/);
 assert.match(script,/id:'clans'/);
 assert.match(script,/workspace\(\)\.show\(item\.id/);
});

test('mobile navigation does not alter save state or duplicate business workflows',()=>{
 assert.doesNotMatch(script,/localStorage|sessionStorage|profitlands-v2|cloudSave|requestAttack|cash\s*[+\-]?=/);
 assert.match(script,/if\(!canOpen\(item\.id\)\)return/);
 assert.match(script,/lastMode=modeKey\(\)/);
 assert.match(script,/dock\.dataset\.mode=lastMode/);
});

test('mobile menu is keyboard accessible and inert when game is inactive',()=>{
 for(const token of ['aria-label','aria-haspopup','aria-expanded','aria-modal','aria-current',
   "event.key==='Escape'","event.key!=='Tab'","document.body.classList.toggle('pl-mobile-console-playing',active)"])
  assert.ok(script.includes(token),token);
 assert.match(script,/if\(!active\)close\(false\)/);
 assert.match(script,/MutationObserver/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('mobile console supports safe area, touch targets, readable stats and responsive drawer',()=>{
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/max-width:760px/);
 assert.match(css,/max-width:430px/);
 assert.match(css,/max-width:350px/);
 assert.match(css,/max-height:500px/);
 assert.match(css,/pointer:coarse/);
 assert.match(script,/pointer: coarse/);
 assert.match(css,/min-height:49px/);
 assert.match(css,/min-height:53px/);
 assert.match(css,/font-size:max\(16px,1em\)!important/);
 assert.match(css,/stat:nth-child\(3\)/);
 assert.match(css,/pl-online-world \.pl-world-chat-dock/);
 assert.match(css,/z-index:490!important/);
 assert.match(css,/pl-mobile-drawer-overlay\[hidden\]/);
 assert.match(css,/:has\(\.modal:not\(\.hidden\)\)/);
});

test('stage-one More drawer focuses its skip action and completed players see no tutorial helper',()=>{
 assert.ok(script.includes("drawer.querySelector('.pl-mobile-skip-guide')"),'drawer keyboard focus does not escape behind overlay');
 assert.ok(script.includes("workspace()?.onboardingStage?.()<5"),'completed stages hide beginner-only helper');
 assert.ok(script.includes('grid.appendChild(intro)'), 'skip stays reachable at every unfinished guided stage');
});
