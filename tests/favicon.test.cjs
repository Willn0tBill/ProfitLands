'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pages=['index.html','play/index.html','preview/index.html','settings/index.html'];

test('ProfitLands provides a branded standalone vector favicon',()=>{
 const icon=fs.readFileSync(path.join(root,'favicon.svg'),'utf8');
 assert.match(icon,/^<svg\b/);
 assert.match(icon,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
 assert.match(icon,/viewBox="0 0 64 64"/);
 assert.match(icon,/<title id="title">ProfitLands<\/title>/);
 assert.match(icon,/#b8ff65/i);
 assert.match(icon,/#55d69a/i);
 assert.match(icon,/>\$<\/text>/);
 assert.doesNotMatch(icon,/<script|onload=|https?:\/\/[^"]+\.(?:png|svg|jpg)/i);
});

for(const filename of pages){
 test(filename+' resolves its favicon without referencing the wrong directory',()=>{
  const markup=fs.readFileSync(path.join(root,filename),'utf8');
  const expected=filename==='index.html'?'favicon.svg':'../favicon.svg';
  const match=markup.match(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="([^"]+)">/);
  assert.ok(match,'favicon link tag must be declared in the document head');
  assert.equal(match[1].split('?')[0],expected);
  assert.equal(fs.realpathSync(path.join(root,path.dirname(filename),match[1].split('?')[0])),path.join(root,'favicon.svg'));
  assert.equal((markup.match(/rel="icon"/g)||[]).length,1,'do not add competing favicon tags');
  assert.ok(markup.indexOf(match[0])<markup.indexOf('</head>'));
 });
}
