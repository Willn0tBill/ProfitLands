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
4. Check the browser console for runtime errors and verify that no external
   sign-in or cross-game promotion appears.
5. Obtain Developer Portal QA approval. Build/test success alone does not
   establish acceptance, Full Launch eligibility, or real APS synchronization.

Official documentation:
- https://docs.crazygames.com/requirements/intro/
- https://docs.crazygames.com/requirements/technical/
- https://docs.crazygames.com/requirements/gameplay/
- https://docs.crazygames.com/other/aps/

## Baseline regression note

The full legacy suite has nine failures in the unchanged `main` branch,
including economy action-budget and workspace layout tests. These are not
addressed by this platform-only PR. New CrazyGames tests run separately, and
the full suite still runs to detect unexpected additional failures.
