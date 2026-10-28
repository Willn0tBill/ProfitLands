# ProfitLands

**A WtvStudios game**

> Build. Invest. Compete.

ProfitLands is a browser-based financial and empire-building strategy game prototype. You start with **$1,000** and expand your empire as far as the economy can grow. **There is no final $1 trillion win condition.**

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
