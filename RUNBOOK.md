# Runbook

## Quick Checks

1. Verify process status:
```bash
ls -l .bot.pid
cat .bot.pid
```
2. Run smoke check:
```bash
npm run smoke
```
3. Check recent logs:
```bash
tail -n 100 logs/control-actions.log
ls -lt crashlog | head
```

## Bot Down

1. Check environment file and credentials:
```bash
cat .env
ls -l service-account.json
```
2. Validate startup + external dependencies:
```bash
npm run smoke
```
3. Restart bot:
```bash
npm run restart
```
4. If still down, run foreground start and inspect structured logs:
```bash
npm start
```

## Rate Limit / API Errors

1. Confirm Discord and Google are reachable:
```bash
npm run smoke
```
2. Review structured logs for `discord_rate_limit_retry` and `queue_job_failed`.
3. Keep bot running; retry logic will back off automatically.
4. If needed, increase `POLL_INTERVAL_MS` temporarily.

## Permissions Changed

1. Run permission audit through startup or command flow (`/setchannel` then restart).
2. Ensure bot has:
- `ViewChannel`
- `ReadMessageHistory`
- `SendMessages`
- `AddReactions`
- `CreatePublicThreads`
- `SendMessagesInThreads`
- `ManageChannels` (for logs channel creation)
- `ManageRoles` (for role assignment)
3. Re-run:
```bash
npm run smoke -- --discord-only
```

## Crash Loop

1. Inspect newest crash file:
```bash
ls -lt crashlog | head
cat crashlog/<latest-file>.log
```
2. Check alerts channel/webhook history (if `ALERT_WEBHOOK_URL` is configured).
3. Fix root cause, then restart:
```bash
npm run restart
```

## Backups and Restore

Backups are written to `BACKUP_DIR` (default `backups/`) as:
- `state-<timestamp>.json`
- `config-<timestamp>.json`

Restore state:
1. Stop bot.
2. Copy target backup into active state file path (`STATE_FILE`, default `.bot-state.json`).
3. Start bot.

Restore config:
1. Use `config-*.json` content with `/config import`.

## Branch Protection Setup

Apply main-branch protection (requires repo-admin GitHub token):

```bash
export GH_TOKEN=your_token_with_repo_admin_scope
npm run protect:main
```

This config enforces:
- required check `validate`
- at least 1 approving review
- dismiss stale reviews
- linear history
- no force pushes/deletions

## Useful Commands

```bash
npm run ci
npm run smoke
npm run start:background
npm run stop:background
npm run restart:background
```
