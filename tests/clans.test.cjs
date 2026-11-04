'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'clans.js'),'utf8');
function harness(){
 const listeners={};
 const document={getElementById:()=>null};
 const window={addEventListener:(name,fn)=>{listeners[name]=fn}};
 vm.runInNewContext(script,{window,document,console});
 return{api:window.ProfitLandsClans,listeners};
}
test('Clans validates names, tags and public document IDs',()=>{
 const h=harness();
 assert.equal(h.api.validate.name('Profit Guild'),true);
 assert.equal(h.api.validate.name('A'),false);
 assert.equal(h.api.validate.name('<img src=x>'),false);
 assert.equal(h.api.validate.tag('GUILD'),true);
 assert.equal(h.api.validate.tag('EXTRA-LONG'),false);
 assert.equal(h.api.validate.tag('ab'),false);
 assert.equal(h.api.validate.id('abcdefghijklmnopqrst'),true);
 assert.equal(h.api.validate.id('../secret'),false);
});
test('Clans code uses server-validated Firebase transactions, never fake local rosters',()=>{
 assert.match(script,/db\.runTransaction/);
 assert.match(script,/FieldValue\.serverTimestamp/);
 assert.match(script,/\.collection\('clanMembership'\)\.doc\('current'\)/);
 assert.match(script,/\.collection\('members'\)\.doc\(user\.uid\)/);
 assert.doesNotMatch(script,/localStorage\.setItem/);
 assert.doesNotMatch(script,/Math\.random/);
});
test('Clans integrates into existing game, not a duplicate global dashboard',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 assert.match(html,/id="clanPanel"/);
 assert.match(html,/id="clanContent"/);
 assert.match(html,/clans\.css/);
 assert.match(html,/clans\.js/);
 assert.ok(html.indexOf('clans.js')>html.indexOf('workspace.js'));
 assert.match(workspace,/id:'clans'/);
});
test('Firestore rules preserve personal save ownership and require authenticated clan membership',()=>{
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
 assert.match(rules,/match \/saves\/\{saveId\}/);
 assert.match(rules,/allow read, write, delete: if isOwner\(userId\)/);
 assert.match(rules,/match \/clanMembership\/\{membershipId\}/);
 assert.match(rules,/existsAfter\(clanMember/);
 assert.match(rules,/getAfter\(memberIndex/);
 assert.match(rules,/allow update: if false/);
 assert.match(rules,/allow read: if signedIn\(\)/);
});
