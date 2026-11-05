# ProfitLands World 1 — Firebase deployment checklist

**Status:** Client and server code are included in this repository. Deploying GitHub Pages does **not** deploy Cloud Functions or Firestore Rules. World 1 is not live until the function can be reached and accounts can sign in.

## 1. Check the existing Firebase project

Open [Firebase Console — wtvstudios-5b40f](https://console.firebase.google.com/project/wtvstudios-5b40f/overview).

- **Authentication → Sign-in method:** enable **Email/Password**.
- **Authentication → Settings → Authorized domains:** authorize \`willn0tbill.github.io\`. Use the host only, not \`/ProfitLands\`.
- **Firestore Database:** create the **default database** if it does not exist. The callable server uses Firebase Admin's default Firestore instance.
- **Usage and billing:** production Cloud Functions require the **Blaze (pay-as-you-go)** plan. This can incur charges. A parent or another authorized adult should review billing, cost alerts and budget controls before activation. Do not assume a free allowance guarantees a $0 bill.
- **App Check and security:** do not weaken Firestore rules or create an anonymous Firestore writer just to make multiplayer connect.

## 2. Deploy from the repository on your own computer

Use a current Node.js version compatible with the project's \`functions/package.json\` (**Node 22**), then open PowerShell:

\`\`\`powershell
git clone https://github.com/Willn0tBill/ProfitLands.git
cd ProfitLands
npm install -g firebase-tools
firebase login
firebase use wtvstudios-5b40f
npm install --prefix functions
node --test
npm run test --prefix functions
\`\`\`

The repository already has \`firebase.json\` and \`.firebaserc\` for the project. **Do not rerun \`firebase init\` or choose a different Firebase project.**

Review the current production rules in Firebase Console before overwriting them. To deploy the repository's rules:

\`\`\`powershell
firebase deploy --only firestore:rules --project wtvstudios-5b40f
\`\`\`

Then deploy the callable game server:

\`\`\`powershell
firebase deploy --only functions --project wtvstudios-5b40f
\`\`\`

The only function codebase configured in this repository is \`world1\`.

**Expected deployment:** second-generation callable function \`worldApi\`, region \`us-west1\`, Node 22, backed by Firestore. The source is \`functions/index.js\` and the region must match \`firebase-world-adapter.js\`. Do not change either side independently.

## 3. Confirm the server is live

1. In Firebase Console open **Build → Functions** (or the Functions page under the current sidebar organization). Locate \`worldApi\` in **us-west1** and check that deployment succeeded.
2. Open the GitHub Pages site: https://willn0tbill.github.io/ProfitLands/
3. Sign in or create an account on the homepage.
4. Choose **Set Up New Empire → World 1 Multiplayer → Start New Empire**.
5. In the **World** screen, click **Connect to World 1**. The client first calls \`health\` and expects \`{ok:true,worldId:'world1'}\`, then calls \`register\` using the signed-in Firebase user.
6. Buy a low-cost online business and refresh World 1. Confirm its server-owned balance changes independently of the local singleplayer save. Test with two authorized accounts before public launch.

**Note:** World chat is explicitly disabled (\`CHAT_ENABLED=false\`) in the backend until reporting, blocking, moderation and policies are reviewed. Do not turn it on merely to make the rest of multiplayer function.

## 4. Troubleshooting by error

- **"Please sign into your ProfitLands account."** Check Email/Password provider and authorized domains. Confirm the account is signed in on the exact site being used.
- **"Firebase multiplayer functions are not configured"** Check browser SDK and \`firebase-config.js\` scripts, \`firebase-functions-compat.js\`, and any script-blocking errors in Developer Tools.
- **"internal" / "not-found" / "unavailable" / CORS error:** Check that \`worldApi\` exists in \`us-west1\`, was deployed to \`wtvstudios-5b40f\`, and is reachable from \`https://willn0tbill.github.io\`. The function's CORS allowlist is intentionally restricted to the GitHub Pages host and localhost.
- **"permission-denied" in Firestore:** Browser rules block direct access to \`/worlds\` by design. World writes must happen through the callable function using the Admin SDK. Verify Auth ID tokens, function service account permissions and server logs; **do not** add \`allow write: if true\`.
- **"World 1 is not configured":** Check that \`health\` returned the exact \`world1\` ID and inspect function logs.
- **"World 1 alpha is full":** The backend has a player cap. This is intentional; inspect \`functions/world-core.js\` before adjusting.
- **Accounts work, multiplayer does not:** Firebase Auth + cloud saves can function while the Cloud Function is absent. Deploying the static site is not enough.

To review errors, use the Cloud Functions **Logs** view in Firebase Console. For a local server test, the Firebase Local Emulator Suite can be started from the root with:

\`\`\`powershell
firebase emulators:start --only auth,functions,firestore --project wtvstudios-5b40f
\`\`\`

For local testing, the web client must also be explicitly pointed at the relevant emulators. Do not aim a local test at the production database by mistake.

## 5. Security and cost checklist

- Keep all server-side Admin SDK code in \`functions/\`, never in browser JS.
- Never commit service account JSON, API credentials for privileged servers, or billing data. The existing Firebase Web App configuration is a public client configuration, not an Admin SDK secret.
- Keep \`firestore.rules\` restrictive. \`/worlds\` is intentionally unavailable to ordinary browser writes.
- Check quotas, cost alerts, and usage limits, particularly before making the service public.
- Never publish World chat without a working abuse-reporting and moderation system.
