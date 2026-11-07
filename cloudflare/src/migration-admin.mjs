/* Temporary, operator-only V2 migration Worker.
 * Must never be used as the public game Worker or linked from client code.
 * Requires a signed-in owner account AND an independent secret, both configured
 * in Cloudflare (not committed). Disabled by default.
 */
import {verifyFirebase,migrateExistingRegion} from './index.mjs';
const regions=new Set(['world1','world-europe','world-asia']);
const reply=(data,status)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
function constantCompare(a,b){
 const x=String(a||''),y=String(b||'');
 let mismatch=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)
  mismatch|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);
 return mismatch===0;
}
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname!=='/migrate'||request.method!=='POST')
   return reply({error:'not_found'},404);
  if(env?.WORLD_MIGRATION_ENABLED!=='true'||
   env?.WORLD_MAINTENANCE_READONLY!=='true'||
   !env?.WORLD_MIGRATION_SECRET||!env?.WORLD_MIGRATION_ADMIN_UID)
   return reply({error:'migration_disabled'},503);
  const submitted=request.headers.get('X-Migration-Key')||'';
  if(!constantCompare(submitted,env.WORLD_MIGRATION_SECRET))
   return reply({error:'not_authorized'},403);
  const auth=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))
   return reply({error:'not_authorized'},403);
  let who;
  try{who=await verifyFirebase(auth.slice(7))}catch{return reply({error:'not_authorized'},403)}
  if(!constantCompare(who,env.WORLD_MIGRATION_ADMIN_UID))
   return reply({error:'not_authorized'},403);
  let body;
  try{
   const raw=await request.text();
   if(raw.length>512)return reply({error:'request_too_large'},400);
   body=JSON.parse(raw);
  }catch{return reply({error:'invalid_request'},400)}
  if(!regions.has(body?.worldId)||body?.confirm!=='backup-verified-writes-frozen')
   return reply({error:'migration_confirmation_required'},400);
  try{
   const result=await migrateExistingRegion(env.DB,body.worldId);
   return reply({ok:true,...result},200);
  }catch(e){
   const reason=String(e?.message||'');
   // Do not reveal account data, SQL, or a stack trace to the requester.
   const code=reason.includes('already_active')?'already_migrated':
    reason.includes('world_revision_match')?'legacy_changed_during_migration':
    'migration_failed';
   return reply({ok:false,error:code},409);
  }
 }
};
