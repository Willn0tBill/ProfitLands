# ProfitLands — Three regional multiplayer worlds

**State (November 6, 2026): Americas, Europe and Asia run as three independent ledgers in the free Cloudflare `profitlands-world1` Worker and its existing D1 database. Each region supports up to 64 registered accounts (192 across the three), with separate cash, shops, rankings and PvP. The prior `world1` record is preserved as Americas. Authenticated two-account gameplay and production load testing still require live acceptance checks.**

The browser now has a multiplayer-only World hub, money leaderboards, PvP action choices, and a bottom-right chat dock. No fake players, rankings, chat messages, payments or attacks are generated. The widgets stay offline while a trusted backend is unavailable.

The **existing Multiplayer Preview is a local simulation**. No local cash/save can earn leaderboard status or be accepted as a PvP attack.

## World format

- Three independent worlds: `world1` (Americas), `world-europe` (Europe) and `world-asia` (Asia). Each has its own state record in the existing D1 database and its own 64-account cap. The regions are currently logical game worlds, not geographically separate datacenters.
- Solo saves and the local Preview never contribute to the multiplayer ledger.
- All transactions use **in-game dollars only**; no real-world payments.
- World ranking displays 20 verified players per period.
- Daily (UTC): **change in server-tracked net worth** from the start of the current UTC day.
- Weekly (UTC, Monday start): **change in server-tracked net worth** from the start of the current UTC week.
- All time: **current server-tracked net worth**.
- PvP costs reduce the attacker's cash and hence their wealth score. PvP does not award clan points.
- Rank computations need server snapshots at UTC boundaries so reconnecting or delaying updates cannot reset them.

## Paid rivalry / attack catalog (balancing proposal)

| Action | Minimum cost | Scaled cost | Effect |
|---|---:|---:|---|
| Supply Disruption | $5,000 | 1.5% of targeted company's value | -12% income for 8 min |
| Reputation Campaign | $15,000 | 3.5% of targeted company's value | -20% income for 6 min |
| Market Pressure | $50,000 | 7.5% of targeted company's value | -30% income for 5 min |
| Business Protection | $10,000 | 2% of own empire's value | Blocks new attacks for 20 min |

The trusted backend should automatically select the target's highest-earning eligible company until direct business selection is implemented. Only one debuff at a time may affect a target. Each attack costs the attacker cash **up front**; it reduces the target's server-calculated earning rate temporarily, but does not directly transfer cash, destroy an asset, erase a save or lock them out. This still allows sustained competition and economic recoveries.

Protections: both players must opt in, both must be in `world1`, no self or same-clan attacks, one attack per attacker per 15 minutes, target cannot be attacked while a debuff runs plus 10 minutes grace, a new player's first 24 hours and first $25,000 net worth are protected. A purchased shield blocks new attacks for 20 minutes. All protections and prices are **server decisions**, not browser checks.

This deliberate guardrail prevents rich clans from permanently deleting new players' empires. More aggressive optional ranked or clan-war formats can be evaluated after real playtesting.

## Required authenticated server contract

The browser reads `window.ProfitLandsOnline` only when a separately deployed secure online adapter reports `isConnected() === true`. Its contract:

```js
isConnected() => boolean
getLeaderboard(period: "day" | "week" | "all") => Promise<Array<{displayName, score}>>
getPlayers() => Promise<Array<{uid, displayName, pvpEnabled, clanId}>>
getChat() => Promise<Array<{id, displayName, text}>>
sendChat(text) => Promise<void>
reportMessage(messageId) => Promise<void>
requestAttack({targetUid, attackId}) => Promise<void>
requestDefense() => Promise<void>
togglePvP() => Promise<void>
```

The server must authenticate the user's Firebase ID token for every call, derive attacker UID from that token, find the targeted company value *on the server*, and use a **single atomic transaction** for attack quotes, balances, cooldowns, protection, debuff record and audit events. `multiplayer-pvp-rules.js` contains pure `quote`, `eligibility`, `applyAttack`, and `applyDefense` proposal helpers. They intentionally do **not** write to any balance or run the world economy. They are not an authorization boundary and must be re-executed using authoritative server records.

The server must settle income against active debuffs using trusted timestamps, handle concurrent attacks, defend against duplicate calls and replays (idempotency keys), and use decimal or big-integer money representation at high wealth scales. The helper's JS safe-integer range is suitable for a limited alpha only.

### Chat and safety

Public chat should stay disabled until a production-grade message backend and moderation exist. It needs: server message length enforcement, limits per account and per minute, profanity and privacy-sensitive information filtering, blocking, reporting to human moderators, retention policy, and abuse escalation tools. No public email addresses or private saved-game data should be exposed. For teen players, avoid direct messages by default.

### Firebase / production readiness

The current `firestore.rules` denies direct client reads and writes to any future `worlds` collection. **Keep this default deny rule.** A trusted service identity such as Firebase Admin in Cloud Functions must own authoritative economy and moderation changes. Do not open Firestore write permissions for scores, attacks, chat messages or shared balances.

The following are still required for a real launch:

1. Deploy and verify the existing clan security rules.
2. Build and deploy the authoritative world economy, world registration, and cloud functions / server.
3. Replace local Preview's start/resume flow with online world enrollment and live server balances without overwriting solo saves.
4. Implement period snapshots and server-generated leaderboard updates.
5. Implement signed-in, moderated and rate-limited chat (including reporting and blocking).
6. Implement atomic attack transaction and server-timed income debuffs with replay protection.
7. Run multi-account emulator and end-to-end tests, measure cost and concurrency, then conduct a controlled alpha.

No server has been deployed as part of this client-side branch. The World 1 UI is deliberately honest about its status.

## Test plan

- World and Clans menus are invisible and inaccessible during singleplayer.
- An offline World screen never lists invented users or scores, and disables chat/PvP.
- Price increases with target-company value and rejects invalid values.
- Opt-in and newcomer protection, world validation, same-clan immunity, cooldown, shielding, nonstacking.
- An attack transaction deducts cash from the attacker, sets a timed income debuff, leaves target assets intact, and cannot be repeated while on cooldown.
- UI actions do not modify `state.cash` or any local save.
- Live backend: two separate accounts, one server-controlled shared world, atomic transaction races, replay tests, timezone boundaries, blocked users, and abusive chat tests.
