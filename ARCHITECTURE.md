# ProfitLands — Site architecture

## URLs
| URL | File | Responsibility |
|---|---|---|
| `/ProfitLands/` | `index.html` + `landing.js` | Lightweight public landing page, world selection and links |
| `/ProfitLands/play/` | `play/index.html` + game scripts | Actual gameplay, account, cloud/local saves, economic simulation |
| `/ProfitLands/settings/` | `settings/index.html` + `ui-preferences.js` | Browser display/accessibility preferences |

URLs work as ordinary GitHub Pages folders with `index.html` inside them. No server-side routing, paid framework, or Java compilation is required.

## Separation of concerns

**HTML:** Defines the structure of pages and permanent controls. The game HTML owns the economy, bank and major-company panels, their labels, and their value placeholders.

**CSS:** Controls layout, themes, responsive behavior and accessibility. `site-pages.css` is shared by landing, play and settings. Other CSS is loaded only on the game route.

**JavaScript (not Java):** Reads inputs, calculates game state and updates existing HTML. Repeated, variable-length items (such as business cards, stock holdings, company lists and market events) are intentionally created from arrays; static interface sections should not be rebuilt every tick.

## Game entry points and responsibilities
- `app.js`: base game state, world modes, purchases, market data, local save key `profitlands-v2`, and normal start/resume/end flow.
- `economy-system.js`: economic model, real-time net income, market cycles, event generation, loans and bankruptcy rules.
- `economy-render.js`: dynamic companies, finance, holdings and management views.
- `enhancements.js`: locations, chain expansion and supplemental management interactions.
- `firebase-auth.js`: login, account identity and cloud saves. It is loaded **only** in the game, not on the public homepage.
- `landing.js`: selects play settings and previews local saves without importing the simulation.
- `play-route.js`: maps links and selected mode/type into the game; **never overwrites saved games automatically**.
- `ui-preferences.js`: small, standalone script that reads display checkboxes and stores only UI preferences.

Other scripts provide specialized UI modules. Their existence doesn't by itself slow down gameplay; performance depends on network size, executed work, rendering and repeated DOM changes.

## Rendering conventions
1. Keep permanent layout in `play/index.html` or `settings/index.html`.
2. Update permanent values with `textContent`, `classList`, `style` or form fields.
3. Render variable-length collections in dedicated functions and avoid calling full renders every half-second.
4. Do not treat unsanitized user content as HTML. Prefer `textContent` for player names and notes.
5. Keep `save()` and `resumeProfitLands()` compatible with the existing `profitlands-v2` schema.

## Continuous cash-flow behavior
- Business **net** profit already includes revenue and operating expenses.
- Cash updates during active gameplay, rather than being paid in a lump sum by `Next Cycle`.
- The existing per-day profit unit accrues over **60 seconds of active gameplay**.
- The market cycle still updates stock prices, events, demand and action budgets.
- Inactive/hidden tabs do not receive unlimited offline back pay.
- Display preferences are independent of saved game progress.

## Extending the project
- New permanent page: create `feature/index.html`, link it from page navigation, and load only the required CSS/JS files.
- New business: add its economics to `BUSINESS_TYPES` in `app.js`, then ensure economy risk and rendering support it.
- New game setting: add the input to `settings/index.html` and its explicit key in `ui-preferences.js`.
- New dashboard readout: add its HTML element under `play/index.html` and update it from a render function.

## Still to modularize
This is an **incremental** cleanup, not a complete rewrite. Business/shop/account dialogs and market card collections still use templates inside JavaScript. A future cleanup can move static dialog shells into HTML and divide simulation, networking and presentation into separate directories as regression tests are added. Doing this gradually protects working accounts and saved games.
