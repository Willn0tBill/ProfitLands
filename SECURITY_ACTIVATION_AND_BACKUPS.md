# ProfitLands security activation and off-PC backups

This branch preserves all existing accounts and stored holdings. Pricing and security changes require explicit production activation; no destructive D1 reset is part of this update.

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

## Private, unpredictable in-game stock quotes

The backend now contains an HMAC-based price generator that cannot be
calculated from the public in-game stock formula. Each region/tick derives
its own prices using a **private Cloudflare Worker secret**. Quotes are
consistent across isolates and across restarts while that secret is stable.
The original formula remains in use until explicitly activated.

For a safe activation:

1. Use a high-entropy 32-byte random Base64 secret as
   `WORLD_MARKET_SECRET` in the **backend Worker only**, never in the
   frontend, GitHub repository, logs, or worker `[vars]`.
2. Pick one future UTC timestamp divisible by 900000 (a 15-minute
   boundary) and set `WORLD_MARKET_START_AT` as a 13-digit integer
   **millisecond** environment variable. All regions must use the same
   start boundary.
3. Back up the live V2 D1, deploy the audited backend without switching
   back to legacy storage, check that `/health` reports
   `secureMarketActive: false` before the boundary, and confirm
   `secureMarketActive: true` afterward.
4. Verify two real Firebase accounts see the same quote within one
   region/tick and that authenticated trades charge exactly the server
   quote, including on replay. Monitor Cloudflare Worker CPU usage.
5. The first six 15-minute intervals blend from the last known legacy
   quote to the private quote, reducing abrupt changes to existing
   holdings. This is a valuation transition, **not** a guarantee that
   fictional stock holdings never fluctuate.

Once activated, keep the same secret. Rotating it unexpectedly produces
different historical and current prices and must be treated as a separate
market migration.

## Non-destructive inactive player slots

At the existing **64 active players per region** limit, joining or
returning players can free a slot by parking the least recently active
eligible record. A player is eligible after **90 days** with no recorded
register or successful write activity and no enabled PvP, unexpired
company listing, outstanding loan or tax debt.

Parked accounts remain as complete `world_players` records in D1 with
their companies, investments, receipts and achievements intact.
They cannot actively trade, attack or post messages until they
successfully re-register in an available slot; reactivation never
creates a fresh balance. Regional admission uses the existing atomic
V2 metadata guard to enforce the 64-active-player cap under concurrent
registration.

No existing account is deleted, and no extra D1 schema migration is
required for parked state. A read-only `me` poll does not update last
activity; the registration path does, and successful write actions do.
Before public launch, document the policy in the game's rules and give
players a clear parked-account message.

**Storage tradeoff:** Parked records still occupy D1 storage and roster
reads; long-term growth requires an indexed active-only roster or a
separate archive store. This solves the *active slot* issue, not infinite
free database capacity.

## Remaining production configuration and verification

- The optional cross-isolate D1 limiter cannot protect live requests
  until `cloudflare/security-rate-schema.sql` is applied and the Worker
  flag `SECURITY_D1_RATE_LIMIT=enabled` is configured and deployed.
  It covers high-risk authenticated game operations, not arbitrary
  distributed bot floods; use Cloudflare edge rate controls for those.
- The encrypted GitHub backup workflow needs repository secrets
  configured and installation on the default branch. Its first
  successful export **and isolated restore** must be verified before
  calling the PC dependency eliminated.
- The new private stock market needs a Cloudflare secret and activation
  boundary; the committed code does not itself change live quotes.
- No automated punitive bans are applied on rate-limit failures. Blocking
  or banning players for suspicious activity without reviewing context
  risks false positives and should provide an appeal route.
- A real two-device player beta, full Cloudflare quota observation, and
  end-to-end GitHub artifact restore remain required release gates.

No paid Cloudflare upgrade, account deletion, or destructive D1 reset is
authorized or implemented here.
