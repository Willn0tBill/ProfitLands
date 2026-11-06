# ProfitLands Regional Chat — Controlled Beta

Regional chat uses the existing `profitlands-world1` Cloudflare Worker and D1 database. **Public chat stays disabled until a trusted moderator UID is configured in the Cloudflare secret `CHAT_MODERATOR_UIDS`.** There are three separate ledgers: Americas (`world1`), Europe (`world-europe`) and Asia (`world-asia`). No new database, migration, or paid plan is needed.

## Player safeguards

- Chat requires verified Firebase authentication and joining the selected world. No anonymous write endpoint exists.
- The server saves plain-text messages only, up to 160 characters. Links, emails, off-platform contact requests, phone-like numbers, selected abusive words and repeated spam are rejected.
- A player may post once every 20 seconds. The most recent 60 messages per region are stored. Only messages from the past 24 hours are shown; older messages are pruned on the next chat write. The client displays the latest 40 visible messages.
- Players can **Report**, **Block**, and **Unblock** others. Reports hide the message immediately from the reporting player. Two distinct reporters automatically hide it from everybody, pending moderator review.
- Chat never transfers money, affects singleplayer saves, sends private messages, or shows user email addresses. Player names shown in chat are the server-generated Tycoon aliases.
- Polling occurs every 30 seconds only while the chat panel is open and the browser tab is visible; there is no WebSocket connection.

Automated filters are imperfect. This beta **requires active moderator review** and a human escalation process; do not advertise it as fully moderated or safe from all harmful content. Review reports regularly, especially if younger players are participating. Do not ask players to post personal information.

## Moderator account setup

The Worker supports optional moderator-only actions `getChatReports` and `moderateChat` (`decision`: `remove` or `dismiss`). Every moderator action checks the **verified Firebase UID** against the Cloudflare secret `CHAT_MODERATOR_UIDS`; players cannot grant themselves moderation rights.

1. Identify the Firebase Auth UID of the trusted moderator account in the Firebase Console. Do not use their email address or password; do not share their ID token.
2. From the checked-out `cloudflare/` project using the correct **existing** `profitlands-world1` Worker configuration, set a Cloudflare secret named `CHAT_MODERATOR_UIDS` containing one or more comma-separated UIDs. Use `wrangler secret put CHAT_MODERATOR_UIDS --config wrangler.toml` through your trusted terminal (this command will ask privately for the value). Never put actual UIDs or tokens in GitHub.
3. Verify the moderator account can review and decide on reports, and a non-moderator account receives a 403 error. Review the queue per region.

### Emergency shutdown

Set the existing Worker secret `CHAT_DISABLED` to `true` (e.g. `wrangler secret put CHAT_DISABLED --config wrangler.toml`) to disable **player-facing** chat reads and writes without affecting the economy. Moderator-only report review and removals remain available so incidents can be investigated while chat is shut down. The backend health API then advertises `chatEnabled:false` to the browser. To re-enable after investigation, set the value to `false`, then verify the public health response.

## Acceptance tests before broader promotion

- Two real test accounts in the same region can exchange a message, report it, block and unblock.
- A person in a different region never sees that message.
- Two reports hide the content for all, the moderator reviews it, and only the moderator can restore or remove it.
- No credentials are sent to the chat store. Unauthorized/expired Firebase tokens are rejected.
- Verify blocked links, phone-like numbers, spam cooldown, bounded history and the emergency shutdown.
- Measure Cloudflare D1 quotas and CPU before enabling automatic refresh or increasing the player cap.

Current automated tests use signed test tokens or local dispatch fixtures; **they do not prove that human moderation is staffed or that two live Firebase accounts have completed the full flow**.
