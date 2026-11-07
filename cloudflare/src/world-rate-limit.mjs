/* Low-cost, per-Worker-isolate burst shield.
 * Never treats this as a globally consistent daily quota or D1 admission rule.
 * No persistent writes: protects CPU and absorbs accidental request storms.
 * Cloudflare distributed limits require Cloudflare WAF or a Durable Object.
 */
const WINDOW_MS=60000;
const MAX_BUCKETS=4096;
const buckets=new Map();
function allow(key,limit,at=Date.now()){
 if(!key||!Number.isFinite(at))return {ok:true,retryAfter:0};
 const current=buckets.get(key);
 if(!current||at>=current.until){
  if(buckets.size>=MAX_BUCKETS){
   for(const [id,b] of buckets){if(at>=b.until)buckets.delete(id)}
   if(buckets.size>=MAX_BUCKETS)buckets.delete(buckets.keys().next().value);
  }
  buckets.set(key,{count:1,until:at+WINDOW_MS});
  return {ok:true,retryAfter:0};
 }
 if(current.count>=limit)
  return {ok:false,retryAfter:Math.max(1,Math.ceil((current.until-at)/1000))};
 current.count++;
 return {ok:true,retryAfter:0};
}
function checkIp(request,action,at=Date.now()){
 // Only CF-Connecting-IP is authoritative on deployed Workers.
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||ip.length>80)return {ok:true,retryAfter:0};
 const isHealth=action==='health';
 return allow('ip:'+ip+':'+(isHealth?'health':'api'),
  isHealth?60:180,at);
}
function checkUid(uid,action,at=Date.now()){
 if(!uid)return {ok:true,retryAfter:0};
 const read=['me','getLeaderboard','getPlayers','getChat','getListings',
  'getAccountAchievements','getBlockedChatUsers','getChatReports'].includes(action);
 return allow('user:'+uid+':'+(read?'read':'write'),read?100:40,at);
}
function resetForTests(){buckets.clear()}
export {allow,checkIp,checkUid,resetForTests,WINDOW_MS};
