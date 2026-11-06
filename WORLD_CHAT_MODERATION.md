# ProfitLands Regional Chat — Automated Safety Beta

Regional chat runs on the existing free Cloudflare `profitlands-world1` Worker and the existing D1 ledger. Americas, Europe, and Asia have distinct message histories. This is an **automated-first beta, not a promise of perfect moderation**.

## Behavior and safety controls

- Server-side profanity and slur filtering replaces recognized words with `***` *before storage or broadcast*. It handles many common spacing, punctuation, repeated-letter, zero-width and number-substitution tricks. Like all wordlists, it can miss new spellings and produce false positives.
- Explicit targeted harmful phrases, direct contact details, links, and off-platform contact invitations are rejected rather than masked. Players only see plain-text messages, never HTML.
- Two slurs inside ten minutes trigger a ten-minute mute. A player may post only once per 20 seconds. Exact repeated messages and long repetitive strings are rejected.
- Each registered player may **Report**, **Block** and **Unblock**. The reporter immediately hides a reported message locally; two distinct reports hide it globally pending review. Blocking is per region.
- Only the latest 60 messages per region are retained, and messages older than 24 hours are pruned when chat is written; browser views show up to 40 visible messages. No private messages, public email addresses, external links or financial transfers.
- Region chat is accessible to authenticated players who have joined that region **without a required moderator UID**. The emergency switch `CHAT_DISABLED=true` disables public chat reads/writes immediately without disabling the economy.
- `CHAT_MODERATOR_UIDS` is optional; if provided, only those verified Firebase accounts can review the report queue and remove or dismiss reports. Account credentials and tokens must never be written in source code or GitHub.

## Operational responsibility

An automatic filter is not a replacement for a response process. Harassment can be written without banned words, moderation mistakes and malicious false reports can occur, and abuse attempts change over time. One accountable game owner should be able to review serious reports, appeals and filter failures, even without staffing full-time moderators.

For an initial public release, deploy and verify the new code, run live tests in each region with two *test accounts*, and check abuse-handling before enabling chat to everyone. Keep the shutdown switch available at all times. Never claim guaranteed safety.

## Optional owner review setup

1. In Firebase Authentication, find the UID of a trusted owner/reviewer account. Do not use or share passwords, ID tokens or another player's private information.
2. In the existing `cloudflare/` Worker project, set the optional secret privately with `wrangler secret put CHAT_MODERATOR_UIDS --config wrangler.toml` and provide the authorized UID. Never commit it to GitHub.
3. In each region, confirm only the listed account can call the protected `getChatReports` and `moderateChat` actions; others must receive HTTP 403.
4. To disable public chat urgently, privately set `CHAT_DISABLED` to `true` on the same Worker; to re-enable later, set `false` and recheck the `/health` response.

## Required release verification

- Two live Firebase test accounts exchange messages in the same region, cannot see messages across regions, and keep online cash unchanged.
- Profanity, disguises and slurs become `***` on the **server**, not only in browser UI; raw flagged terms never enter D1 chat records.
- Contact information, links and severe targeted harassment are rejected. Slur repetition triggers a timed mute.
- Report and block flows work; two distinct reports hide a message globally; the emergency shutdown blocks reads and writes.
- Unauthenticated callers, wrong-world callers, and unauthorized moderator calls are rejected.
- Check Cloudflare D1 free-tier usage and server load at intended scale. No separate paid moderation service is required.
- Review false positives, missed disguises, and abuse reports with a human accountability path before public rollout.

Local automated tests do **not** prove that the production Worker has been updated or that real users can safely use the chat.
