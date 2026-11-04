# ProfitLands on CrazyGames

This is a **separate HTML5 upload target**. The ordinary GitHub Pages site and
Steam desktop host continue to use the original entry points, cloud saves, and
the same game engine.

## Generate a release

From the repository root, with Node.js 22 or newer:

```sh
node --test tests/crazygames-integration.test.cjs
node scripts/build-crazygames.cjs
```

The resulting `dist/crazygames/` directory contains `index.html`, the game
JavaScript/CSS, and the CrazyGames adapter. Zip the **contents** of that
directory so `index.html` is at the root of the upload.

Alternatively download the `profitlands-crazygames-html5` artifact from the
**Build ProfitLands for CrazyGames** GitHub Actions run. It contains the
generated upload files.

## What changes in the CrazyGames build

- Game immediately starts or resumes at the default singleplayer world.
- Existing `profitlands-v2` local save format remains authoritative. The
  CrazyGames **Automatic Progress Save (APS)** service can back up localStorage
  for signed-in players; this release intentionally does **not** also use the
  SDK Data module for the same save to avoid conflicting versions.
- SDK v3 gameplay-start/gameplay-stop events are sent when the SDK is available.
- CrazyGames username/avatar display when available; guests play normally.
- Firebase login UI and Firebase network scripts are excluded only from this
  build. Cross-promotion links and unfinished multiplayer choices are hidden
  or omitted.
- First-time players get a compact, dismissible four-goal guide (open a business, inspect it, improve it, explore stocks). It reads current game progress, stores only guide preferences under `profitlands-cg-guide-v1`, and cannot grant cash or change game-save data. Returning players can reopen it with **Getting started**.
- The v1.8 in-game Settings panel offers a manual local save and displays recovery information. File import and export are intentionally disabled in CrazyGames mode because its own APS service manages progress.
- No ads or in-game purchases are integrated. Ads are disabled for Basic Launch.

## Local testing

Serve the generated folder over HTTP, for example:

```sh
cd dist/crazygames
python -m http.server 8080
```

Visit `http://localhost:8080`. The generated platform marker enables
CrazyGames mode in local preview. SDK v3 only works on allowed domains or
supported local environments; for a real check, upload the game to the
CrazyGames Developer Portal preview.

**Do not upload the normal GitHub Pages root folder**. Its home page and
Firebase login are deliberately different.

## Before actual submission

1. Test a fresh game, a saved game, reload, browser tab closing, and a damaged
   save recovered from `profitlands-v2-backup`.
2. In CrazyGames Preview, test the SDK gameplay events, APS backup/restore,
   signed-in CrazyGames username/avatar, and guest play across devices.
3. Test browser iframes at 907×510, 821×462, 1216×684, mobile landscape
   800×450, and a Chromebook-sized display. Confirm controls and the actual
   game remain usable, with no horizontal clipping.
4. Try the optional guide on a fresh save: buy a Coffee Shop, open its management,
   purchase a real improvement, and visit the Stocks workspace. Check that goals
   advance only when the player completes the corresponding in-game action.
5. Check the browser console for runtime errors and verify that no external
   sign-in or cross-game promotion appears.
6. Obtain Developer Portal QA approval. Build/test success alone does not
   establish acceptance, Full Launch eligibility, or real APS synchronization.

Official documentation:
- https://docs.crazygames.com/requirements/intro/
- https://docs.crazygames.com/requirements/technical/
- https://docs.crazygames.com/requirements/gameplay/
- https://docs.crazygames.com/other/aps/

## Baseline regression note

Historically, `main` had nine stale regression expectations from
older gameplay and UI designs (variable action regeneration, full market-cycle
refills, and dashboard/workspace v1). The historical regression tests were corrected without changing the economy
formulas or workspace implementation. This branch now also includes the
verified v1.8 Save & Recovery and v1.9 portfolio performance updates. The combined suite passes **190/190**
automated tests in GitHub Actions. CrazyGames Preview account-save testing remains required.

## Local browser smoke test — November 3, 2026

A clean-profile Chrome 156 run on Windows tested a **generated upload package**, not the standard website:

- Fresh-start gameplay and workspace initialization with the four-goal guide visible.
- Open the enhanced business shop, buy a Coffee Shop, and inspect its management panel.
- Purchase actual **per-location marketing** and verify starter progress advances to markets, then 4/4 goals complete.
- Save, reload, and verify the business, marketing upgrade, running game, and returning-player guide preferences persist.
- Inspect 800×450 mobile landscape and 907×510 iframe-sized viewports: no horizontal document overflow and the guide button is accessible.
- Boot in an actual 800×450 sandboxed iframe (`allow-scripts allow-same-origin`) and verify game, workspace, and guide scripts initialize.
- After adding the local favicon, **zero Chrome runtime/console errors** occurred during this smoke test.

This does **not** verify CrazyGames production SDK behavior, APS account synchronization across devices, ad integration, or the Developer Portal review. These require a real authenticated portal preview and must be checked before publishing.

## v1.9 portfolio performance compatibility

- Large portfolios show the first **36** company cards, with a persistent company/industry search field and a **Show more companies** button. Filtering retains the original company index and does not change game state, earnings or saved progress.
- The HUD avoids repeated net-worth calculations; hidden workspace panels are no longer rebuilt every five seconds and instead refresh when opened. Actual 500 ms income settlement and action regeneration are unchanged.
- The normal website's performance changes were smoke-tested in clean-profile Chrome with 100 sample companies, company search, management navigation, and a 390-pixel mobile viewport.
- The combined **CrazyGames** branch passes 190/190 automated regression tests and a successful packaging build. A fresh authenticated Developer Portal preview test is **still required**; browser QA from the normal website does not substitute for a CrazyGames production SDK or APS test.

## v2.0 real-time income performance

The CrazyGames package now includes the independently tested v2.0 income calculation refactor: a fresh shared set of market modifiers and company factors is created once per portfolio evaluation rather than recomputing total net worth for every single location. A 10,000-location portfolio that previously requested the wealth tier about 20,000 times during one profit pass now requests it once. Income formulas, gameplay settlement frequency, saved-game schema, achievements and the CrazyGames SDK/APS adapter are unchanged.

Regression tests compare the optimized math with the complete original formula across all industries, older company states, changing world events, and half-second income settlement. A separate clean-profile Chrome stress run on the main website covered 100 companies with 100 locations each. **A new CrazyGames Developer Portal preview test remains necessary before submission**; standalone automated tests do not verify actual APS synchronization.

## v2.0.1 company management scaling

Large companies now manage locations in groups of 24 with search by district/name/location number and Previous/Next buttons. Original site indexes remain stable for upgrades, payroll, staffing and sales; focused sites stay visible after updates. Income previews use one fresh **company-specific** economic context per visible page rather than re-running wealth-tier calculations for each action. Mobile paging controls fit a 390-pixel viewport.

The standalone browser test with a 10,000-location company confirmed search/editing of Site 8766, correct displayed income, and no runtime errors. The combined CrazyGames branch passes **190/190** automated tests and successfully builds an isolated HTML5 ZIP. This does not replace required authenticated CrazyGames Developer Portal APS and mobile-device testing before publication.

## v2.0.2 bug fixes and mobile UI QA

The CrazyGames draft incorporates the verified fixes from main: reliable save-write verification, safe handling of legitimate debt and large-company snapshots (without enabling file import/export under CrazyGames APS), refreshed stock affordability, disabled trade controls when out of actions, and a review prompt after market-price changes. Mobile trade dialogs now position the stock price below the Close button, with accessible close labels; fractional per-second location earnings are shown accurately.

The reconciled branch passes **190/190 automated Node tests** on the development Windows PC. Its standalone build produces **71 packaged files** (approximately 495 KB uncompressed). The normal-site clean-profile Chrome QA tested the main fixes at 320px, 390px, 768px and desktop widths. **These do not replace a CrazyGames Developer Portal test with real APS login and cross-session persistence.** This release remains draft and unpublished.

## v2.0.3 repeat district and modal UI fixes

Businesses can now open more than one branch in each district, with unique branch names and independent staff/upgrade/inventory state. Expansion uses the existing cash/action price formula and refuses growth beyond Save Center's supported 50,000-per-company/100,000-empire limits. The new branch opens directly in management. The district picker forecasts profit in dollars per second from a fresh company-specific market context. Management's mobile header is spaced clear of its Close button, with a visual highlight for the selected site.

Quick Switch now keeps Tab/Shift+Tab inside its dialog and prevents Escape from dismissing a lower game modal. The CrazyGames-specific external-link restrictions in Quick Switch remain intact.

The combined branch passes **190/190** automated regression tests. Normal-site Chrome verified district reuse, new-branch management, Quick Switch keyboard behavior, and the compact 390px layout. **CrazyGames Developer Portal APS persistence and real platform SDK preview remain unverified.** This release remains unpublished.
