# ProfitLands World 1 — Legacy Firebase Cloud Functions Deployment Notes

> **Historical documentation — not the current production deployment path.** ProfitLands World 1 now uses the separate Cloudflare `profitlands-world1` Worker and D1 Free backend. For current deployment, see `CLOUDFLARE_DEPLOYMENT.md` and `cloudflare/deploy-free-world1.ps1`. Do **not** enable Firebase Blaze or deploy the legacy `worldApi` function just to run the current multiplayer server. Authentication remains Firebase; gameplay balances and PvP are authoritative in Cloudflare D1. A successful `/health` response does not replace real multi-account acceptance tests.

## Current status

**The source code is prepared; this is not a claim that the server is deployed.** The game is currently served from GitHub Pages, which hosts static files only. Its Firebase project is `wtvstudios-5b40f`, the same project already used by ProfitLands authentication and private cloud saves.

The multiplayer API is implemented as an authenticated **Firebase Cloud Functions (2nd gen) callable** named `worldApi` in `us-west1`. It runs on Node.js 22 and uses Firebase Admin to own the World 1 ledger.

**Before public multiplayer:** connect the ProfitLands Firebase project with deploy permissions; confirm its billing tier supports Cloud Functions (Firebase Blaze); deploy Firestore rules and functions; test two accounts. The desktop remote connection is not sufficient if its usage quota is exhausted.

## Deploy commands (run only in an authorized Firebase environment)

```sh
npm --prefix functions install
npm --prefix functions test
firebase login
firebase use wtvstudios-5b40f
firebase deploy --only firestore:rules,functions:world1 --project wtvstudios-5b40f
```

Use Firebase CLI's current help to confirm the deploy flags if necessary. No service-account keys, refresh tokens or private credentials belong in GitHub or the browser. Do not deploy to another project's database.

## What this alpha server does

- Exactly one world ID: `world1`, initially capped at 64 distinct authenticated players.
- The server creates an independent online empire for each player, with initial cash of $1,500.
- The server calculates passive cash generation, with offline settlement capped at six hours.
- Eight server-validated company types, purchases and upgrades.
- Daily and weekly changes in net worth (UTC) and all-time current net worth, ranked against all World 1 members.
- Opt-in PvP: three cash-cost rival income disruptions, 15-minute attacker cooldown, one-day newcomer immunity, same-clan protection, target recovery grace, and a paid 20-minute shield.
- Atomic attack and shield transactions, including an idempotency event record to avoid charging the same client request twice.
- Server-only scores, cash, purchases, attack outcomes and protected time windows.
- Public chat is **intentionally disabled** until moderation, blocking, reporting and retention are production-ready.

The online world is a deliberately smaller alpha economy than the expansive singleplayer game. Singleplayer saves and the local economy are **never used for leaderboard scores or PvP**. Online businesses use the server's catalog rather than imported local businesses.

## Verification checklist

1. Use a test account to enter multiplayer and select **Connect to World 1**. Observe a server-confirmed wallet and the company catalog; no client edit should change money.
2. Join with another signed-in test account in a separate browser; both must see their own wallets and the same leaderboard.
3. Buy a coffee shop on account A; verify the server deducts exactly $500 and money accrues after time passes.
4. Repeat the purchase concurrently; the server must reject insufficient funds, not allow double spending.
5. Upgrade a business and confirm the server-calculated price and wealth change.
6. Advance a server/emulator clock across midnight UTC and Monday UTC; verify day/week resets without resetting all-time net worth.
7. Opt both accounts into PvP; fund the test accounts through controlled test fixtures. Confirm target protections, insufficient funds, cooldowns, same-clan immunity and non-stacking.
8. Reuse the same attack requestId: it must not deduct money twice.
9. Confirm public users cannot write to `worlds/world1` through Firestore directly; all player mutations must be behind authenticated callable operations.
10. Verify chat returns a disabled response, and the bottom-right widget does not allow messages.
11. Verify the Firebase emulator suite tests, Firebase production logs and deployment logs before opening World 1 to the public.

## Operational limits and known follow-ups

- The API is callable-over-HTTPS, not a WebSocket server. Live state is loaded on demand; later work can introduce efficient server snapshots or subscriptions for quick updates.
- Company model is an alpha subset. It does not yet run every singleplayer finance subsystem.
- Server-side action requests use the authenticated Firebase UID. Never accept UID, balance or winning score values from clients.
- Set project budget alerts and monitor Firestore read/write usage before onboarding many players.
- Test the deployed function with multiple real accounts; local JavaScript tests alone are not a live deployment test.
- Firebase Cloud Functions requires the Blaze pricing plan, even when calls fit within free quotas. Enabling billing or deploying a paid service requires project-owner authorization.

## Additional pre-launch hardening (November 4, 2026)

- **Cash transaction replay protection:** All client purchase and upgrade requests now include a 128-bit unpredictable `requestId`; the server checks one per-player event document and atomically creates it with the ledger update. Different action/parameter reuse is rejected. Repeating the exact same request returns the existing receipt without a second purchase.
- **Transient network failures:** The browser retries transport errors with the identical ID, and preserves unresolved IDs in per-tab session storage for up to 24 hours so a page reload does not blindly issue another charge.
- **Faction/player data:** Leaderboard and rival reads require a registered world identity. Signed-in accounts outside World 1 cannot enumerate player records.
- **Read efficiency:** Server roster queries share a three-second, per-instance cache and coalesce concurrent requests. Successful gameplay mutations invalidate that instance's cache. Other Cloud Functions instances may show standings up to three seconds old.
- **Math precision:** Hundredths of a millidollar of income are carried through extreme high-frequency settlements, including while temporary PvP debuffs are active.

### Remaining acceptance tests

This is not a live-production test: verify retry behavior against the Firestore emulator and real multi-account Firebase sessions once deployment access is granted. Confirm two simultaneous charges with different request IDs behave as separate intended actions, while repeated requests with the same ID never duplicate an action. Configure abuse protection, usage budgets, monitoring and App Check before a public launch.
