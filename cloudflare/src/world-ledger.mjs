/* Transparent, backward-compatible D1 ledger compression.
 * Small legacy worlds remain plain JSON. Larger worlds use gzip+Base64 text.
 * D1 caps individual TEXT/BLOB values at 2 MB. Reserve headroom for overhead.
 */
const PREFIX='gz1:';
const COMPRESS_AT=250000;
const MAX_ROW_BYTES=1800000;
const MAX_JSON_BYTES=12000000;
const encoder=new TextEncoder();
const decoder=new TextDecoder();
function fromBase64(text){
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||text.length%4!==0)throw Error('invalid_ledger_encoding');
 const raw=atob(text),buffer=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)buffer[i]=raw.charCodeAt(i);
 return buffer;
}
function toBase64(bytes){
 const parts=[];
 for(let i=0;i<bytes.length;i+=16384)
  parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
 return btoa(parts.join(''));
}
async function gzip(data,mode){
 const stream=new Blob([data]).stream().pipeThrough(
  mode==='encode'?new CompressionStream('gzip'):new DecompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encodeLedger(state){
 const json=JSON.stringify(state);
 const data=encoder.encode(json);
 if(data.byteLength>MAX_JSON_BYTES)throw Error('world_ledger_overflow');
 if(data.byteLength<=COMPRESS_AT)return {payload:json,bytes:data.byteLength,compressed:false};
 const compressed=await gzip(data,'encode');
 const payload=PREFIX+toBase64(compressed);
 if(payload.length>MAX_ROW_BYTES)throw Error('world_ledger_overflow');
 return {payload,bytes:payload.length,compressed:true};
}
async function decodeLedger(payload){
 if(typeof payload!=='string')throw Error('invalid_world_ledger');
 let json=payload;
 if(payload.startsWith(PREFIX)){
  try{
   const input=fromBase64(payload.slice(PREFIX.length));
   const uncompressed=await gzip(input,'decode');
   if(uncompressed.byteLength>MAX_JSON_BYTES)throw Error('world_ledger_overflow');
   json=decoder.decode(uncompressed);
  }catch(e){
   if(e?.message==='world_ledger_overflow')throw e;
   throw Error('invalid_world_ledger');
  }
 }else if(encoder.encode(payload).byteLength>MAX_JSON_BYTES)
  throw Error('world_ledger_overflow');
 return JSON.parse(json);
}
export {encodeLedger,decodeLedger,COMPRESS_AT,MAX_ROW_BYTES,MAX_JSON_BYTES};
