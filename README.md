# Taq Event Team Bot

Simple Node.js bot that:

1. Reads new Google Form responses from the linked Google Sheet.
2. Posts each application into a Discord channel through a webhook.
3. Adds `✅` and `❌` reactions for approve/decline.
4. Creates a thread per application message for team discussion.

## Requirements

- Node.js 18+
- A Google Form with response destination set to a Google Sheet
- A Google Cloud service account with read access to that sheet
- A Discord webhook URL for the target channel
- A Discord bot token in the same server/channel for reactions + thread creation

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Fill `.env` values.

4. Place your Google service account key file in the project root as `service-account.json` (or update `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).

5. Share the Google Sheet with the service account email (Viewer is enough).

6. Ensure Discord bot has these permissions in the target channel:
- `Read Message History`
- `Add Reactions`
- `Create Public Threads`
- `Send Messages in Threads`
- `View Channel`

7. Run:

```bash
npm start
```

## Notes

- The bot stores processed row state in `.bot-state.json`.
- If you want to reprocess from the start, delete `.bot-state.json`.
- `DISCORD_CHANNEL_ID` must match the channel used by the webhook URL.
