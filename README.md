# ProfitLands

**A WtvStudios game**

> Build. Invest. Compete.

ProfitLands is a browser-based financial and empire-building strategy game prototype. You start with **$1,000** and expand your empire as far as the economy can grow. **There is no final $1 trillion win condition.**

## Version 0.8 — Business Expansion

The main game now includes a **Growth Center** in `/play/` with four sections:

- **Analytics** — live, saved history of cash, empire value and net flow per second. History retains the latest 120 samples (roughly ten minutes of active play).
- **Employees and managers** — company hiring capacity grows with its level and number of locations, while a shared empire-wide workforce limit expands with net worth. Hire 1, 5, 10, or 25 employees per action. Productivity has diminishing returns and every worker adds ongoing payroll costs. Managers add a productivity bonus, ongoing salary and popularity maintenance during active play.
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

### Workforce progression

There are **two complementary limits**: a company can hire only the workers its own upgraded facilities can support, and the sum of workers in all companies cannot exceed the empire-wide cap.

A new company starts with 6 positions, gaining **6 additional positions per company level** and **12 additional positions for each new location**. Company capacity is capped at 5,000 to keep very large saves manageable.

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

### Action balance

| Mode | Market cycle | Max actions | Active-play action refill |
|---|---:|---:|---:|
| Fast | 5 minutes | 4 | 90 seconds |
| Standard | 15 minutes | 6 | 120 seconds |
| Long | 1 hour | 10 | 180 seconds |
| Persistent | 24 hours | 12 | 300 seconds |

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
- Four different day lengths and action limits
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
| Fast | 5 minutes | 4 |
| Standard | 15 minutes | 6 |
| Long | 1 hour | 10 |
| Persistent | 24 hours | 12 |

Each world mode can be started as **Singleplayer** or the current **Multiplayer prototype**. Mode day lengths still determine when market news, stock prices, and the action budget refresh; passive business cash flow is independent of day boundaries.

## Business system

Businesses are not generic income generators. Each type has its own starting cost, revenue, expenses, volatility, and description. Examples include coffee shops, restaurants, game stores, hotels, car dealerships, factories, software companies, and logistics companies.

A business can be upgraded and expanded into a chain. Opening the second location costs **10× the original business purchase price**. Later locations become progressively more expensive.

Net profit changes as market conditions, location demand, wages, rent, supply pressure, and popularity fluctuate. Cash balances update during play rather than waiting for you to press Next Cycle. That button changes markets and refreshes actions; it does not duplicate earnings.

## Multiplayer note

The multiplayer option is currently a **local prototype/setup layer**. Real-time internet multiplayer requires an online backend, accounts, synchronization, and a shared-world server. Those systems are intentionally separate from this client-side prototype so the core economy can be tested first.

## Future systems

Potential future versions can add real online multiplayer, accounts, persistent shared worlds, player-to-player trading, loans, corporate acquisitions, alliances, supply chains, diplomacy, sabotage/defense, leaderboards, and deeper AI competitors.
