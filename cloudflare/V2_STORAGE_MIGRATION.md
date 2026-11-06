# ProfitLands V2 D1 storage: migration and safety runbook

**Status:** Implemented and tested in the draft branch; **NOT enabled in production**.
The public Worker still uses the legacy `world_state` rows until a separate, authenticated cutover. Neither deploying this source nor running the normal static-site build automatically migrates live data.

## What changed

- `world_meta` stores small per-region metadata, revision and chat.
- `world_players` stores one JSON record per player, keyed by region and Firebase UID.
- `world_receipts` stores one timestamped, replay-safe purchase/operation receipt per region/ID, indexed by expiry. Unlike the legacy ledger, no global 4096-receipt cap prematurely evicts legitimate unexpired payments.
- `world_player_guards` checks the version of each affected account inside an **atomic D1 batch**, and `world_guards` protects regional chat metadata and player-cap admissions. A failed two-account purchase/PvP operation cannot transfer only one side.
- Normal purchases load only the participating player(s) plus the relevant replay receipt. Leaderboards and company browsing may still read the full roster. Independent account purchases no longer compete for the same region revision; shared chat/admission operations still do. D1 Free quotas and finite record sizes still apply, so this is not unlimited horizontal scaling.

**Existing legacy `world_state` records remain intact as a rollback snapshot.** Enabling V2 before migration fails closed rather than creating empty accounts.

## Safe commissioning sequence (operator-owned Cloudflare account required)

1. **Do not run on active player accounts without a maintenance window.** First use a preview/local D1 database with test Firebase accounts; confirm company acquisition, PvP, chat, trading, refresh, country taxes, receipts and cloud-save recovery. Review Cloudflare Free read/write quotas and query limits; CI is not a replacement for real quota testing.
2. Deploy the latest main Worker source with `WORLD_MAINTENANCE_READONLY=true` and **without** `WORLD_STORAGE_V2=enabled`. Confirm `/health` returns `maintenance:true`, that read operations still work, and every write is rejected. Older live Worker version 4 does **not** support this flag; do not proceed until the upgraded Worker does.
3. Back up the actual D1 database to a secure directory *outside the repository*. Example from `cloudflare/`:
   ```powershell
   npx wrangler d1 export profitlands-world1 --remote --output="$HOME\Documents\profitlands-before-v2.sql"
   ```
   Verify that the file exists and contains all three legacy world rows. Keep this backup private and never commit it.
4. Apply additive tables; **no legacy rows are deleted**:
   ```powershell
   npx wrangler d1 execute profitlands-world1 --remote --file=./schema-v2.sql
   ```
5. Deploy the separate **temporary** `wrangler-migration.toml` Worker. It starts disabled and requires all four separately configured settings: `WORLD_MIGRATION_ENABLED=true`, `WORLD_MAINTENANCE_READONLY=true`, `WORLD_MIGRATION_ADMIN_UID` for the authorized Firebase owner account, and a long independent `WORLD_MIGRATION_SECRET` (Cloudflare secrets, never in code). It also verifies the owner Firebase ID token. **Never use this temporary Worker as the public game endpoint.**
6. From the trusted authenticated operator client, call `POST /migrate` on the temporary Worker for each of `world1`, `world-europe`, and `world-asia`. Supply the authenticated Firebase token, independent migration secret in `X-Migration-Key`, and JSON `{"worldId":"world1","confirm":"backup-verified-writes-frozen"}` (vary region). The server stages old players and receipts, aborts activation if the legacy revision changed, then atomically promotes each region. Do not share secrets or tokens in public logs.
7. Verify every region: compare account counts, example balances, businesses, receipts, listings, chat and region isolation against the saved legacy snapshot. Any failed/partial stage **must not** be treated as complete. Do not enable V2 while any region is unverified.
8. Set `WORLD_STORAGE_V2=enabled` on the regular Worker while keeping `WORLD_MAINTENANCE_READONLY=true`. Confirm health version 6 in each region, then test known accounts in read-only mode. Only after a successful smoke and two-account test may the operator remove maintenance read-only mode.
9. **Delete the temporary migration Worker and its secrets** after cutover, and retain the verified protected backup under the owner's control. Do not assume toggling back to legacy is a lossless rollback after new V2 writes have occurred.

## Failure behavior

- Missing migration schema, incomplete migration, or V2 enabled too early: fail closed. Do not synthesize replacement player accounts.
- Stale snapshot during staging: SQLite `CHECK` aborts promotion and leaves the legacy source intact; temporary staged rows are cleaned.
- Simultaneous transactions: an atomic guard causes stale operations to retry against the latest committed player data.
- D1 batch failure during purchase/acquisition: the **whole batch** rolls back, including both accounts, the receipt and regional version.
- V2 individual player records retain a bounded 1.8-MB safety guard; receipt expiry is 72 hours. Free Cloudflare plans still have daily quotas.
- Production deployment and signed-in device tests were **not** performed in the development branch. Full solo/multiplayer feature parity remains incomplete (e.g. bankruptcy recovery, world events, advanced city contracts and progression).

## Local verification

```powershell
node --test tests/world-v2-storage.test.mjs
node --test
npm run build:cloudflare
```

The V2 tests use Node 22+/24's SQLite engine and execute real transactions, including deliberately failed atomic batches and stale migrations. The legacy path retains its existing regression suite. Real Cloudflare D1 and two-account browser acceptance testing is still required before production cutover.
