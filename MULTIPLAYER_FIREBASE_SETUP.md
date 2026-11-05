# ProfitLands World 1 — Free Cloudflare multiplayer setup

**No Firebase Blaze plan or Cloud Functions deployment required.**

This game uses Firebase Spark for Email/Password accounts and private singleplayer saves. The new multiplayer backend in the cloudflare/ directory runs on Cloudflare Workers Free + D1 Free. Purchases, money, rankings and PvP are validated on that backend. GitHub Pages can host the game, but does **not** deploy the multiplayer service.

Free plans have daily usage limits; exceeding those limits can temporarily stop the service. Account sign-up or acceptance of the service agreement may require a parent/guardian.

## 1. Keep Firebase free

Open https://console.firebase.google.com/project/wtvstudios-5b40f/overview

- Authentication → Sign-in method: enable **Email/Password**.
- Authentication → Settings → Authorized domains: add **willn0tbill.github.io**.
- Keep your existing Firestore rules restrictive. Do not make the database public.
- Stay on **Spark**; do not enable Cloud Functions billing for World 1.

## 2. Set up Cloudflare

Use an account on the Cloudflare Free plan. If needed, ask a parent or authorized adult to be the account holder. Open https://dash.cloudflare.com/ and create a **D1 SQL database** named **profitlands-world1** if you do not already have it.

You do not need to manually create a Worker if you deploy it through the commands below. If one named **profitlands-world1** exists, deployment can update it.

## 3. Deploy from PowerShell

Install Node.js 22+ and Git. In Windows PowerShell:

~~~powershell
git clone https://github.com/Willn0tBill/ProfitLands.git
cd ProfitLands\cloudflare
npm install
npx wrangler login
npx wrangler d1 list
~~~

If the database is not listed:

~~~powershell
npx wrangler d1 create profitlands-world1
~~~

Copy the D1 database UUID shown by Wrangler or in the Cloudflare Dashboard. Edit **cloudflare/wrangler.toml** and replace the placeholder database_id with your actual D1 UUID. Keep the binding **DB** and Worker name **profitlands-world1** as they are.

Initialize the server's production database and deploy:

~~~powershell
npx wrangler d1 execute profitlands-world1 --remote --file=./schema.sql
npx wrangler deploy
~~~

The deployment will display a public address similar to:

~~~text
https://profitlands-world1.YOUR-SUBDOMAIN.workers.dev
~~~

Do **not** send anyone your account password, API token or private credentials. The public Worker address is safe to share.

## 4. Connect the game website

Edit the repository's **world1-config.js** to set this line to the public URL that Wrangler printed:

~~~js
window.PROFITLANDS_WORLD1_ENDPOINT='https://profitlands-world1.YOUR-SUBDOMAIN.workers.dev';
~~~

Commit that public configuration edit to GitHub. Wait for GitHub Pages deployment to succeed. The browser adapter deliberately accepts only a secure URL for the expected profitlands-world1 Worker name, preventing accidental Firebase ID token disclosure to arbitrary servers.

Check your server by opening:

~~~text
https://profitlands-world1.YOUR-SUBDOMAIN.workers.dev/health
~~~

Expected JSON contains **ok: true**, **worldId: world1** and **chatEnabled: false**.

Open https://willn0tbill.github.io/ProfitLands/ and sign in. Choose **Set Up New Empire → World 1 Multiplayer → Start New Empire → World → Connect to World 1**. Buy a Coffee Shop, select **Refresh World**, and check that the server-side balance and business list update. Online money is completely separate from local singleplayer progress.

## Troubleshooting

- **Server not configured:** the public URL is still blank in world1-config.js, invalid, or not published to GitHub Pages.
- **401 / account error:** verify Firebase Email/Password login and the authorized GitHub Pages domain. The Worker verifies signed Firebase ID tokens.
- **503:** confirm the D1 binding is named **DB**, that schema.sql ran against the **remote** database, and that you have not exceeded a free usage limit. Inspect Cloudflare Worker logs.
- **403:** Cloudflare allows only the GitHub Pages site and localhost development origins; never make the API public-write to work around this.
- **World chat:** deliberately disabled until moderation and reporting exist.
- **PvP:** opt-in with new-player protection, cash costs, shields, and cooldowns. Firebase clan memberships do not yet sync to Cloudflare, so do not assume automatic same-clan exemptions.
- **Old World 1 state:** Firebase Cloud Functions world records are not automatically migrated into D1. New players begin with the standard online starting cash.

## Local tests

From the repository root:

~~~powershell
node --test
~~~

From the cloudflare/ directory:

~~~powershell
npm test
~~~

Cloudflare checks all paid game actions with server-held state and transaction receipts. A versioned single D1 row provides atomic compare-and-swap updates to purchases and both sides of PvP actions. The backend verifies Firebase JWT signatures using Google's published public keys. There are no Firebase Admin keys in this repository.

Official references: https://developers.cloudflare.com/d1/get-started/ and https://firebase.google.com/docs/auth/admin/verify-id-tokens
