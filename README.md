# Taq Event Team Bot

Simple Node.js bot that:

1. Reads new Google Form responses from the linked Google Sheet.
2. Posts each application into a Discord channel through a webhook.
3. Adds `✅` and `❌` reactions for approve/decline voting.
4. Requires a `2/3` supermajority of members with channel access to decide.
5. Supports force override with `/accept` and `/deny`.
6. Supports `/setchannel` so you can configure target channel in Discord (no code edit).
7. `/setchannel` configures both application post and log channels together.
8. Creates a thread per application message for team discussion.
9. Creates an `application-logs` channel and posts full close-history when an application is decided.

## Requirements

- Node.js 18+
- A Google Form with response destination set to a Google Sheet
- A Google Cloud service account with read access to that sheet
- A Discord bot token in the same server/channel for reactions, threads, and slash commands
- Discord application client ID

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file and fill values.

Required keys:
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON`
- `POLL_INTERVAL_MS`
- `DISCORD_WEBHOOK_URL` (optional fallback; `/setchannel` can auto-create)
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (optional override)
- `DISCORD_CHANNEL_ID` (optional fallback if you do not use `/setchannel`)
- `DISCORD_LOGS_CHANNEL_NAME`
- `DISCORD_LOGS_CHANNEL_ID` (optional fallback if you do not use `/setchannel`)
- `DISCORD_THREAD_AUTO_ARCHIVE_MINUTES`
- `STATE_FILE`

3. Place your Google service account key file in the project root as `service-account.json` (or update `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).

4. Share the Google Sheet with the service account email (Viewer is enough).

5. Ensure Discord bot has these permissions in the target channel:
- `Read Message History`
- `Add Reactions`
- `Create Public Threads`
- `Send Messages in Threads`
- `View Channel`
- `Manage Channels` (needed by bot to create logs channel)
- `Manage Webhooks` (needed by `/setchannel` auto webhook setup)

6. Enable bot privileged intent in Discord Developer Portal:
- `Server Members Intent`

7. Run:

```bash
npm start
```

For terminal live-reload while developing:

```bash
npm run dev
```

When running in `dev` mode, type `rs` then Enter in that terminal to restart the bot manually after changes.

Terminal process control commands:

```bash
npm run stop
npm run restart
npm run start:background
npm run stop:background
npm run restart:background
```

Behavior:
- `npm run stop` kills active bot processes (`node src/index.js` and `nodemon src/index.js`).
- `npm run restart` stops active bot processes, then starts foreground again.
- `npm run stop:background` targets only the detached process tracked in `.bot.pid`.

8. In Discord, set the working channel:
```text
/setchannel
```

Optional:
```text
/setchannel application_post:#application-post application_log:#application-log
```

## Hosting

### PM2 (VPS or your own server)

1. Install PM2:
```bash
npm install -g pm2
```
2. Start bot with included config:
```bash
pm2 start ecosystem.config.cjs
```
3. Persist process across reboots:
```bash
pm2 save
pm2 startup
```
4. Check logs:
```bash
pm2 logs taq-event-bot
```

### Railway

1. Create a new Railway project from this repo.
2. Set `Start Command` to:
```bash
npm start
```
3. Add all env vars to `.env`.
4. For Google credentials, use one of:
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` with a mounted file path.
- `GOOGLE_SERVICE_ACCOUNT_JSON` with raw JSON or base64-encoded JSON.

### Render (Background Worker)

1. Create a new `Background Worker` from this repo.
2. Build command:
```bash
npm install
```
3. Start command:
```bash
npm start
```
4. Add all env vars to `.env`.
5. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (raw JSON or base64 JSON) for easiest deploy.

## Notes

- The bot stores processed row state in `.bot-state.json`.
- If you want to reprocess from the start, delete `.bot-state.json`.
- Prefer `/setchannel` to set channel from Discord directly.
- `/setchannel` auto-creates/uses a webhook from the selected application post channel.
- On startup, bot verifies the configured webhook. If valid, it keeps using it; if invalid, it ignores the bad stored webhook and waits for `/setchannel`.
- If you use env-only setup, `DISCORD_CHANNEL_ID` should match the webhook channel.
- `DISCORD_LOGS_CHANNEL_NAME` controls default logs channel name (default `application-logs`).
- `DISCORD_LOGS_CHANNEL_ID` overrides logs channel directly.
- Votes are counted only from non-bot users who can view the configured channel.
- Users reacting with both `✅` and `❌` are ignored until they keep only one side.
- Slash commands auto-register to the guild from `DISCORD_GUILD_ID` or active `/setchannel` channel.
- `DISCORD_GUILD_ID` is optional and only used as an explicit override.
- On startup, the bot audits required permissions and exits with missing permission names if setup is incomplete.
- `/accept` and `/deny` require both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/setchannel` requires `Manage Server` (or `Administrator`) and bot `Manage Webhooks`.
- `/debug`, `/stop`, and `/restart` require `Manage Server`, or `Administrator`.
- `/stop` writes an audit log with user ID, username, and guild details.
