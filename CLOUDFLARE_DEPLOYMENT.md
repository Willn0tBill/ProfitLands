# ProfitLands — Cloudflare setup

The public game is plain HTML/CSS/JavaScript. Cloudflare can host the frontend without rewriting it. **Firebase remains the account, save, and multiplayer backend.** Do not delete its rules, Cloud Functions, or authentication setup.

## Build and check

Use Node.js 20 or newer:

```sh
npm run build:cloudflare
```

This creates `dist/` with the website only (including `/play/`, `/preview/` and `/settings/`). It deliberately leaves out `functions/`, `tests/`, `.github/`, docs, local configuration and development files. Do not select the repository root as a public output directory.

## Option A — Cloudflare Pages with GitHub (recommended for automatic updates)

1. In the Cloudflare dashboard, go to **Workers & Pages → Create application → Pages → Connect to Git**.
2. Authorize the GitHub integration for `Willn0tBill/ProfitLands`.
3. Set production branch to `main` after reviewing and merging this setup change.
4. Set the framework preset to **None**, the build command to `npm run build:cloudflare`, and the build output directory to `dist`.
5. Deploy. Visit the assigned `*.pages.dev` domain and test the homepage, `/play/`, `/preview/`, and `/settings/`.

Cloudflare Pages can automatically redeploy whenever `main` changes. The Cloudflare dashboard connection requires an account authorization; no secrets should go in GitHub.

## Option B — Workers Static Assets via Wrangler

Cloudflare's supported Workers Static Assets flow is also configured in `wrangler.jsonc`.

```sh
npm run build:cloudflare
npx wrangler login
npx wrangler deploy
```

Approve the OAuth browser flow when prompted. The first successful deploy provides a Workers URL. Use this path instead of Pages if you specifically prefer Workers. **Do not deploy both by accident** and assume they are automatically synced.

## Firebase after changing the game domain

If you use Firebase sign-in on the new domain, open Firebase Console → Authentication → Settings → Authorized domains, and add the exact Cloudflare hostname. Verify sign-in, sign-out and cloud saves from that hostname. Firebase config values in browser code are public project identifiers, not service-account credentials; server credentials must never be in the browser or deployment output.

Firebase's `worldApi` multiplayer Cloud Function is **not** hosted or activated by Cloudflare. Deploying the static website will not make it work: review `WORLD1_DEPLOYMENT.md`, the Firebase rules, and Cloud Function deployment prerequisites. Avoid enabling paid Firebase services or billing without separate authorization.

## Prelaunch smoke checks

- Homepage loads and **Continue Your Empire** checks the current hostname's local storage.
- `/play/?new=1` starts without replacing an existing save unexpectedly.
- All CSS and JS resources load without 404 errors.
- Guest singleplayer works; Firebase authentication and cloud-save behavior are tested separately.
- Review the free-tier limits in your Cloudflare account and confirm no paid resources are enabled.

## Codex agent integration (local PC)

Cloudflare's official agent instructions: https://developers.cloudflare.com/agent-setup/prompt.md

Install the official Cloudflare skills and add the remote MCP server for Codex. In Codex's MCP configuration the server URL is:

```text
https://mcp.cloudflare.com/mcp
```

Complete Cloudflare OAuth authorization in the browser. Restart Codex so it loads the updated skill and MCP configuration. The optional `cf` beta CLI is not needed for this deployment.
