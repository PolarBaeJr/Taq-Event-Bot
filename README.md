# Taq Event Team Bot

Simple Node.js bot that:

1. Reads new Google Form responses from the linked Google Sheet.
2. Routes applications to per-track channels (`Tester`, `Builder`, `CMD`) and posts with the bot account.
3. Adds `✅` and `❌` reactions for approve/decline voting.
4. Requires a `2/3` supermajority of members with channel access to decide.
5. Supports force override with `/accept` and `/deny`.
6. Supports `/setchannel` so you can configure track channels in Discord (no code edit).
7. `/setchannel` configures tester/builder/cmd post channels and log channel.
8. Creates a thread per application message for team discussion.
9. Creates an `application-logs` channel and posts full close-history when an application is decided.
10. Queues each application post as a persistent job (`job-000001`, etc.) and replays failed jobs in row order.
11. Can auto-grant a configured role when an application is accepted.

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
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (optional override)
- `DISCORD_TESTER_CHANNEL_ID` (optional tester fallback if you do not use `/setchannel`)
- `DISCORD_BUILDER_CHANNEL_ID` (optional builder fallback if you do not use `/setchannel`)
- `DISCORD_CMD_CHANNEL_ID` (optional cmd fallback if you do not use `/setchannel`)
- `DISCORD_CHANNEL_ID` (legacy tester fallback)
- `DISCORD_LOGS_CHANNEL_NAME`
- `DISCORD_LOGS_CHANNEL_ID` (optional fallback if you do not use `/setchannel`)
- `ACCEPT_ANNOUNCE_CHANNEL_ID` (optional fallback if you do not use `/setaccept`)
- `ACCEPT_ANNOUNCE_TEMPLATE` (optional; message sent to configured channel when accepted)
- `DENY_DM_TEMPLATE` (optional; DM template sent to `discord_ID` when denied)
- `DISCORD_THREAD_AUTO_ARCHIVE_MINUTES`
- `DISCORD_TESTER_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/setapprole`)
- `DISCORD_BUILDER_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/setapprole`)
- `DISCORD_CMD_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/setapprole`)
- `DISCORD_APPROVED_ROLE_IDS` (legacy tester CSV list fallback)
- `DISCORD_TESTER_APPROVED_ROLE_ID` (optional tester fallback if you do not use `/setapprole`)
- `DISCORD_BUILDER_APPROVED_ROLE_ID` (optional builder fallback if you do not use `/setapprole`)
- `DISCORD_CMD_APPROVED_ROLE_ID` (optional cmd fallback if you do not use `/setapprole`)
- `DISCORD_APPROVED_ROLE_ID` (legacy tester fallback)
- `CRASH_LOG_DIR` (optional, default: `crashlog`)
- `STATE_FILE`

3. Place your Google service account key file in the project root as `service-account.json` (or update `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).

4. Share the Google Sheet with the service account email (Viewer is enough).

5. Ensure Discord bot has these permissions in the target channel:
- `Read Message History`
- `Send Messages`
- `Add Reactions`
- `Create Public Threads`
- `Send Messages in Threads`
- `View Channel`
- `Manage Channels` (needed by bot to create logs channel)

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

Function-by-function readability mirrors:

```bash
npm run functions:mirror
```

This generates `src/functions/` with one file per top-level function from `src/index.js`.

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

8. In Discord, set channels:
```text
/setchannel
```

Recommended:
```text
/setchannel tester_post:#tester-apps builder_post:#builder-apps cmd_post:#cmd-apps log:#application-log
```

Set role granted on accepted applications:
```text
/setapprole track:tester role:@TesterRole role_2:@HelperRole role_3:@AnotherRole
/setapprole track:builder role:@BuilderRole
/setapprole track:cmd role:@CMDRole
```
`/setapprole` updates one track per command and overwrites that track's previous role list.

Set denied DM template (sent to applicant `discord_ID`):
```text
/setdenymsg message:Your application was denied for {track} in {server}.
```

Set accepted announcement channel/message:
```text
/setaccept channel:#welcome-team message:Welcome to {track} team, if you need any information please contact administrators.
```

Post a structured bot message in the current channel:
```text
/structuredmsg title:Notice line_1:Server maintenance at 9 PM line_2:Please finish applications before then
```

Get diagnostic info in your DMs:
```text
/debug mode:report
```

Run a live Discord posting test and get results in your DMs:
```text
/debug mode:post_test track:tester
```
By default, `post_test` posts in the current chat you run it from.

Run decision-path debug tests against a tracked application:
```text
/debug mode:accept_test job_id:job-000123
/debug mode:deny_test message_id:1234567890123456789
```
If `job_id` is not tracked, debug runs in simulation mode. `job_id` can be any text in simulation.
```text
/debug mode:accept_test job_id:any-text user:@member
/debug mode:deny_test job_id:any-text user:@member
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
- Application posts are queued in `.bot-state.json` with persistent job IDs.
- Application IDs are formatted as `TRACK-NUMBER` (for example `TESTER-12`, `BUILDER-12`, `CMD-12`).
- If posting fails, the failed job is kept and retried in strict row order.
- After `/setchannel` succeeds, queued failed jobs are replayed immediately.
- If you want to reprocess from the start, delete `.bot-state.json`.
- Prefer `/setchannel` to set channel from Discord directly.
- `/setchannel` updates per-track post channels (`tester_post`, `builder_post`, `cmd_post`) and the log channel.
- Track routing is inferred from your form response values using keywords like `tester`, `builder`, and `cmd`/`command`. If none is found, it defaults to `tester`.
- Multi-select role responses are supported. One row can post to multiple track channels (one application post per selected track).
- Empty/unanswered form questions are omitted from Discord application posts and stored history.
- Polling deduplicates by response identity (timestamp + form identity fields), so row deletions/reordering in the sheet do not block new submissions.
- Multiple submissions from the same Discord ID are supported.
- `DISCORD_LOGS_CHANNEL_NAME` controls default logs channel name (default `application-logs`).
- `DISCORD_LOGS_CHANNEL_ID` overrides logs channel directly.
- Votes are counted only from non-bot users who can view the configured channel.
- Users reacting with both `✅` and `❌` are ignored until they keep only one side.
- Slash commands auto-register to the guild from `DISCORD_GUILD_ID` or active `/setchannel` channel.
- `DISCORD_GUILD_ID` is optional and only used as an explicit override.
- On startup, the bot audits required permissions and exits with missing permission names if setup is incomplete.
- `/accept` and `/deny` require both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/accept` and `/deny` can target by `message_id`, by `job_id`, or from inside the application thread.
- If one `job_id` created multiple track posts, run `/accept` or `/deny` inside the target track thread/channel, or pass `message_id`.
- `/setchannel` requires `Manage Server` (or `Administrator`).
- `/setchannel` can be run with no options to set tester channel to the current channel.
- `/setchannel` supports `log:#channel` to set the logs channel.
- `/setapprole` requires both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/setapprole` requires exactly one `track` per command and overwrites that track's roles.
- `/setapprole` supports up to 5 roles in one command: `role`, `role_2`, `role_3`, `role_4`, `role_5`.
- `/setapprole` writes a configuration update entry to the configured logs channel.
- `/setdenymsg` requires `Manage Server` (or `Administrator`) and sets the denied-DM template.
- `/setaccept` requires `Manage Server` (or `Administrator`) and sets accepted-announcement channel/message.
- `/setaccept` accepts `channel`, `message`, or both.
- `/setacceptmsg` remains available as a legacy alias.
- `/structuredmsg` requires `Manage Server` (or `Administrator`) and posts in the current channel.
- Denied applications DM the resolved `discord_ID` user automatically (if available).
- Supported denied-DM placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{decision_source}`, `{reason}`, `{decided_at}`.
- Supported accepted-announcement placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{role_result}`, `{decided_at}`.
- `/debug`, `/stop`, and `/restart` require `Manage Server`, or `Administrator`.
- `/debug` sends results by DM; if DMs are closed, the bot warns you in-channel.
- `/debug mode:post_test` supports `track` so you can test each application channel.
- `/debug mode:accept_test` and `/debug mode:deny_test` support `message_id`/`job_id` and run the real decision flow.
- `/debug mode:accept_test` and `/debug mode:deny_test` accept non-tracked `job_id` values as simulation mode (no state changes).
- `/debug mode:accept_test` simulation requires `user` and reports `Role test works` or `Role test warning`.
- `/debug mode:deny_test` simulation requires `user` and reports `Denied DM test works` or `Denied DM test warning`.
- `/debug` accept/deny test modes require both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/stop` and `/restart` write audit logs with user ID, username, and guild details to `logs/control-actions.log` (or `CONTROL_LOG_FILE`), not Discord.
- On process crashes (`uncaughtException` / `unhandledRejection` / fatal startup), bot writes a timestamped crash file in `crashlog/` (or `CRASH_LOG_DIR`).
- Bot message send/edit and thread creation retry automatically on Discord rate limits (`429`).
- On accepted applications, bot attempts to grant the configured role to the resolved applicant Discord user.
