# ProfitLands World 1 — Deploy and Verify

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
