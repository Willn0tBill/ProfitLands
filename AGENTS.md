# ProfitLands agent guidance

- The public site is a static browser game. Keep `index.html`, `play/`, `preview/` and `settings/` working as ordinary paths.
- Use Cloudflare for static frontend hosting and caching. The existing Firebase Auth/Firestore/Cloud Functions systems remain authoritative for cloud saves and multiplayer unless a separate migration is explicitly requested.
- Build the Cloudflare-safe public directory using `npm run build:cloudflare`; publish only `dist/`, never the repository root.
- `wrangler.jsonc` configures Workers Static Assets. Cloudflare Pages may instead build `dist/` from GitHub.
- Never place API secrets, Cloudflare tokens, Firebase service-account keys, Firestore admin credentials or local `.env` files in frontend source or Git.
- Do not deploy to production, enable billing, migrate databases, or alter authenticated game saves without appropriate authorization and verification.
- Preserve all gameplay formulas, local save compatibility and account data while working on deployment infrastructure.
- Before releases, validate landing, gameplay, preview, settings, guest saves, Firebase login and the presence of all referenced static assets.
