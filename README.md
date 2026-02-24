# Taq Event Team Bot

A Discord bot that polls Google Form responses, routes applications to track channels, manages approval voting, and grants roles on acceptance.

## Requirements

- Node.js 18+
- Google Form → Google Sheet (with service account read access)
- Discord bot token with appropriate channel permissions

## Setup

```bash
npm install
```

Create a `.env` file:

### Required env vars

| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application client ID |
| `GOOGLE_SPREADSHEET_ID` | Google Sheet ID |
| `GOOGLE_SHEET_NAME` | Sheet tab name |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | Path to service account JSON |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Raw/base64 JSON (alternative to key file) |

### Optional env vars

| Variable | Default | Description |
|---|---|---|
| `DISCORD_GUILD_ID` | — | Explicit guild ID override |
| `POLL_INTERVAL_MS` | `30000` | Polling interval in ms |
| `DISCORD_LOGS_CHANNEL_NAME` | `application-logs` | Application log channel name |
| `DISCORD_BOT_LOGS_CHANNEL_NAME` | `bot-logs` | Bot operation log channel name |
| `DISCORD_TESTER_CHANNEL_ID` | — | Tester channel fallback |
| `DISCORD_BUILDER_CHANNEL_ID` | — | Builder channel fallback |
| `DISCORD_CMD_CHANNEL_ID` | — | CMD channel fallback |
| `DISCORD_TESTER_APPROVED_ROLE_ID` | — | Tester role fallback |
| `DISCORD_BUILDER_APPROVED_ROLE_ID` | — | Builder role fallback |
| `DISCORD_CMD_APPROVED_ROLE_ID` | — | CMD role fallback |
| `STATE_FILE` | `.bot-state.json` | State file path |
| `CRASH_LOG_DIR` | `crashlog` | Crash log directory |
| `CONTROL_LOG_FILE` | `logs/control-actions.log` | Control action log path |
| `MAINTENANCE_INTERVAL_MINUTES` | `60` | Maintenance run interval |
| `LOG_RETENTION_DAYS` | `14` | Log retention period |
| `CRASH_LOG_RETENTION_DAYS` | `30` | Crash log retention period |
| `ALERT_WEBHOOK_URL` | — | Discord webhook for ops alerts |
| `ALERT_MENTION` | — | Text prefix for alert messages |
| `ALERT_COOLDOWN_SECONDS` | `300` | Per-alert throttle |
| `ALERT_ON_STARTUP` | `true` | Alert on startup |
| `ALERT_ON_RETRY` | `true` | Alert on retry |
| `ALERT_ON_CRASH` | `true` | Alert on crash |
| `BACKUP_DIR` | `backups` | Backup directory |
| `BACKUP_INTERVAL_MINUTES` | `360` | Backup interval |
| `BACKUP_MAX_FILES` | `60` | Max backup files to keep |

**Discord bot permissions required:** Read Message History, Send Messages, Add Reactions, Create Public Threads, Send Messages in Threads, Manage Threads, Manage Roles.

### First run

1. Place `service-account.json` in the project root (or set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).
2. Share the Google Sheet with the service account email (Viewer).
3. Start the bot: `npm start`
4. In Discord, configure channels and roles:

```
/set channel post track:tester channel:#tester-apps
/set channel post track:builder channel:#builder-apps
/set channel post track:cmd channel:#cmd-apps
/set channel application_log channel:#application-logs
/set approle track:tester role:@TesterRole
```

Or apply a single default to all tracks at once:
```
/set default channel:#apps role:@EventRole
```

## Slash Commands

### Configuration

| Command | Description |
|---|---|
| `/set channel post track:<t> channel:<c>` | Set post channel for a track |
| `/set channel application_log channel:<c>` | Set application log channel |
| `/set channel log channel:<c>` | Set bot log channel |
| `/set channel accept_message channel:<c>` | Set acceptance announcement channel |
| `/set channel bug channel:<c>` | Set bug report channel |
| `/set channel suggestions channel:<c>` | Set suggestions channel |
| `/set default channel:<c> [role:<r>] [message:<m>]` | Apply one channel/role to all tracks |
| `/set approle track:<t> role:<r> [role_2..role_5]` | Set approved roles for a track (up to 5) |
| `/set acceptmsg [channel:<c>] [message:<m>]` | Set acceptance announcement template |
| `/set denymsg message:<m>` | Set denied-DM template |
| `/settings vote track:<t> numerator:<n> denominator:<d> minimum_votes:<m>` | Configure vote threshold |
| `/settings voters track:<t> roles:<r>` | Restrict vote-eligible roles |
| `/settings reminders enabled:<bool> threshold_hours:<h> repeat_hours:<h>` | Configure stale reminders |
| `/settings reviewers track:<t> mentions:<m>` | Configure reviewer rotation |
| `/settings digest enabled:<bool> hour_utc:<h>` | Configure daily digest |
| `/settings sheets spreadsheet_id:<id> sheet_name:<n>` | Override active Google Sheet |
| `/settings export` / `/settings import json:<j>` | Export/import settings |
| `/config export` / `/config import json:<j>` | Backup/restore full config |

**Template placeholders:** `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{reason}`, `{decided_at}`, `{role_result}` (accept only), `{decision_source}` (deny only).

### Decisions

| Command | Description |
|---|---|
| `/accept job_id:<j> [reason:<r>] [mode:force]` | Accept an application |
| `/deny job_id:<j> [reason:<r>]` | Deny an application |
| `/reopen job_id:<j> [reason:<r>]` | Reopen a decided application |

`/accept` and `/deny` also accept `message_id` or can be run from inside the application thread. `mode:force` bypasses missing-member blocks.

### Tracks

```
/track add name:custom-track
/track edit name:custom-track [rename:new-name]
/track remove name:custom-track
/track list
/track questions list|add|remove|reset track:<t>
```

### Reaction Roles

```
/rr create message_id:<id> emoji:<e> role:@Role channel:<c>
/rr button role:@Role [role_2..] channel:<c> [color:green] [message_type:embed] [title:<t>] [embed_color:#hex]
/rr button_edit message_id:<id> channel:<c> [role:@Role] [color:red] [embed_color:#hex|clear] [remove_top_text:true]
/rr list
/rr remove message_id:<id> emoji:<e> channel:<c>
/rr gui
```

### Message Tools

```
/message structured title:<t> line_1:<l> [line_2..]
/message embed title:<t> description:<d> [color:#hex] [timestamp:true]
/message edit channel:<c> message_id:<id> [title:<t>] [footer:clear]
```

`/msg` is an alias for `/message`.

### Utilities

| Command | Description |
|---|---|
| `/dashboard` | Per-track pending/accepted/denied counts |
| `/uptime` | Current process uptime |
| `/unassignedrole [limit:<n>]` | List accepted apps with failed role assignment |
| `/repostapps [track:<t>] [limit:<n>]` | Replay historical applications to post channels |
| `/bug` | Post a bug report embed |
| `/suggestions` / `/suggestion` | Post a suggestion embed |
| `/debug mode:report` | Get diagnostic info by DM |
| `/debug mode:post_test [track:<t>]` | Live posting test |
| `/debug mode:accept_test job_id:<j> [user:<u>]` | Test acceptance flow |
| `/debug mode:deny_test job_id:<j> [user:<u>]` | Test denial flow |
| `/stop` / `/restart` | Stop or restart the bot |

`/accept`, `/deny`, `/debug accept/deny_test`, `/stop`, `/restart` require **Manage Server + Manage Roles** or **Administrator**.

## Development

```bash
npm start          # Run bot
npm run dev        # Run with auto-reload (nodemon)
npm run lint       # Syntax check
npm test           # Run all tests
npm run ci         # Lint + tests (used in CI)
npm run smoke      # Auth check without starting bot loop
npm run release -- patch   # Bump version and tag
```

Smoke check options: `--discord-only`, `--sheets-only`.

## Hosting

### PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
pm2 logs taq-event-bot
```

### Railway / Render

Set start command to `npm start`. Add all env vars. Use `GOOGLE_SERVICE_ACCOUNT_JSON` with raw or base64 JSON for credentials.

### Updating a VPS

```bash
git pull --ff-only origin main
npm ci --omit=dev
pm2 restart taq-event-bot --update-env
pm2 status
```

> `.env`, `service-account.json`, and `.bot-state.json` are git-ignored — sync manually via `scp`.

## Notes

- State is persisted in `.bot-state.json`. To reprocess from scratch, delete this file.
- Applications are queued as `job-000001` etc. and retried in row order on failure.
- Track routing infers from form keywords (`tester`, `builder`, `cmd`). Defaults to `tester` if none match.
- Multi-select track responses post to multiple channels (one embed per track).
- Votes count only non-bot users who can view the configured channel. Both-reaction users are ignored until resolved.
- Crash logs write to `crashlog/`. Operational alerts can post to `ALERT_WEBHOOK_URL`.
- See `RUNBOOK.md` for on-call response steps.
