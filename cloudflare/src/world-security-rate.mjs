/* Optional cross-isolate guard for costly, fraud-sensitive actions.
 * D1's atomic UPSERT enforces the window across Worker instances. Deploy the
 * additive schema before setting SECURITY_D1_RATE_LIMIT=enabled.
 * Reads, sync and chat intentionally do not consume D1 write budget here.
 */
const WINDOW=60000;
const SENSITIVE=new Set(['buyListedCompany','requestAttack']);
const ENTERPRISE=new Set(['buyShares','sellShares','borrowLoan','claimContract',
 'claimCityContract','fileBankruptcy','ascendEmpire']);
const isSensitive=body=>SENSITIVE.has(body?.action)||
 (body?.action==='enterpriseAction'&&ENTERPRISE.has(body?.operation));
async function checkDistributed(db,uid,worldId,body,at=Date.now()){
 if(!isSensitive(body))return {ok:true,retryAfter:0};
 if(!db?.prepare||!uid||typeof worldId!=='string')throw Error('world_security_db_required');
 const period=Math.floor(at/WINDOW)*WINDOW;
 const key=worldId+':'+uid;
 // Conditional UPSERT is one atomic SQLite statement, including under
 // simultaneous Worker requests. An exhausted slot leaves the row unchanged.
 const result=await db.prepare(`INSERT INTO world_abuse_limits (account_key,window_start,hits)
 VALUES (?,?,1)
 ON CONFLICT(account_key) DO UPDATE SET
  hits=CASE WHEN world_abuse_limits.window_start < ? THEN 1
    ELSE world_abuse_limits.hits+1 END,
  window_start=CASE WHEN world_abuse_limits.window_start < ? THEN excluded.window_start
    ELSE world_abuse_limits.window_start END
 WHERE world_abuse_limits.window_start < ? OR world_abuse_limits.hits < 12`)
  .bind(key,period,period,period,period).run();
 const ok=result?.meta?.changes===1;
 return {ok,retryAfter:ok?0:Math.max(1,Math.ceil((period+WINDOW-at)/1000))};
}
export {checkDistributed,isSensitive,WINDOW};
