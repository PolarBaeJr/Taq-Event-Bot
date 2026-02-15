#!/usr/bin/env node
const path = require("node:path");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const { loadStartupConfig } = require("../src/lib/startupConfig");

dotenv.config();

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

async function checkDiscord(config) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bot ${config.botToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord auth check failed (${response.status}): ${body}`);
  }
  const me = await response.json();
  return {
    id: me.id,
    username: me.username,
  };
}

async function getSheetsClient(config) {
  let authOptions;
  if (config.serviceAccountJson) {
    const raw = String(config.serviceAccountJson).trim();
    const decoded = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    authOptions = {
      credentials: JSON.parse(decoded),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  } else {
    authOptions = {
      keyFile: path.resolve(config.serviceAccountKeyFile),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  }
  const auth = new google.auth.GoogleAuth(authOptions);
  return google.sheets({ version: "v4", auth });
}

async function checkSheets(config) {
  const sheets = await getSheetsClient(config);
  const range = `${config.sheetName}!A1:A1`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });
  return {
    range,
    valuesLength: Array.isArray(response.data?.values) ? response.data.values.length : 0,
  };
}

async function main() {
  const validation = loadStartupConfig({
    env: process.env,
    cwd: process.cwd(),
  });
  if (validation.errors.length > 0) {
    for (const message of validation.errors) {
      console.error(`[smoke] config error: ${message}`);
    }
    process.exit(1);
  }

  const discordOnly = hasFlag("--discord-only");
  const sheetsOnly = hasFlag("--sheets-only");
  const runDiscord = !sheetsOnly;
  const runSheets = !discordOnly;

  const status = {
    checkedAt: new Date().toISOString(),
    discord: null,
    sheets: null,
  };

  if (runDiscord) {
    try {
      const result = await checkDiscord(validation.config);
      status.discord = {
        ok: true,
        ...result,
      };
    } catch (err) {
      status.discord = {
        ok: false,
        error: err?.message || String(err),
      };
    }
  }

  if (runSheets) {
    try {
      const result = await checkSheets(validation.config);
      status.sheets = {
        ok: true,
        ...result,
      };
    } catch (err) {
      status.sheets = {
        ok: false,
        error: err?.message || String(err),
      };
    }
  }

  console.log(JSON.stringify(status, null, 2));

  const failedDiscord = runDiscord && status.discord && status.discord.ok === false;
  const failedSheets = runSheets && status.sheets && status.sheets.ok === false;
  if (failedDiscord || failedSheets) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[smoke] unexpected failure: ${err?.message || String(err)}`);
  process.exit(1);
});
