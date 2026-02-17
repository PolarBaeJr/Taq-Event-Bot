# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Operational alerting support via Discord webhook (`ALERT_WEBHOOK_URL`) for startup, retry, crash, and stop/restart actions.
- Scheduled backup snapshots for bot state and exported config (`BACKUP_*` settings).
- Maintenance manager for control-log rotation and crash-log retention cleanup.
- Connectivity smoke test script (`npm run smoke`) for Discord + Google Sheets checks.
- Runbook documentation (`RUNBOOK.md`) for incident response and restore flow.
- Branch-protection setup script (`npm run protect:main`) to enforce CI/review rules on `main`.
- New `/uptime` slash command to show current bot process uptime.

### Changed
- Startup config now includes env parsing for alerting, maintenance, and backup operations.

### Fixed
- Startup config validation no longer fails hard when optional Discord ID env vars contain placeholder values; invalid optional IDs are now ignored with warnings.
- Startup config path resolution no longer trims `cwd`, which fixes false missing-file errors for `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` in paths containing trailing spaces.

## [1.3.18] - 2026-02-17

### Added
- New `/set mode:default` server-default setup mode.

### Changed
- `/set mode:default` can apply one base channel to all track post channels and shared channels (`application_log`, `log`, `accept_message`, `bug`, `suggestions`).
- `/set mode:default` can optionally apply one accepted-role set across all tracks and optionally set the accepted-announcement template.

## [1.3.17] - 2026-02-17

### Changed
- Consolidated set-based slash commands into a single `/set` command with `mode` routing:
  - `mode:channel`
  - `mode:approle`
  - `mode:approlegui`
  - `mode:denymsg`
  - `mode:acceptmsg`
- Updated command guidance and runtime warning text to reference `/set` modes.

## [1.3.16] - 2026-02-17

### Changed
- `/settings` now uses a single command entry with `action` choices instead of many slash subcommands.
- All settings operations (`show`, `vote`, `voters`, `reviewers`, `reminders`, `digest`, `sheets`, `missingusermsg`, `export`, `import`) are now selected via `/settings action:<value>`.

## [1.3.15] - 2026-02-17

### Added
- New `/accept mode` option with `normal` and `force` choices.
- New `/unassignedrole` command to list accepted applications that could not receive roles because the applicant is not in the server.

### Changed
- Normal acceptance now blocks when the applicant is not in the server, keeps the application pending, and posts a warning in the application thread/channel.
- `/accept mode:force` bypasses the missing-member acceptance block and accepts anyway.

## [1.3.14] - 2026-02-17

### Added
- New `/settings missingusermsg` subcommand to configure the thread notice shown when an accepted applicant is not in the server.

### Changed
- The missing-user application thread notice is now configurable from Discord settings (default remains `user not in discord please dm`).

## [1.3.13] - 2026-02-17

### Fixed
- Hotfix: when an accepted applicant's Discord user is not in the server, the bot now posts `user not in discord please dm` in the application thread.

## [1.3.12] - 2026-02-17

### Added
- New `/settings voters` subcommand to set per-track vote-eligible roles from Discord.

### Changed
- Vote counting now supports optional per-track role filters; when configured, only members with allowed roles can cast `✅`/`❌` votes.
- `/settings show` now includes per-track vote-eligible role filters.

### Fixed
- Hotfix: reviewer-only voting behavior can now be enforced by role instead of counting all channel viewers.

## [1.3.11] - 2026-02-17

### Added
- New `/repostapps` command to repost tracked historical applications in row order to configured application post channels.

### Changed
- Discord log messages now use embeds consistently.
- Application closure logs now use decision color coding (accepted=green, denied=red).
- Non-application logs now use red embeds by default.

## [1.3.10] - 2026-02-17

### Added
- New `/setchannel application_log` option for application-only decision/digest logs.

### Changed
- `/setchannel log` is now the primary bot-operation/configuration logs channel.
- `/setchannel bot_log` remains available as a legacy alias for `log`.
- `/settings show` and `/debug report` now present application logs and general logs as separate values.

## [1.3.9] - 2026-02-17

### Added
- New `bot_log` channel option in `/setchannel` to route bot operation/config logs separately from application lifecycle logs.
- New env support for bot log routing: `DISCORD_BOT_LOGS_CHANNEL_ID` and `DISCORD_BOT_LOGS_CHANNEL_NAME`.

### Changed
- Bot control/configuration logs now post to the bot log channel, while application closure/digest logs continue using the application log channel.
- `/debug report` and `/settings show` now display separate application log and bot log channel values.

## [1.3.8] - 2026-02-17

### Added
- New `/settings sheets` subcommand to configure runtime Google `spreadsheet_id` and `sheet_name` without editing files.
- `/debug report` now shows active spreadsheet ID/sheet name and whether each value comes from state or env.

### Changed
- Polling now reads Google Sheets using active state overrides when configured, with automatic fallback to startup env values.
- Config export/import now includes `settings.sheetSource` (and accepts legacy `spreadsheetId`/`sheetName` on import).

## [1.3.7] - 2026-02-17

### Added
- `/settings export` to DM the current full settings JSON.
- `/settings import` to import full settings JSON directly from Discord.

### Changed
- `/settings` is now the primary command surface for full settings management, with `/config` still available as a compatibility alias.

## [1.3.6] - 2026-02-17

### Changed
- Auto track registration from form responses is now disabled by default.
- New env toggle `AUTO_REGISTER_TRACKS_FROM_FORM` allows explicitly re-enabling automatic custom-track creation when desired.

### Added
- `/debug report` now shows whether auto track registration from form responses is enabled.

## [1.3.5] - 2026-02-17

### Changed
- Queue processing now continues through other queued jobs when one job fails, instead of stopping at the first failure.
- Failed queue jobs are re-queued and retried in later runs without blocking healthy tracks/jobs in the same cycle.

### Fixed
- `/setchannel` replay summary messaging now reports failure counts as failed jobs instead of "blocked" wording.
- Added regression coverage for non-blocking queue processing after a failed job.

## [1.3.4] - 2026-02-17

### Added
- Expanded `/debug report` diagnostics for queue and posting health, including state-file path, tracked counts, queue head details, and posting pause reasons.
- Additional channel diagnostics in `/debug report` for logs/bug/suggestions channel IDs.

### Changed
- Queue pause logs now include queued job count when no post channels are configured.
- Queue run summary logs now include the first failed error snippet when a job blocks processing.

## [1.3.3] - 2026-02-17

### Added
- Interaction debug instrumentation for slash commands, GUI component interactions, and modal submissions.
- Command-level trace logs for newer configuration/admin workflows (`/setapprole`, `/useapprole`, `/reactionrole`, `/embedmsg`, `/embededit`, `/setchannel`, `/settings`, `/config`, `/track`).

### Changed
- Global interaction failure logging now includes stack traces, option summaries, select-menu values, and modal field summaries to make generic "Failed to process command." errors diagnosable.

## [1.3.2] - 2026-02-17

### Added
- Legacy `/useapprole` slash-command compatibility with `manage` and `gui` subcommands.

### Changed
- Track autocomplete now also supports the legacy `/useapprole` flow.

## [1.3.1] - 2026-02-17

### Fixed
- `/setapprole` now handles stale/legacy slash-command option payload shapes more safely.
- Accepted-role command failures now return clearer option/track guidance instead of only generic processing failure output.

## [1.3.0] - 2026-02-17

### Added
- New `/embededit` slash command to edit bot-authored embedded messages by message ID.
- Additional slash-command coverage test to validate `/embededit` registration.

### Changed
- Embed command handling now supports safe in-place embed edits (field-level updates, validation, and clear options for color/footer/timestamp).

## [1.1.1] - 2026-02-15

### Added
- Shared dynamic message system in `src/lib/dynamicMessageSystem.js` for unified embed payload creation.
- New parser helper module `src/lib/applicationMessageParser.js` for application post metadata extraction.
- Strict startup config/env validation module `src/lib/startupConfig.js`.
- Structured JSON logger module `src/lib/structuredLogger.js`.
- Automated syntax checks (`scripts/check-syntax.js`) and release helper (`scripts/release.js`).
- Test suite using Node test runner for message system, parser compatibility, and startup validation.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`).

### Changed
- Application posts, bug reports, suggestions, and debug post tests now share one embed generation path.
- Polling pipeline now consumes shared parser helpers and emits structured queue logs.
- Interaction command error handling now emits structured failure logs.
- Rate-limit retry utility now supports structured retry/failure logs.

## [1.1.0] - 2026-02-14

### Added
- Embedded layout for application posts, suggestions, and bugs.
- Debug post-test alignment with the same post layout used in normal application flow.
