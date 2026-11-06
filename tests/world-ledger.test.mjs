import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeLedger,decodeLedger,COMPRESS_AT,MAX_ROW_BYTES} from '../cloudflare/src/world-ledger.mjs';

test('small legacy JSON ledgers stay readable without migration',async()=>{
 const state={players:{alice:{cash:1000,businesses:[]}},receipts:{}};
 const packed=await encodeLedger(state);
 assert.equal(packed.compressed,false);
 assert.equal(packed.payload,JSON.stringify(state));
 assert.deepEqual(await decodeLedger(packed.payload),state);
 assert.deepEqual(await decodeLedger(JSON.stringify(state)),state);
});
test('large D1 world ledgers use gzip, round-trip accurately, and preserve Unicode',async()=>{
 const state={players:{},receipts:{}};
 for(let i=0;i<1800;i++){
  state.players['player'+i]={
   uid:'p'+i,displayName:'Company 经营 '+i,cash:i*123,
   businesses:Array.from({length:3},(_,j)=>({type:'coffee',level:j+1,
    sites:Array.from({length:3},(_,k)=>({stock:(k+i)%5000,level:k+1,price:100}))}))
  };
 }
 const text=JSON.stringify(state);
 assert.ok(new TextEncoder().encode(text).byteLength>COMPRESS_AT);
 const packed=await encodeLedger(state);
 assert.equal(packed.compressed,true);
 assert.ok(packed.payload.startsWith('gz1:'));
 assert.ok(packed.bytes<MAX_ROW_BYTES);
 assert.deepEqual(await decodeLedger(packed.payload),state);
});
test('invalid compressed ledgers fail safely rather than returning partial data',async()=>{
 await assert.rejects(decodeLedger('gz1:nonsense'),/invalid_ledger_encoding|unexpected|incorrect|invalid/i);
 await assert.rejects(decodeLedger('gz1:'),/invalid|unexpected|incorrect/i);
 await assert.rejects(decodeLedger('not JSON'),/Unexpected token|JSON/i);
});
