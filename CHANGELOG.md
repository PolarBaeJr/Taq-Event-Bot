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
