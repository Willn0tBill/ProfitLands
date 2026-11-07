# ProfitLands security activation and off-PC backups

This branch deliberately does **not** silently enable new migrations, delete player accounts, change existing stock valuations, or overwrite live D1. Its security controls are additive.

## Cross-Worker rate limit (optional; not enabled by the committed code)

1. Take a verified private backup before migration.
2. Apply `cloudflare/security-rate-schema.sql` to the existing **remote** ProfitLands D1 database (not a local copy), using your authenticated Wrangler connection and the real database ID. The migration creates only `world_abuse_limits`; it does not touch player or receipt tables.
3. Configure the deployed backend Worker environment variable `SECURITY_D1_RATE_LIMIT=enabled` and deploy the Worker.
4. Use two authorized test accounts in the live test region: demonstrate that sensitive actions 1–12 in the same minute are accepted by the limiter and action 13 returns HTTP 429 (the game operation itself must separately satisfy normal rules). Verify a different account and a different region have independent allowance. Confirm routine `me` and chat remain available.
5. Watch D1 row-write usage and disable the flag if the free quota is tight. This mechanism adds up to one D1 row write for each sensitive accepted operation, and an existing-row read for each checked operation. There is intentionally **no database write for every chat poll, wallet display or health read**.

The limiter is globally consistent across Cloudflare Worker isolates *for the defined sensitive operations* because the SQL UPSERT updates a shared D1 row atomically. It is **not** global IP flood protection, a Cloudflare quota guarantee, or a substitute for WAF. Configure Cloudflare's available IP/ASN and bot safeguards outside the application separately if necessary.

## PC-independent, encrypted backup workflow

The `.github/workflows/d1-encrypted-backup.yml` workflow schedules a daily encrypted D1 SQL export at 11:35 UTC. GitHub scheduled workflows operate from the repository **default branch**, so merging or explicitly installing this workflow on `main` is required before automatic runs exist. Nothing in this draft PR is a verified running off-PC backup yet.

Repository Actions secrets required:

- `CLOUDFLARE_API_TOKEN` — narrow token permitting D1 reads/exports.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account that owns the D1 database.
- `PROFITLANDS_D1_DATABASE_ID` — exact UUID of the existing `profitlands-world1` database.
- `PROFITLANDS_BACKUP_PASSPHRASE` — random 24+ character private passphrase; keep a second private copy **outside GitHub**. Without it, the encrypted backups cannot be recovered.

The workflow checks exports are nonempty and contain the `world_players` schema marker, stores SQL and its SHA256 digest inside an encrypted tar archive, and uploads **only** encrypted `profitlands-d1.enc` artifacts for 30 days. No plaintext export should be committed or retained as an artifact.

To rehearse restore, download the encrypted artifact to a trusted machine and decrypt with:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in profitlands-d1.enc -out backup.tar.gz -pass env:BACKUP_PASSPHRASE
mkdir isolated-restore
tar -xzf backup.tar.gz -C isolated-restore
(cd isolated-restore && sha256sum -c SHA256SUMS)
```

Load the SQL into a separate **local test D1/SQLite database** and verify player/receipt counts, data consistency and a test sign-in. Never import a backup directly over production. GitHub Actions does not guarantee exact cron start times or indefinite artifact availability; retain the working local backup task as an additional independent copy.

## Still unresolved / deliberately not silently changed

- Existing stock quotes are transparent 15-minute deterministic formulas. Replacing them without a stable confidential seed and migration/valuation plan can change all existing holdings' worth and payouts. A safe redesign must snapshot or grandfather pre-change positions and test quote consistency across regions, replays and crashes.
- Registered accounts still occupy one of 64 slots even when offline. Automatically deleting them would destroy player saves and receipts. A safe policy should preserve inactive accounts in a separate parked store, provide reactivation priority with capacity controls, and announce this before adoption.
- Cross-IP distributed floods are not eliminated by the D1 account throttle. Use Cloudflare edge security rules and isolate upstream cost under free limits.
- This release has no automatic cheating ban or mass account deletion. Logs and rate limits should be reviewed to avoid false positives, and players need appeals before sanctions.
- Complete live two-device beta and restore-from-GitHub-artifact rehearsal remain release gates.
