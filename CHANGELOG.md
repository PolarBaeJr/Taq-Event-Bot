# Changelog

All notable changes to this project are documented in this file.

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
