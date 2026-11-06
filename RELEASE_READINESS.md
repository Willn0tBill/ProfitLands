# ProfitLands — integrated prelaunch development candidate

Status: **UNRELEASED. Do not deploy as feature-complete or submit to CrazyGames.**
Updated: November 6, 2026

## What is implemented in this candidate

- Three independent regional Cloudflare/D1 multiplayer worlds with server-validated sign-in, ledgers, purchases, 8 industry types, rankings, optional PvP, and player aliases.
- Automated regional chat: server-side masking of common profanity and slurs into `***`, disguised spelling handling, temporary abuse mutes, spam limits, contact-detail blocking, report/block controls, optional privileged human review, and an emergency shutdown switch. Filter misses and false positives remain possible.
- Firebase private **singleplayer** cloud saves: revision-checked Firestore transactions, device/cloud conflict prompts, local recovery copies, account-owner isolation, and an explicit fresh-account start when a prior account's local progress exists. Online multiplayer economies are persisted in Cloudflare D1, not in the Firebase solo `last-game` slot.
- Expanded server-owned multiplayer economy with company staff, managers, marketing, efficiency, company branches, branch upgrades, inventory purchases and actual time-based sales, price adjustments, auto-restocking, warehouses, trucks, stock transfers and **multiple concurrent supply routes (one route per paid truck)**. Legacy single-route records migrate without losing scheduled deliveries; selling a company removes or reindexes affected routes.
- Online portfolio: four market securities, server-generated fifteen-minute quotes, market-price-valued portfolio holdings and leaderboard changes, server-authorized share trades, loans/repayments, property/rental holdings, technology research and one real-action-based daily contract reward. Mark-to-market movements are allocated to UTC daily/weekly periods; refreshes cannot double-count them.
- **Seven corporate tiers from singleplayer:** local through Global Empire, with identical base purchase prices, unlock thresholds, and positive baseline operating margins; the regional server enforces cash, wealth and ownership checks and includes assets and passive income in world rankings. Unlike solo mode, corporation demand volatility and events are not yet modeled.
- **All 35 singleplayer countries:** generated into worker and Firebase economy modules from the canonical country model. The online country selector includes every country; server-side baseline business margins respond to the original per-country demand, revenue, wage, rent and sector strength factors. Country-switching is locked after expansion/financial activity.
- **Corporate-income-tax ledger:** server-verified annual income-tax assessments at the selected country's rate, based on tracked operating earnings less inventory procurement expenses. Stock purchases/sales and borrowed principal do not count as operating profit. A bill becomes an outstanding liability until the player explicitly pays it with server-authorized cash. Online fiscal years are 365 **real UTC days**, unlike accelerated singleplayer game days; full singleplayer financial simulation is still missing.
- Authenticated, same-region company marketplace: players choose to list companies at bounded prices, others can acquire them with atomic cash/asset transfers and transaction replay protection.
- The online server derives earned trophy ranks across the same 8 industry categories × 16 tracks × 1,024 possible ranks (131,072 combinations); these ranks are **not yet synchronized** into the singleplayer Firebase account-wide trophy collection.
- The World interface has Management, Supply & Logistics, Stock Market, Finance & Property, and Research & Contracts controls. All online mutations pass through the verified backend; local singleplayer money is not authoritative for World operations.
- Isolated CrazyGames HTML5 build with platform SDK adapter and basic automated packaging tests; no existing public web account configuration is removed from the regular release.

## Verified by automated tests

- Node.js regression suite and syntax checks on the isolated development copy.
- Tests for server-owned economy actions, cash/inventory conservation, concurrent routes, route cleanup on company sale, quote-valued stock holdings, midnight/weekly mark-to-market, CJS/ESM server consistency, replay protection, cross-region isolation, company marketplace transfers, profile security, cloud save conflicts and account switching, profanity masking, chat reporting and emergency shutdown, and CrazyGames packaging.
- Cloudflare/static asset and CrazyGames distributions build without deleting original source.
- Local Node regression suite: **477 passing, 0 failing**, with Cloudflare static frontend build and generated-country-catalog verification passing. Recheck real Cloudflare/D1 smoke and GitHub CI on the exact integration commit before any live-account test.

## Critical gaps / no launch

1. **Full singleplayer parity remains incomplete.** The present Cloudflare backend still has an online limit of 40 businesses, 8 sites/company and a small world-state JSON row with a 900-kB guard. Singleplayer allows much larger locations and advanced features. Missing or incomplete systems include full debt-default recovery/bankruptcy and accelerated fiscal systems, market risk and world news, corporate IPOs/volatility beyond the seven baseline tiers, worldwide branch-specific location economy, full city contracts, detailed advancements, industry-specific supply economics, native account achievement merging, and the same precise formulas as solo. This branch adds real features, **not full parity**.
2. **Scalability:** 64 registered accounts per logical region and a single versioned D1 JSON row are not production-scale. Refactor into appropriate partitioned D1 records and stress test before increasing any cap.
3. **Cloud saves:** all cloud-save tests are mocks; test two real Firebase test accounts and devices before merging or deploying to production. Preserve backups and recovery paths.
4. **Chat:** automatic filtering does not catch every disguise or contextual harassment. Review and incident appeals remain necessary; live chat is not approved until account/abuse checks. Use `CHAT_DISABLED=true` to shut it off immediately.
5. **Regional multiplayer:** verify purchases, chats, PvP, region isolation, company transfers and realtime behavior using actual authenticated browsers, deployed D1 and free-tier quotas, and mixed old/new account data.
6. **CrazyGames:** use the developer portal preview and device/browser tests to validate SDK, automatic progress saving and all platform requirements before submitting. Build/test success is not publication approval.
7. **UI accessibility/performance:** real-world mobile, keyboard, 320px layout, reload and save recovery tests are needed for the expanded online UI.

## Release principle

Do not merge to production, deploy the backend, activate billing, migrate or destroy existing World state, or advertise complete feature parity until all above gaps are resolved and live acceptance tests pass. This candidate is a safe working branch for further QA; it is not evidence that every promised feature is available.
