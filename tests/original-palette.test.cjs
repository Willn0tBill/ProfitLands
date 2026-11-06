'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('home launcher restores original charcoal and lime palette, without the tan redesign',()=>{
 const home=read('home-hub.css'),html=read('index.html');
 assert.match(home,/body\.pl-home-page\{background:#0b0e13;color:#f5f7fb\}/);
 assert.match(home,/#aef45f/);
 assert.match(home,/#b8ff65/);
 assert.match(html,/home-hub\.css\?v=original02/);
 assert.match(html,/<meta name="theme-color" content="#0b0e13">/);
 for(const color of ['#e2d0a9','#dfcca6','#e5d0a2','#e3d0a8','#e5d1ab']){
  assert.ok(!home.includes(color),'former tan homepage fill '+color+' must not return');
 }
});

test('gameplay does not load the forced sandstone theme and keeps original arcade colors',()=>{
 const html=read('play/index.html'),game=read('game-experience.css');
 assert.doesNotMatch(html,/district-theme\.css/);
 assert.equal(fs.existsSync(path.join(root,'district-theme.css')),false);
 assert.match(game,/--pl-game-gold:#ffd96a/);
 assert.match(game,/--pl-game-purple:#b29aff/);
 assert.match(game,/--pl-game-lime:#b6f474/);
 assert.match(html,/focus-game\.css\?v=original01/);
 assert.match(html,/city-contracts\.css\?v=original01/);
 assert.match(html,/district-development\.css\?v=original01/);
});

test('new fullscreen and quest UI match arcade palette without losing their gameplay rules',()=>{
 const focus=read('focus-game.css'),contracts=read('city-contracts.css'),district=read('district-development.css');
 for(const css of [focus,contracts,district]){
  assert.match(css,/#ffd96a/);
  assert.match(css,/#1b2140/);
 }
 assert.doesNotMatch(focus,/#e5d3ac|#e4d0a7|#20353d/);
 assert.doesNotMatch(contracts,/#e0d3b2|#e8d49f|#23383b/);
 assert.match(district,/pl-district-landmarks/);
 assert.match(contracts,/pl-contract-claim/);
 assert.match(focus,/pl-focus-menu-open/);
});

test('settings, homepage and game all load fresh original-color stylesheets',()=>{
 const home=read('index.html');
 const settings=read('settings/index.html');
 const play=read('play/index.html');
 const preview=read('preview/index.html');
 const site=read('site-pages.css');
 assert.match(home,/site-pages\.css\?v=original02/);
 assert.match(settings,/class="pl-settings-page"/);
 assert.match(settings,/<meta name="theme-color" content="#0b0e13">/);
 assert.match(settings,/site-pages\.css\?v=original02/);
 assert.match(play,/site-pages\.css\?v=original02/);
 assert.match(preview,/site-pages\.css\?v=original02/);
 assert.match(site,/body\.pl-settings-page/);
 assert.match(site,/background:#0b0e13/);
 assert.match(site,/--pl-accent:#aef45f/);
 assert.match(site,/\.pl-pref:focus-within/);
 assert.match(play,/multiplayer-world\.css\?v=worldqol01/);
 assert.match(read('multiplayer-world.css'),/\.pl-online-status\{color:#e2edff/);
 assert.doesNotMatch(read('multiplayer-world.css'),/\.pl-online-status\{color:#e4d3b4/);
});
test('refreshed homepage keeps original lime while preserving save and sign-in actions',()=>{
 const css=read('home-hub.css');
 const html=read('index.html');
 assert.match(css,/body\.pl-home-page \.home-command-hero/);
 assert.match(css,/body\.pl-home-page \.home-launch-card/);
 assert.match(css,/background:#aef45f/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 for(const id of ['homeContinue','homeNew','homeHeaderAccount']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});
