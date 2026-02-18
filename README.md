# Taq Event Team Bot

Simple Node.js bot that:

1. Reads new Google Form responses from the linked Google Sheet.
2. Routes applications to per-track channels (`Tester`, `Builder`, `CMD`) and posts with the bot account.
3. Adds `✅` and `❌` reactions for approve/decline voting.
4. Uses per-track configurable vote thresholds (default `2/3`, minimum 1 vote) for decisions.
5. Supports decision overrides with `/accept` and `/deny` (with optional reason), and undo flow with `/reopen` (`/accept mode:force` bypasses missing-member block).
6. Supports `/set <action>` subcommands so you can configure channels/roles/templates in Discord (no code edit).
7. `/set channel` configures tester/builder/cmd post channels, application log channel, log channel, accept-message channel, bug channel, and suggestions channel.
8. `/set default` applies a server-level default channel to all channel targets in one command (and can optionally apply shared accepted roles).
9. Posts applications, bug reports, and suggestions in embedded format.
10. Creates a thread per application/feedback message for team discussion.
11. Creates an `application-logs` channel and posts full close-history when an application is decided.
12. Queues each application post as a persistent job (`job-000001`, etc.) and replays failed jobs in row order.
13. Can auto-grant configured roles, send stale-pending reminders, post daily digests, and detect duplicate applications.
14. Validates startup config/env strictly (required values, numeric ranges, Discord snowflake IDs).
15. Emits structured JSON logs for interaction failures, Discord API send/reaction/thread failures, and queue retries.
16. Includes automated test + CI pipeline (`npm run ci`, GitHub Actions).

## Release Notes

### Unreleased

- Added strict startup config validation (`src/lib/startupConfig.js`).
- Added structured logger and runtime wiring for key error/retry events (`src/lib/structuredLogger.js`).
- Added parser helper module + compatibility tests for embedded application messages.
- Added test/lint/ci/release scripts and GitHub Actions CI workflow.
- Added `CHANGELOG.md`.
- Added scheduled maintenance for control-log rotation and crash-log retention.
- Added operational alert webhooks for startup/retry/crash and stop/restart control actions.
- Added scheduled backups for state/config snapshots.
- Added smoke check script and runbook.
- Added branch-protection automation script for required CI checks on `main`.

### v1.1.1 - 2026-02-15

- Added a shared dynamic message system used by all core message types.
- Unified embed-style layout for:
  - Application posts
  - Bug reports
  - Suggestions
  - `/debug mode:post_test` posts
- Centralized message payload generation so layout updates can be done in one place.
- Kept downstream parsing compatible (track, application ID, and submitted field extraction).

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
- `DISCORD_TESTER_CHANNEL_ID` (optional tester fallback if you do not use `/set channel`)
- `DISCORD_BUILDER_CHANNEL_ID` (optional builder fallback if you do not use `/set channel`)
- `DISCORD_CMD_CHANNEL_ID` (optional cmd fallback if you do not use `/set channel`)
- `DISCORD_CHANNEL_ID` (legacy tester fallback)
- `DISCORD_LOGS_CHANNEL_NAME` (application logs default name)
- `DISCORD_LOGS_CHANNEL_ID` (optional application logs fallback if you do not use `/set channel application_log`)
- `DISCORD_BOT_LOGS_CHANNEL_NAME` (optional bot-operation log channel name fallback)
- `DISCORD_BOT_LOGS_CHANNEL_ID` (optional bot-operation log fallback if you do not use `/set channel log`)
- `DISCORD_BUG_CHANNEL_ID` (optional fallback if you do not use `/set channel`)
- `DISCORD_SUGGESTIONS_CHANNEL_ID` (optional fallback if you do not use `/set channel`)
- `ACCEPT_ANNOUNCE_CHANNEL_ID` (optional fallback if you do not use `/set acceptmsg` or `/set channel accept_message`)
- `ACCEPT_ANNOUNCE_TEMPLATE` (optional; message sent to configured channel when accepted)
- `DENY_DM_TEMPLATE` (optional; DM template sent to `discord_ID` when denied)
- `DISCORD_THREAD_AUTO_ARCHIVE_MINUTES`
- `REMINDER_THRESHOLD_HOURS` (optional; stale pending reminder threshold, default `24`)
- `REMINDER_REPEAT_HOURS` (optional; reminder repeat cadence, default `12`)
- `DAILY_DIGEST_ENABLED` (optional; `true`/`false`, default `true`)
- `DAILY_DIGEST_HOUR_UTC` (optional; `0-23`, default `15`)
- `DUPLICATE_LOOKBACK_DAYS` (optional; duplicate detection lookback window, default `60`)
- `AUTO_REGISTER_TRACKS_FROM_FORM` (optional boolean, default `false`; when `true`, new track values found in form responses can auto-create custom tracks)
- `DISCORD_TESTER_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/set approle`)
- `DISCORD_BUILDER_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/set approle`)
- `DISCORD_CMD_APPROVED_ROLE_IDS` (optional CSV list fallback if you do not use `/set approle`)
- `DISCORD_APPROVED_ROLE_IDS` (legacy tester CSV list fallback)
- `DISCORD_TESTER_APPROVED_ROLE_ID` (optional tester fallback if you do not use `/set approle`)
- `DISCORD_BUILDER_APPROVED_ROLE_ID` (optional builder fallback if you do not use `/set approle`)
- `DISCORD_CMD_APPROVED_ROLE_ID` (optional cmd fallback if you do not use `/set approle`)
- `DISCORD_APPROVED_ROLE_ID` (legacy tester fallback)
- `CRASH_LOG_DIR` (optional, default: `crashlog`)
- `STATE_FILE` (optional, default `.bot-state.json`)
- `CONTROL_LOG_FILE` (optional, default `logs/control-actions.log`)
- `MAINTENANCE_INTERVAL_MINUTES` (optional, default `60`)
- `LOG_RETENTION_DAYS` (optional, default `14`)
- `CRASH_LOG_RETENTION_DAYS` (optional, default `30`)
- `CONTROL_LOG_MAX_BYTES` (optional, default `5242880`)
- `CONTROL_LOG_MAX_FILES` (optional, default `5`)
- `ALERT_WEBHOOK_URL` (optional; Discord webhook URL for operational alerts)
- `ALERT_MENTION` (optional text prefix for alert messages)
- `ALERT_COOLDOWN_SECONDS` (optional per-alert-key throttle, default `300`)
- `ALERT_ON_STARTUP` (optional boolean, default `true`)
- `ALERT_ON_RETRY` (optional boolean, default `true`)
- `ALERT_ON_CRASH` (optional boolean, default `true`)
- `BACKUP_ENABLED` (optional boolean, default `true`)
- `BACKUP_STATE_ENABLED` (optional boolean, default `true`)
- `BACKUP_CONFIG_ENABLED` (optional boolean, default `true`)
- `BACKUP_DIR` (optional, default `backups`)
- `BACKUP_INTERVAL_MINUTES` (optional, default `360`)
- `BACKUP_MAX_FILES` (optional, default `60`)

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

Run checks locally:

```bash
npm run lint
npm run test
npm run ci
npm run smoke
```

Smoke check options:

```bash
# Check Discord + Google Sheets
npm run smoke

# Check only Discord auth/connectivity
npm run smoke -- --discord-only

# Check only Google Sheets auth/read access
npm run smoke -- --sheets-only
```

Smoke check behavior:
- Returns exit code `0` when all requested checks pass.
- Returns non-zero if config validation fails or any requested check fails.

Release helper:

```bash
npm run release -- patch
npm run release -- 1.1.2 --push --all
```

Apply branch protection for `main` (requires admin token):

```bash
export GH_TOKEN=your_repo_admin_token
npm run protect:main
```

Branch protection script options:
- `GH_TOKEN` or `GITHUB_TOKEN`:
  required GitHub token with repo admin permission.
- `GITHUB_REPOSITORY` (optional):
  explicit `owner/repo`; if omitted, script derives repo from `origin`.
- Optional branch argument (direct script usage):
  `node scripts/enable-branch-protection.js <branch>` (default `main`).

Operational runbook:

```bash
cat RUNBOOK.md
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

8. In Discord, set channels:
```text
/set channel post track:tester channel:#tester-apps
```

Recommended:
```text
/set channel post track:tester channel:#tester-apps
/set channel post track:builder channel:#builder-apps
/set channel post track:cmd channel:#cmd-apps
/set channel application_log channel:#application-log
/set channel log channel:#bot-log
/set channel accept_message channel:#welcome-team
/set channel bug channel:#bug-reports
/set channel suggestions channel:#team-suggestions
```

Server-level default baseline in one step:
```text
/set default channel:#bot-default
/set default channel:#bot-default role:@TeamRole role_2:@HelperRole
```

Send a bug report (creates a thread for discussion):
```text
/bug message:App crashes when opening profile settings
```

Send a suggestion (creates a thread for discussion):
```text
/suggestions message:Add a quick filter for pending applications
```

Track management:
```text
/track add name:Scripter aliases:scripter,scripts
/track edit track:scripter name:Lead Scripter aliases:scripter,lead scripts
/track remove track:scripter
/track list
```

Set role granted on accepted applications:
```text
/set approle track:tester role:@TesterRole role_2:@HelperRole role_3:@AnotherRole
/set approle track:builder role:@BuilderRole
/set approle track:cmd role:@CMDRole
```
`/set approle` updates one track per command and overwrites that track's previous role list.
Use `/set approlegui` to open the accepted-roles GUI.

Set denied DM template (sent to applicant `discord_ID`):
```text
/set denymsg message:Your application was denied for {track} in {server}.
```

Set accepted announcement channel/message:
```text
/set acceptmsg channel:#welcome-team message:Welcome to {track} team, if you need any information please contact administrators.
```

Reaction roles (subcommand shortcut):
```text
/rr create message_id:123456789012345678 emoji:✅ role:@EventRole channel:#roles
/rr button role:@EventRole role_2:@HelperRole channel:#roles color:green message:Pick your roles below
/rr button role:@EventRole role_2:@HelperRole channel:#roles message_type:embed title:Choose Team Roles message:Pick your roles below embed_color:#57F287
/rr button_edit message_id:123456789012345678 channel:#roles color:red
/rr button_edit message_id:123456789012345678 channel:#roles embed_color:#FFAA00
/rr button_edit message_id:123456789012345678 channel:#roles embed_color:clear
/rr button_edit message_id:123456789012345678 channel:#roles role:@NewRole role_2:@SecondRole
/rr button_edit message_id:123456789012345678 channel:#roles remove_top_text:true
/rr list
/rr remove message_id:123456789012345678 emoji:✅ channel:#roles
/rr gui
```
`/rr button` posts clickable buttons; users can click again to remove the same role.  
`message_type` supports `text` (default) and `embed`.  
`embed_color` supports hex for embed sidebars (example `#57F287`); `button_edit` also supports `clear`.  
`color` supports `gray`, `blue`, `green`, `red` on create and edit.  
`/rr button_edit` can replace the button role set with new `role` options, and can also remove the top text with `remove_top_text:true`.

Message tools (subcommand shortcut):
```text
/message structured title:Team Update line_1:Schedule posted line_2:Check pins
/message embed title:Welcome description:Rules are in #rules color:#57F287 timestamp:true
/message edit channel:#announcements message_id:123456789012345678 title:Updated Title footer:clear
```

Dashboard and settings:
```text
/dashboard
/uptime
/repostapps
/repostapps track:tester limit:25
/settings show
/settings vote track:tester numerator:2 denominator:3 minimum_votes:2
/settings voters track:tester roles:@ReviewerRole @LeadReviewerRole
/settings voters track:tester roles:clear
/settings reminders enabled:true threshold_hours:24 repeat_hours:12
/settings reviewers track:tester mentions:@LeadReviewer @BackupReviewer
/settings digest enabled:true hour_utc:15
/settings sheets spreadsheet_id:1AbCdEfGhI... sheet_name:Form Responses 1
/settings sheets reset:true
/settings missingusermsg message:user not in discord please dm
/settings missingusermsg message:default
/settings export
/settings import json:{ ... }
```

Config backup/restore:
```text
/config export
/config import json:{"settings":{"dailyDigest":{"enabled":true,"hourUtc":15}}}
```

Decision controls:
```text
/accept job_id:job-000123 reason:Strong trial + clean history
/accept job_id:job-000123 mode:force reason:Accepting before user joins server
/deny message_id:1234567890123456789 reason:Missing requirements
/reopen job_id:job-000123 reason:Needs second review
/unassignedrole
/unassignedrole limit:25
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

## Server Update Flow

Use this when new code is pushed and you want to update the running bot on your VPS.

1. On the server, go to the bot folder and pull latest code:
```bash
cd ~/Taq-Event-Bot
git pull --ff-only origin main
```

2. Install/update dependencies (safe for production):
```bash
npm ci --omit=dev
```

3. Restart the bot and reload environment:
```bash
pm2 restart taq-event-bot --update-env
```

4. Verify it is healthy:
```bash
pm2 status
pm2 logs taq-event-bot --lines 100
```

If your process was not created yet:
```bash
pm2 start ecosystem.config.cjs --name taq-event-bot
pm2 save
```

### Important: Git-Ignored Files

`git pull` does not bring `.env`, `service-account.json`, or `.bot-state.json`.

Sync them from your local machine:
```bash
scp -i ~/.ssh/Discordbot.key \
  /path/to/your/project/.env \
  /path/to/your/project/service-account.json \
  /path/to/your/project/.bot-state.json \
  opc@159.54.167.100:~/Taq-Event-Bot/
```

Then on server:
```bash
chmod 600 ~/Taq-Event-Bot/.env ~/Taq-Event-Bot/service-account.json
pm2 restart taq-event-bot --update-env
```

## Notes

- The bot stores processed row state in `.bot-state.json`.
- Application posts are queued in `.bot-state.json` with persistent job IDs.
- Application IDs are formatted as `TRACK-NUMBER` (for example `TESTER-12`, `BUILDER-12`, `CMD-12`).
- If posting fails, the failed job is kept and retried in strict row order.
- After `/set channel` succeeds, queued failed jobs are replayed immediately.
- If you want to reprocess from the start, delete `.bot-state.json`.
- Prefer `/set channel` to set channels from Discord directly.
- `/set channel` updates per-track post channels (`tester`, `builder`, `cmd`) plus `application_log`, `log`, `accept_message`, `bug`, and `suggestions`.
- Track routing is inferred from your form response values using keywords like `tester`, `builder`, and `cmd`/`command`. If none is found, it defaults to `tester`.
- Multi-select role responses are supported. One row can post to multiple track channels (one application post per selected track).
- Empty/unanswered form questions are omitted from Discord application posts and stored history.
- Polling deduplicates by response identity (timestamp + form identity fields), so row deletions/reordering in the sheet do not block new submissions.
- Before posting, bot scans recent channel history and reuses an existing matching application post (same track + form-content fingerprint) to avoid reposting from another bot instance.
- Multiple submissions from the same Discord ID are supported.
- `DISCORD_LOGS_CHANNEL_NAME` controls default application logs channel name (default `application-logs`).
- `DISCORD_LOGS_CHANNEL_ID` overrides application logs channel directly.
- `DISCORD_BOT_LOGS_CHANNEL_NAME` controls default bot logs channel name (default `bot-logs`).
- `DISCORD_BOT_LOGS_CHANNEL_ID` overrides bot operation logs channel directly.
- Application posts are sent as embeds.
- `/bug`, `/suggestions`, and `/suggestion` posts are sent as embeds.
- Votes are counted only from non-bot users who can view the configured channel.
- Optional per-track vote-eligible role filters can be configured with `/settings voters`.
- Vote rules are configurable per track via `/settings vote` (default `2/3`, min `1` vote).
- Users reacting with both `✅` and `❌` are ignored until they keep only one side.
- Slash commands auto-register to the guild from `DISCORD_GUILD_ID` or active configured post channel.
- `DISCORD_GUILD_ID` is optional and only used as an explicit override.
- On startup, the bot audits required permissions and exits with missing permission names if setup is incomplete.
- `/accept` and `/deny` require both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/accept` and `/deny` can target by `message_id`, by `job_id`, or from inside the application thread, and support optional `reason`.
- `/accept` supports `mode:normal` (default) and `mode:force`.
- `/accept` supports optional `applicant` override (`username`, `@mention`, or user ID) when form `discord_ID` resolution is ambiguous.
- If one `job_id` created multiple track posts, run `/accept` or `/deny` inside the target track thread/channel, or pass `message_id`.
- Forced `/accept` and `/deny` also post the rendered accept/deny message template into that specific application thread.
- Automatic vote acceptance and `/accept mode:normal` are blocked when applicant is not in the server; the bot posts a warning and keeps the application pending.
- `/accept mode:force` can accept anyway when applicant is not in the server.
- If `/accept` still cannot resolve the applicant user, the bot opens a GUI modal to request applicant username/mention/ID and retries acceptance.
- If an accepted applicant is not in the server, the bot posts the configurable missing-user thread notice message (default: `user not in discord please dm`).
- `/reopen` reopens a decided application back to pending and automatically attempts side-effect rollback: removes bot-granted accepted roles, deletes tracked acceptance announcements, and sends a reopen-compensation DM when a user can be resolved.
- `/dashboard` shows per-track pending/accepted/denied counts, oldest pending age, and vote rule.
- `/uptime` shows how long the current bot process has been running.
- `/unassignedrole` lists accepted applications where role assignment failed because the applicant is not in server.
- `/repostapps` replays tracked historical applications back into configured post channels in row order.
- `/settings` controls vote rules, vote-eligible role filters, stale reminders, reviewer assignment, daily digests, and active Google Sheet source overrides.
- `/config export` DMs JSON config backup; `/config import` restores settings from JSON.
- `/set channel` requires `Manage Server` (or `Administrator`).
- `/set channel` uses subcommands: `post`, `channel_post` (legacy alias), `application_log`, `log`, `accept_message`, `bug`, `suggestions`.
- `/set channel post` and `/set channel channel_post` require `track` and `channel`.
- Other `/set channel <target>` subcommands require only `channel`.
- `/set default` requires `Manage Server` (or `Administrator`) and applies one server-level default channel to all track/shared channel targets.
- `/set default` accepts optional `role..role_5` to apply the same accepted roles to every track (requires Manage Roles).
- `/set default` accepts optional `message` to set the accepted-announcement template.
- Application log channel messages are posted as embeds; decision-closure embeds use status colors (accepted=green, denied=red).
- Non-application log channel messages are posted as red embeds.
- `/bug` sends an embedded bug report into the configured bug channel and opens a discussion thread.
- `/suggestions` (and `/suggestion`) sends an embedded idea into the configured suggestions channel and opens a discussion thread.
- `/set approle` requires both `Manage Server` and `Manage Roles`, or `Administrator`.
- `/set approle` requires exactly one `track` per command and overwrites that track's roles.
- `track` options on `/set approle`, `/set channel`, `/debug`, `/track edit/remove`, and `/settings vote|reviewers|voters` support autocomplete suggestions.
- `/track` supports `add`, `edit`, `remove`, and `list`.
- `/set approle` supports up to 5 roles in one command: `role`, `role_2`, `role_3`, `role_4`, `role_5`.
- `/set approle` writes a configuration update entry to the configured logs channel.
- `/set denymsg` requires `Manage Server` (or `Administrator`) and sets the denied-DM template.
- `/set acceptmsg` requires `Manage Server` (or `Administrator`) and sets accepted-announcement channel/message.
- `/set acceptmsg` accepts `channel`, `message`, or both.
- `/rr` is a subcommand shortcut for reaction roles (`create|remove|list|gui`); `/reactionrole` remains supported.
- `/message` is the primary command for message tools (`structured|embed|edit`).
- `/msg` is an alias of `/message` with the same subcommands/options.
- Denied applications DM the resolved `discord_ID` user automatically (if available).
- Supported denied-DM placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{decision_source}`, `{reason}`, `{decided_at}`.
- Supported accepted-announcement placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{role_result}`, `{reason}`, `{decided_at}`.
- Stale pending reminders can be configured with `/settings reminders`.
- Reviewer assignment rotation can be configured with `/settings reviewers`.
- Daily digest schedule can be configured with `/settings digest`.
- Duplicate application warnings are posted automatically when matching recent submissions are detected.
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
- Maintenance rotates `CONTROL_LOG_FILE` by size and prunes old rotated control logs/crash logs using retention settings.
- Scheduled backups store `state-*.json` and `config-*.json` in `BACKUP_DIR` and prune by `BACKUP_MAX_FILES`.
- Optional operational alerts can post to `ALERT_WEBHOOK_URL` for startup, retry, crash, and stop/restart events.
- `npm run smoke` checks Discord auth + Google Sheets connectivity without starting the bot loop.
- `RUNBOOK.md` contains on-call response steps for downtime, rate limits, permissions, crash loops, and restore operations.
- Bot message send/edit and thread creation retry automatically on Discord rate limits (`429`).
- On accepted applications, bot attempts to grant the configured role to the resolved applicant Discord user.
