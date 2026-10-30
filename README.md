# ProfitLands

**A Wtv Innovations (WtvI) game**

> Build. Invest. Compete.

ProfitLands is a browser-based financial and empire-building strategy game prototype. You start with **$1,000** and expand your empire as far as the economy can grow. **There is no final $1 trillion win condition.**

## WtvI Executive Quick Switch (v1.6)

Use **Ctrl+K** (or **Cmd+K** on macOS) to open a searchable command palette in the live game. Players can jump to management screens, open any owned business, buy a new company, or open other WtvI projects. The header also includes a touch-friendly Search control. Use `/` outside text fields as an alternative shortcut. The palette does not alter saves, time cycles, action pools, or cash.

## Live account trophies and optional native Steam host (v1.7)

- **Cross-device Firebase updates:** Once signed in, the Trophy Room subscribes to the player's own Firestore profile document. Trophies earned on a second signed-in device appear without signing out and back in. A failed cloud save keeps the local copy and retries automatically. Changes are typically queued for upload after about three seconds; closing the browser can interrupt an in-flight network request.
- **Profile badge removal now stays removed:** Featured badges have a last-edited timestamp, so the old merge-union logic does not bring back deliberately removed badges. Existing legacy collections still import normally.
- **Guest-to-account transfer is opt-in:** Signed-in players can choose "Import guest trophies from this device" under Account Settings; signing in on a shared device does not silently combine two players' collections.
- **Native Steam preparation:** The optional desktop host in `desktop/` uses Electron plus `steamworks.js`. A restricted preload/IPC bridge exposes only achievement queries, unlocks, and stats submission. The browser build never issues native Steam commands. A set of 100 Steam achievement API identifiers is already mapped from account badges, but these identifiers must also be created and published in the Steamworks partner portal.
- **Not yet live-certified:** A browser unit test cannot establish that the production Firestore project allows online reads/writes, nor can it prove a Steam server has acknowledged a native unlock. A real two-device login test and a Steam-enabled build test are still required. Native Steam account identity and ProfitLands Firebase account identity are separate.

To test the optional desktop host after you have a registered Steam application and the Steam client running:

```sh
cd desktop
npm install
# Set PROFITLANDS_STEAM_APP_ID to the real application ID for your platform.
npm start
```

The desktop host uses the Steam App ID environment variable, or the Steamworks SDK appid file if configured. Do **not** add Steam partner credentials, publishing secrets, or Steam Web API keys to the public repository. The native module and Steam redistributables must be packaged correctly for each target operating system before releasing a desktop build. The `StoreStats` call submitting successfully is not a guarantee that Steam's asynchronous server acknowledgement was received.

**Current accounting constraint:** Cross-device lifetime counters use the maximum of known totals to prevent accidental duplication of previously saved progress. Unlock ranks never decrease, but separate simultaneous counter-only events on multiple devices are not necessarily additive. That would require a per-device event-counter migration rather than simply summing saved totals.

## Trophy Room: 131,072 in-game badges (v1.5)

ProfitLands includes a **Trophies** workspace (Alt+0) with **131,072 procedurally defined badges**: 8 playable industries × 16 independently measured achievement tracks × 1,024 milestone ranks per track. Each badge has a stable ID, display name, measurable goal and Bronze/Silver/Gold/Diamond/Legendary tier.

Tracked achievements include highest and combined business levels, individual and combined marketing and efficiency, current staffing, invested capital, purchased location upgrades, marketing/efficiency actions, lifetime hiring, inventory purchases, market demo sales, market cycles with owned businesses, and cumulative **positive** operating earnings. First-time visits to the Trophy Room backfill achievements supported by current live business data; historical counters begin when the new system is installed, because prior saves did not record those events.

- **No 131,072-entry badge array is loaded or persisted.** Only 128 track definitions exist; 30 generated badge cards render on a page. Incremental scans evaluate industries touched by gameplay events, with a full reconciliation every 30 seconds to catch older code paths. Browse by industry, track, rarity, earned/locked status, or exact badge ID (for example `coffee.highestLevel.100`).
- **Compact saves.** The `state.badgeBook` object stores only the highest earned rank for a track, eight-sector lifetime counters, and up to five selected featured badges. Its size depends on track count, not the 131,072 possible badges.
- **Non-economic rewards.** Earning badges never grants money or actions, preserving the existing pacing. Notifications batch multiple unlocks.
- **Lifetime account achievements.** The 131,072 in-game badges persist when starting a new empire. Signed-in players synchronize their cumulative collection to a private field on their existing Firebase user profile; guest players keep a separate local copy. Previous saved-game badges are merged without removing unlocked ranks. Five featured earned badges can be added/removed from the showcase and appear in account settings. Live cross-device Firebase synchronization still requires manual signed-in verification.
- **Steam-ready separation, no Steam API connection yet.** The independent in-game collection is not constrained by Steam's 5,000 achievement maximum (100 initially until vetted). `steam-achievement-map.js` defines 100 stable candidate native Steam achievements for a future Steamworks integration. Publishing or awarding native Steam achievements requires a Steamworks-enabled application (https://partner.steamgames.com/doc/features/achievements/ach_guide).
- Some very high ranks are intentionally extremely long-term and depend on repeatable actions. This is a procedural milestone collection, **not 131,072 handcrafted unique challenges**.

## Permanent business advancements (v1.4)

Every company location has its own **Advances** technology tree, accessible through the ninth left-sidebar section or the **Advancements & Milestones** button inside that location's management window. There is **no maximum business level**: reaching a threshold unlocks the option to buy an upgrade. Bonuses only apply **after purchase** and do not automatically apply to all branches. Each advance costs cash and one management action, and is bought only once per location.

| Required level | Advance | Permanent benefit |
|---:|---|---|
| 10 | Professional Workstations | +2% location revenue |
| 25 | Employee Academy | −2% local payroll |
| 50 | Supplier Contracts | −2% operating costs |
| 100 | Advanced Equipment | +4% location revenue |
| 150 | Smart Scheduling | −4% local payroll |
| 250 | Regional Headquarters | +5% location revenue |
| 350 | Supply Forecasting | −5% local inventory purchase costs |
| 500 | Automated Operations | +2% location revenue, unlock auto-hiring and auto-upgrades |
| 750 | Brand Analytics | +3% location revenue |
| 1,000 | Corporate Specialization | +6% location revenue |
| 1,500 | Industrial Efficiency | −4% operating expenses |
| 2,500 | Prestige Network | +8% location revenue |
| 5,000 | Global Operations | +7% revenue and −3% operating expenses |
| 10,000 | Legacy Systems | +5% location revenue |

Purchasing all 14 advances adds **42%** to base location revenue, reduces operating expenses by **9%**, payroll by **6%**, and local inventory restocking costs by **5%**. These additive bonuses are bounded for predictable balancing. The advancement cost scales with the company type, level requirement and local rent.

**Auto-hiring/auto-upgrading** are opt-in, require a hired local manager plus the Level 500 advance, consume the usual cash/actions, run only during visible active play, perform at most two operations per check across the empire and at most one per minute per location, and require enough cash to cover five times the cost before committing. Existing employee caps continue to apply.

Save data remains compatible: purchased advances and automation preferences are stored inside the original location, while older location saves simply begin with an empty advancement list. They are reset only if the player starts a new empire.

## Business Arcade and game-style UI (v1.3)

ProfitLands now includes an optional **Business Arcade** as the eighth management-console view (Alt+8). It uses the same game, save data and large-number ledger as the rest of the empire.

- **Coffee Rush:** an original 20-second clicker. Tap or press Space to fulfill orders; higher scores earn more in-game cash.
- **Delivery Dispatch:** a 20-second routing challenge with up to eight deliveries.
- **Deal Desk:** choose sound business decisions across five short business scenarios.
- **Small rewards, no management-action costs:** cash prizes are capped at $110, $96 and $90 respectively, and only the first **three successful rounds in any rolling five-minute window** award in-game cash. Additional rounds are playable as practice, with no payout. This avoids disrupting the existing 10× action economy.
- **Save compatibility:** arcade personal bests, completed rounds and payouts live in the optional `state.arcade` object. Older saves work unchanged; starting a new empire resets arcade stats along with other new-game data.
- **Visible, active-play only:** quitting, changing workspace views or hiding the browser stops the active round; no background earnings are granted by mini-games.
- **Cosmetic UI improvements:** a consistent theme for business cards, stock listings, dashboards, finance screens, news and nav, implemented in `game-polish.css`.

The arcade is fully in-game: it does not make real-money payments, connect to a gambling service, or depend on actual multiplayer.

## Professional business console (v1.1)

The main `/play/` game now behaves like a **desktop management application**, not a long web page. The old game panels are reparented into one fixed-height workspace without cloning them or changing their IDs, so their existing gameplay functions continue working.

- **Persistent sidebar navigation:** Businesses, Overview, Operations, Markets, Analytics, Finances and Corporate.
- **One management view at a time:** The selected screen fills the available workspace area. The browser page itself does not vertically scroll on desktop; long lists have scrolling **inside** the selected management view.
- **Compact live top bar:** Day, market timer, cash, net worth, income, actions and game controls remain visible as you switch between screens.
- **Business portfolio:** Opens by default with business cards arranged in a responsive grid.
- **Preserved controls:** Company modals, site operations, stock trading, finances, corporate features and Empire Lab are the same live DOM elements as before.
- **Responsive:** On small screens, sidebar navigation becomes a horizontal tab row; the selected view remains usable on touch devices.
- **Saved preference:** The selected workspace view is kept under `profitlands-workspace-view-v1` in browser local storage, separate from `profitlands-v2` saved game data.
- **Shortcuts:** Alt+1 through Alt+7 switch screens. The existing minimized-panel controls remain under **Dashboard layout** in the sidebar.

This workspace intentionally allows internal scrolling for extremely long business lists or narrow screens. Preventing *all* scrolling would make large empires impossible to manage without hiding necessary controls.

## Minimize-friendly dashboard layout

The game page now includes a compact **View** toolbar above its management panels:
- **Minimize all** collapses the whole dashboard into section headers, including the statistics HUD.
- **Expand all** restores every section.
- **Default layout** shows the core dashboard, Businesses and Stocks; secondary sections start minimized.
- **Jump to a section** is a small expandable navigation menu. Selecting a minimized section automatically opens it.
- Each large section has its own **Minimize / Expand** control. Existing Business, Stock, News, Holdings, Investments and Finance toggles still work.
- The Company Management modal also has **Minimize**, which leaves a **Restore company window** chip at the bottom of the screen.

The layout is remembered separately in the browser under `profitlands-layout-v1`. It **does not** change your gameplay save, funds, businesses or cloud data. All game modules continue running while their displays are collapsed. Mobile widths and reduced-motion preferences are supported.

## Version 0.8 — Business Expansion

The main game now includes a **Growth Center** in `/play/` with four sections:

- **Analytics** — live, saved history of cash, empire value and net flow per second. History retains the latest 120 samples (roughly ten minutes of active play).
- **Employees and managers** — each location has its own hiring capacity based on its level, while a shared empire-wide workforce limit expands with net worth. Hire 1, 5, 10, or 25 employees per action. Productivity has diminishing returns and every worker adds ongoing payroll costs. Managers add a productivity bonus, ongoing salary and popularity maintenance during active play.
- **Industry decisions** — each of the eight business industries has a distinct promotion or operational initiative. Initiatives require cash and one action, give a ten-minute revenue bonus, and have a fifteen-minute cooldown. Effects use real time rather than market-cycle count so world-speed selection does not change promotion duration.
- **Milestones** — nine achievement checkpoints with a one-time in-game cash reward per saved empire. Reaching $1T is still a milestone, never the end of the game.
- **Balanced actions** — one action gradually refills during visible, active gameplay, with a different refill interval per mode. Actions do not accumulate while the browser is backgrounded.
- **Recovery saves** — the existing `profitlands-v2` save schema remains compatible; a previous valid save is stored at `profitlands-v2-backup` and can restore progress if the primary local save becomes corrupt.

### Large-number economy engine

ProfitLands uses `huge-money.js` for an authoritative scientific-notation cash ledger (`state.cashHuge`). Existing saves with numeric `state.cash` are automatically migrated. The old `state.cash` field is retained as a finite compatibility mirror for older modules; never treat that mirror as the authoritative balance at large scales.

- Balances such as `1e1000`, `1e2000` or `1e1000000` can be represented, displayed, saved and restored without producing JavaScript `Infinity`.
- Earning, buying businesses, employee hiring, stock purchases, recoveries and other cash transactions use the shared ledger, and next-wealth milestones continue beyond `Number.MAX_VALUE`.
- The cash ledger supports exponents up to `1e9` and approximately **14 significant digits**. This is extremely large but not mathematically infinite; at large scales, much smaller transactions can have no visible effect because of limited significant digits.
- Business revenue/expense calculations, stock prices, company valuations, loans and some gameplay analytics still use regular JavaScript `Number` values. The upgrade focuses on making the **cash ledger and wealth milestones** large-number-safe; complete arbitrary-precision finance simulation would require migrating these systems too.
- `state.cashHuge` is a string in existing local/cloud save payloads, so JSON serialization works without BigInt errors. The local save recovery mechanism remains in place.
- The late-game history chart switches to a logarithmic scale for extremely high cash or empire values.

To extend the economy, use `window.ProfitLandsMoney.gain(amount)`, `spend(amount)`, `canAfford(amount)`, `set(amount)`, and `netWorth(extraAssets)` rather than directly mutating `state.cash`.

### Endless empire progression

**ProfitLands has no final net-worth target.** The dashboard progress bar always points toward the *next* wealth milestone. Reaching one automatically advances it to a larger target, including after $1 trillion. No victory screen or forced reset is triggered.

The company ladder can still unlock its currently available corporations at $1 trillion, but it is not a game-ending tier. Wealth values above $1 trillion use readable units such as T, Qa (quadrillion), Qi (quintillion), and scientific notation for larger numbers.

**Technical note:** Cash now uses the large-number ledger, so it is no longer limited by JavaScript's 1.8e308 maximum. It still has an explicit exponent and significant-digit limit, and not every other game system uses the large-number format.

### Per-location management (v0.9)

Each business location now has **independent economics and management**, visible by opening a business card:

- **Upgrade location:** increases only that branch's level and revenue potential, priced for its local rent.
- **Local marketing:** raises only that branch's popularity and marketing effectiveness, priced for local demand.
- **Improve efficiency:** reduces only that branch's operating expenses, with a location-specific upgrade price.
- **Sell location:** removes only that branch, its staff and improvements, and returns a branch-specific resale value. Selling the last location closes the company.
- **Staff & manager:** hire employees in batches of 1, 5, 10 or 25 directly within each location. Each branch has its own employees, payroll, productivity and manager. Managers improve only their assigned branch.
- **Expansion:** adding a new location opens a fresh Level 1 branch with no employees or manager.

The existing Growth Center's employee tab now includes a location selector. Its total workforce allowance still scales with empire net worth, while each site's capacity starts at six employees and expands by six per location upgrade. Existing game saves are **migrated in place** the first time branch management loads: old company-wide upgrades are inherited by existing branches, and prior employees/manager move to the first branch. New branches do not inherit these improvements.

Existing economy, cloud save, and large-number cash systems remain compatible. Regression tests are in `tests/location-operations.test.cjs` and run alongside existing economy tests.

### Workforce progression

There are **two complementary limits**: a company can hire only the workers its own upgraded facilities can support, and the sum of workers in all companies cannot exceed the empire-wide cap.

Each new location starts with **6 employee positions** and gains **6 more for each upgrade level**. A company's total staffing capacity is the sum of its location capacities, subject to the shared empire-wide cap. Each individual location's capacity is capped at 5,000 positions.

| Empire net worth | Total employee allowance |
|---|---:|
| Starting empire | 12 |
| $10,000 | 25 |
| $100,000 | 60 |
| $1 million | 150 |
| $10 million | 400 |
| $100 million | 1,000 |
| $1 billion | 2,500 |
| $1 trillion | 10,000 |

The **Growth Center → Staff & Managers** panel shows the current company and empire limits, the next unlock, and a batch hiring selector. Hiring consumes one management action per batch of up to 25 workers; each successive worker costs a little more to recruit. Wages apply continuously and productivity gains taper off as teams become very large. If net worth falls and the global cap drops, existing workers remain employed, but additional recruitment is blocked until there is room.

### Automatic market cycles and faster turns (v1.2)

The **Next Cycle** button has been removed. Market cycles now advance only when their countdown expires. Market effects, stock changes, events, loan timers, and action budgets continue updating automatically. Real-time earnings remain separate and are not paid again at cycle boundaries.

Each world mode has a **10× larger action pool** and **10× faster active-play regeneration**. Existing saves are migrated one time using `actionCapacityVersion: 2`: remaining old actions multiply by 10 without altering cash, companies, or market progress. The new limits also apply on each automatic cycle reset. Actions still do not accumulate while the game is hidden in the background.

### Action balance

| Mode | Market cycle | Max actions | Active-play action refill |
|---|---:|---:|---:|
| Fast | 5 minutes (automatic) | 40 | 9 seconds |
| Standard | 15 minutes (automatic) | 60 | 12 seconds |
| Long | 1 hour (automatic) | 100 | 18 seconds |
| Persistent | 24 hours (automatic) | 120 | 30 seconds |

Cash earned per **active minute** is independent of mode. Market cycle duration changes market refresh and action resets, not the real-time income formula.

### Running tests

The automated regression suite runs with Node.js 22 or newer and no third-party packages:

```sh
node --test tests/economy-balance.test.cjs
```

Tests cover all four mode calculations, action regeneration, earnings adjustments for all eight business industries, initiative expiry, achievement rewards, bounded chart history and local save backup recovery. GitHub Actions runs these tests automatically.

## Current prototype

- Singleplayer and multiplayer setup modes
- Fast, Standard, Long, and Persistent worlds
- Four automatic market-cycle lengths with 10× larger action limits
- Multiple business types with different economics
- **Real-time net cash flow:** owned businesses, corporations, and property generate or lose cash every second while you're playing
- Operating revenue and expenses are calculated together, so unprofitable companies drain cash too
- Every 60 seconds of active play realizes one previous "daily profit" unit; this makes earnings continuous while maintaining the economy's cost structure
- Day/market cycles still update news, stocks, popularity, and action budgets, but **do not pay an extra profit lump sum**
- No unlimited offline earnings: inactive/hidden tabs do not accumulate long catch-up payouts
- Business upgrades
- Marketing and efficiency upgrades
- 10× original-price chain expansion
- Multiple locations per business
- Stocks with changing prices
- Property
- Research and market trends
- News/events
- Financial warnings and bankruptcy/crisis conditions
- Endless wealth progression: completing one wealth milestone automatically reveals the next ($1T → $10T → $100T → $1Qa → …)
- Local browser save
- Responsive interface

## World modes

| Mode | Day length | Actions/day |
|---|---:|---:|
| Fast | 5 minutes | 40 |
| Standard | 15 minutes | 60 |
| Long | 1 hour | 100 |
| Persistent | 24 hours | 120 |

Each world mode can be started as **Singleplayer** or the current **Multiplayer prototype**. Mode day lengths still determine when market news, stock prices, and the action budget refresh; passive business cash flow is independent of day boundaries.

## Business system

Businesses are not generic income generators. Each type has its own starting cost, revenue, expenses, volatility, and description. Examples include coffee shops, restaurants, game stores, hotels, car dealerships, factories, software companies, and logistics companies.

A business can be upgraded and expanded into a chain. Opening the second location costs **10× the original business purchase price**. Later locations become progressively more expensive.

Net profit changes as market conditions, location demand, wages, rent, supply pressure, and popularity fluctuate. Cash balances update every second during active play. Market cycles now advance automatically when the timer reaches zero, refreshing the economy and action budget without requiring a button or awarding duplicated income.

## Multiplayer note

The multiplayer option is currently a **local prototype/setup layer**. Real-time internet multiplayer requires an online backend, accounts, synchronization, and a shared-world server. Those systems are intentionally separate from this client-side prototype so the core economy can be tested first.

## Future systems

Potential future versions can add real online multiplayer, accounts, persistent shared worlds, player-to-player trading, loans, corporate acquisitions, alliances, supply chains, diplomacy, sabotage/defense, leaderboards, and deeper AI competitors.
