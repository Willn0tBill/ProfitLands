# ProfitLands Clans — online setup

The game's Clans Hall supports signed-in users creating a clan, joining an existing clan by its **public clan ID**, viewing up to 50 roster entries, leaving, and disbanding an empty clan as founder.

## Cloud requirements

Clans use the existing Firebase Authentication and Cloud Firestore project, **wtvstudios-5b40f**, already configured by ProfitLands. They do **not** use the local empire save. No chat, donations, purchases, or real-money features have been added.

**Important:** Committing the `firestore.rules` file to GitHub does *not* deploy those permissions. Until the project owner deploys the rules, Firestore may reject all clan operations with `permission-denied`.

Deploy the rules through Firebase Console or via the Firebase CLI from a securely authenticated developer environment:

```sh
firebase deploy --only firestore:rules --project wtvstudios-5b40f
```

The included `firebase.json` points to `firestore.rules`. Never commit an admin service-account key or personal login token to the repository.

## How it works

- Player signs into their ProfitLands account.
- Founder creates a clan name (3–32 characters), tag (2–5 uppercase alphanumerics), and short description.
- Firestore transaction creates the clan document, founder member, and their one-per-user membership index together.
- Another signed-in player can browse clans or join using a shared **public** clan ID.
- Players see usernames and roles, not email addresses.
- A regular member may leave. The founder can disband only when the displayed roster shows no other members. This is a starter system, not an administrative/moderation system.
- If a founder removes the clan unexpectedly, members can clear their orphaned membership.

## Verification before a public release

Use two different test accounts to create a clan, join it, refresh the roster, leave it, and disband it. Verify Firestore security rules (including denial of writes as other users) with the Firebase Emulator Suite and review the results. The repository's Node regression suite covers client validation and integration but **does not** verify the deployed Firebase project.

For a future public social release, add moderated report/block controls, scalable member management, rate limits, leadership transfer, and stronger clan lifecycle invariants. Until then, avoid enabling public chat or representing this as a full multiplayer game.
