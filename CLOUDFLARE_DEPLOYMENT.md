# ProfitLands — Cloudflare Free deployment

## Current architecture

ProfitLands is a static HTML/CSS/JS game. **Cloudflare hosts the public website only**. Firebase remains the independent authentication, private cloud-save, and (when enabled) multiplayer backend. Do not delete Firebase rules, databases, Cloud Functions, or the existing `profitlands-world1` Cloudflare Worker.

The Cloudflare account already has a Worker named `profitlands` connected to this GitHub repository. **Use the existing Worker instead of creating a duplicate Pages project**. The separate `profitlands-world1` Worker is not part of this static-site deployment.

## Free plan constraints

- Host frontend HTML, CSS, and JS as Cloudflare Workers Static Assets. Static-asset requests are free and unlimited within current platform limits.
- Keep all paid products, billing upgrades, and paid resources disabled.
- Do not enable Firebase Blaze just to make the multiplayer Cloud Function work. A free static deployment does **not** activate or repair multiplayer.

## Build

Requires Node.js 20+:

```sh
npm install
npm run build:cloudflare
```

The `postinstall` script also generates the `dist/` folder automatically to help existing Cloudflare Workers Builds installations where the Build Command is left empty. `dist/` contains only public website assets, including the entry points `/play/`, `/preview/`, and `/settings/`. The `functions/` backend, tests, GitHub automation files, and sensitive local files are not copied.

You can verify the Workers configuration without uploading:

```sh
npx wrangler deploy --dry-run
```

## Deploy from existing Git integration (preferred)

In the Cloudflare dashboard open **Workers & Pages → profitlands → Settings → Builds**, and verify:

- Git repository: `Willn0tBill/ProfitLands`
- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Wrangler name in `wrangler.jsonc`: `profitlands`

Cloudflare Workers Builds may fail with a missing output directory or an incorrect root/configuration. The build's detailed logs, not GitHub's summary check, are the authority for the failure reason. Do not change the `profitlands-world1` settings, database bindings, or deployment.

Once the Cloudflare build succeeds, open the Worker URL and verify the homepage and game subpages.

## Deploy from the authenticated CLI (alternative)

```sh
npm run build:cloudflare
npx wrangler login
npx wrangler deploy
```

This needs a browser OAuth authorization. **Do not share API tokens or passwords.** The Cloudflare account owner approves the login in their browser. Deploying with Wrangler should target only the existing `profitlands` Worker, not `profitlands-world1`.

## Firebase login on the new domain

If the game is served on `profitlands.winotbill.workers.dev`, add that **exact domain** to Firebase Console → Authentication → Settings → Authorized domains. Then test sign-in, sign-out, guest games and cloud saves. Existing browser-local saves are origin-specific and do not automatically follow the user to a different domain. Verify backup/recovery before switching the primary domain.

The Firebase `worldApi` multiplayer Cloud Function has separate billing/deployment requirements. Do not deploy or enable it under a zero-dollar-budget constraint.

## Smoke tests

1. Check `/`, `/play/`, `/preview/`, and `/settings/` all return HTML.
2. Verify every referenced stylesheet and script loads (no 404s).
3. Test new game, continuing a game, and guest local storage.
4. Test Firebase auth and cloud saves only after domain authorization.
5. Confirm no paid Cloudflare/Firebase resources were turned on.

## Local Codex integration

The official Cloudflare agent instructions are at https://developers.cloudflare.com/agent-setup/prompt.md. Cloudflare skills are installed locally under Codex skills, and the Cloudflare MCP server is registered at `https://mcp.cloudflare.com/mcp`. An account-owner OAuth login is required to use the MCP; restarting Codex loads the skills.

The optional Cloudflare `cf` beta CLI is not required.
