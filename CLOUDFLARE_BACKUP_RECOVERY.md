# ProfitLands World V2 – private recovery and request-budget operations

**Owner device:** private Windows workstation (D: drive). This document contains no API credentials, signing URLs, account IDs, player state, or database dumps.

## Installed automatic backups

- Windows Task Scheduler task: `ProfitLands-D1-Daily-Private-Backup`.
- Fires at **3:15 AM local computer time** with *StartWhenAvailable*, using the currently authenticated Wrangler on the owner's PC. A PC that is powered off cannot export D1. When the PC next comes online Windows can run the missed task.
- Script: `scripts/backup-profitlands-d1.ps1`.
- Output: `D:\ProfitLands_Backups\profitlands-world1-daily-YYYYMMDD-HHmmss.sql` plus `.sha256`, both **outside** the Git checkout.
- At least the five most recent private daily exports survive; older generated daily exports are eligible for removal after 14 days. Previously frozen pre-migration snapshots are **never** removed by this script.
- Failures go to a local status log without recording Cloudflare's short-lived signed export download URLs. A failing export is not considered a recovery point.
- D1's export process may briefly interrupt database access. No live schema changes are made by the export.
- To review: `Get-ScheduledTaskInfo ProfitLands-D1-Daily-Private-Backup`, or read `D:\ProfitLands_Backups\profitlands-daily-backup-status.log`.
- To run immediately: `Start-ScheduledTask -TaskName ProfitLands-D1-Daily-Private-Backup`.

## Verified restore drill

1. Select the latest `.sql` backup outside the repository.
2. Verify its SHA-256 equals the first token of the companion `.sha256` file.
3. Import it into an **isolated local Wrangler D1 persistence directory**, never the remote production database:

```powershell
Set-Location D:\ProfitLands_Contract_QA
$dump=(Get-ChildItem 'D:\ProfitLands_Backups\profitlands-world1-daily-*.sql' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
node .\cloudflare\node_modules\wrangler\bin\wrangler.js d1 execute profitlands-world1 --config .\cloudflare\wrangler.toml --local --persist-to 'D:\ProfitLands_Backups\restore-rehearsal' --file $dump --yes
node .\cloudflare\node_modules\wrangler\bin\wrangler.js d1 execute profitlands-world1 --config .\cloudflare\wrangler.toml --local --persist-to 'D:\ProfitLands_Backups\restore-rehearsal' --command 'SELECT (SELECT COUNT(*) FROM world_meta) AS regions,(SELECT COUNT(*) FROM world_players) AS accounts,(SELECT COUNT(*) FROM world_receipts) AS receipts' --json
```

A restore rehearsal completed on November 6, 2026: **3 world regions, 1 retained account, 4 purchase receipts; successful local SQL import and matching SHA-256**. Existing live D1 data was not changed.

## During an actual incident

1. Freeze new writes with `WORLD_MAINTENANCE_READONLY=true` **after confirming the impacted deployment**, and preserve a fresh incident-time export if the database is responsive.
2. Compare the incident-time export, recent daily snapshots, and any available Cloudflare point-in-time recovery before choosing a recovery point. Do not blindly restore an older backup over newly earned cash or accounts.
3. Restore into a **new staging D1 database** and verify player counts, account payloads, receipts, and actual signed-in transactions before cutting over.
4. Repoint the production binding only after explicit owner approval and a rollback plan. Never run a historical SQL import against the existing writable live D1 by default.

## Request-budget protections

The deployed Worker has a small, **per-isolate** burst limiter (60 health, 180 per-IP API, 100 per-user reads and 40 per-user writes in one minute) that returns HTTP 429 with `Retry-After`. It does not write quota bookkeeping to D1. These limits are *not* a global distributed daily quota: Cloudflare may execute different requests in different isolates. A sustained/distributed flood could still consume the free request allowance.

Chat automatically polls about every three minutes **only while its panel is open and visible**. User-initiated sends, reports, and manual refresh request immediate updates. Failed chat and balance syncs back off; the background balance poll remains one account-only request per five minutes while World is visible.

The on-screen wallet is a **half-second estimate**, not trusted account money. When a later server snapshot differs materially, the UI explains the adjustment; on a failed refresh the existing world storefront stays visible.

## Remaining known risks

- The 64-person regional cap counts registered accounts, not simultaneous viewers. Do not silently evict inactive accounts or delete saves. Region selection already offers alternative worlds.
- Stocks use deterministic server-owned public formulas: experienced players can forecast prices. Real unpredictable quotes require a controlled private market-seed design and economic migration safeguards; **not resolved by this release**.
- Actual multi-device beta, production-global rate limiting, extended outage recovery, and free-tier quota monitoring still need validation.
