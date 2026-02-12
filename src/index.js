const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const REQUIRED_ENV = [
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SHEET_NAME",
  "GOOGLE_SERVICE_ACCOUNT_KEY_FILE",
  "DISCORD_WEBHOOK_URL",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CHANNEL_ID",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const config = {
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName: process.env.GOOGLE_SHEET_NAME,
  serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  botToken: process.env.DISCORD_BOT_TOKEN,
  channelId: process.env.DISCORD_CHANNEL_ID,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 30000),
  stateFile: process.env.STATE_FILE || ".bot-state.json",
  threadArchiveMinutes: Number(
    process.env.DISCORD_THREAD_AUTO_ARCHIVE_MINUTES || 10080
  ),
};

function readState() {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.lastRow === "number" ? parsed : { lastRow: 1 };
  } catch {
    return { lastRow: 1 };
  }
}

function writeState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

function sanitizeThreadName(name) {
  return name
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .trim()
    .slice(0, 90) || "Application Discussion";
}

function makeApplicationContent(headers, row) {
  const lines = [];
  for (let i = 0; i < headers.length; i += 1) {
    const key = (headers[i] || `Field ${i + 1}`).trim();
    const value = row[i] || "(empty)";
    lines.push(`**${key}:** ${String(value)}`);
  }
  return lines.join("\n");
}

function inferApplicantName(headers, row) {
  const candidates = ["name", "full name", "applicant", "discord name"];
  for (let i = 0; i < headers.length; i += 1) {
    const h = String(headers[i] || "").toLowerCase();
    if (candidates.some((c) => h.includes(c)) && row[i]) {
      return String(row[i]);
    }
  }
  return "Applicant";
}

async function getSheetsClient() {
  const keyPath = path.resolve(config.serviceAccountKeyFile);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readAllResponses() {
  const sheets = await getSheetsClient();
  const range = `${config.sheetName}!A:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });
  return response.data.values || [];
}

async function sendWebhookMessage(content) {
  const res = await fetch(`${config.webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook send failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function addReaction(messageId, emoji) {
  const encodedEmoji = encodeURIComponent(emoji);
  const url = `https://discord.com/api/v10/channels/${config.channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${config.botToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed adding reaction ${emoji} (${res.status}): ${body}`);
  }
}

async function createThread(messageId, name) {
  const url = `https://discord.com/api/v10/channels/${config.channelId}/messages/${messageId}/threads`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: sanitizeThreadName(name),
      auto_archive_duration: config.threadArchiveMinutes,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Thread creation failed (${res.status}): ${body}`);
  }
}

async function handleNewRow(headers, row, rowIndex) {
  const applicantName = inferApplicantName(headers, row);
  const content = [
    `📥 **New Application** (Row ${rowIndex})`,
    "",
    makeApplicationContent(headers, row),
  ].join("\n");

  const msg = await sendWebhookMessage(content);
  await addReaction(msg.id, "✅");
  await addReaction(msg.id, "❌");
  await createThread(msg.id, `Application - ${applicantName}`);
}

async function pollOnce() {
  const state = readState();
  const values = await readAllResponses();

  if (values.length === 0) {
    return;
  }

  const headers = values[0];
  const rows = values.slice(1);
  const startDataRow = Math.max(2, state.lastRow + 1);
  const endDataRow = rows.length + 1;

  if (startDataRow > endDataRow) {
    return;
  }

  for (let sheetRowNumber = startDataRow; sheetRowNumber <= endDataRow; sheetRowNumber += 1) {
    const row = values[sheetRowNumber - 1] || [];
    if (row.every((cell) => !cell)) {
      state.lastRow = sheetRowNumber;
      writeState(state);
      continue;
    }

    await handleNewRow(headers, row, sheetRowNumber);
    state.lastRow = sheetRowNumber;
    writeState(state);
  }
}

async function main() {
  console.log("Bot started. Polling for Google Form responses...");
  await pollOnce().catch((err) => {
    console.error("Initial poll failed:", err.message);
  });

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error("Poll failed:", err.message);
    }
  }, config.pollIntervalMs);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
