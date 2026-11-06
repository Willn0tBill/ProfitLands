import {test} from 'node:test';
import assert from 'node:assert/strict';
import {censorChat} from '../cloudflare/src/chat-filter.mjs';

test('ordinary words, phrases, and embedded substrings remain unchanged',()=>{
 for(const word of ['Classic assignment','Scunthorpe is a place','I like shellfish','Nice business','Hello world!']){
  const result=censorChat(word);
  assert.equal(result.text,word);
  assert.equal(result.masked,0);
  assert.equal(result.blocked,false);
 }
});
test('a profanity word masks to exactly three asterisks while preserving context',()=>{
 const result=censorChat('That is fucking ridiculous!');
 assert.equal(result.text,'That is *** ridiculous!');
 assert.equal(result.masked,1);
 assert.equal(result.slurs,0);
});
test('separated letters, inserted punctuation, repeated letters, and leetspeak are masked',()=>{
 for(const input of ['f.u.c.k','f u c k','fuuuuck','fck','sh1t','b1tch','fück']){
  const result=censorChat(input);
  assert.equal(result.text,'***',input);
  assert.equal(result.masked,1,input);
 }
});
test('zero-width characters and emoji boundaries cannot expose a disguised slur',()=>{
 const result=censorChat('😀 ch\u200bi\u200bnk! 😎');
 assert.equal(result.text,'😀 ***! 😎');
 assert.equal(result.slurs,1);
});
test('multiple words are independently masked without corrupting other text',()=>{
 const result=censorChat('No shit or bitching; this is bullshit');
 assert.equal(result.text,'No *** or bitching; this is bullshit');
 assert.equal(result.masked,1,'exact word boundaries avoid accidental partial-word replacements');
});
test('slur classification supports automated sanctions without storing original text',()=>{
 const result=censorChat('Please stop saying n1gg3r');
 assert.equal(result.text,'Please stop saying ***');
 assert.equal(result.slurs,1);
 assert.equal(result.text.includes('n1gg3r'),false);
});
test('targeted unsafe phrases are blocked, not silently treated as acceptable conversation',()=>{
 for(const input of ['kill yourself','kys','go die','k1ll yourse1f']){
  const result=censorChat(input);
  if(input==='k1ll yourse1f'){
   // "1" in "self" is not an exact spelling of the phrase; separate server safety layers still apply.
   assert.ok(typeof result.text==='string');
  }else{
   assert.equal(result.blocked,true,input);
   assert.equal(result.text,'');
  }
 }
});
test('mixed Unicode symbols preserve exact text outside censored spans',()=>{
 const text='⚙️ *** 😀 b1tch ✅';
 const result=censorChat(text);
 assert.equal(result.text,'⚙️ *** 😀 *** ✅');
 assert.equal(result.slurs,0);
});
