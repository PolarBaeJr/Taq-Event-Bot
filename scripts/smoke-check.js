#!/usr/bin/env node
/*
  Project utility script for smoke check.
*/

const path = require("node:path");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const { loadStartupConfig } = require("../src/lib/startupConfig");

dotenv.config();

// Returns true when a CLI flag is present (e.g. --discord-only, --sheets-only).
function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

// Returns true when smoke-check should emit step-by-step debug output.
function isDebugEnabled() {
  if (hasFlag("--debug")) {
    return true;
  }
  const envValue = String(process.env.SMOKE_DEBUG || "").trim().toLowerCase();
  return envValue === "1" || envValue === "true" || envValue === "yes";
}

// Prints debug messages to stderr so JSON status output on stdout stays machine-readable.
function debugLog(enabled, message, extra = null) {
  if (!enabled) {
    return;
  }
  if (extra && typeof extra === "object") {
    console.error(`[smoke:debug] ${message}`, extra);
    return;
  }
  console.error(`[smoke:debug] ${message}`);
}

// Verifies the bot token by calling Discord's /users/@me endpoint.
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

// Builds an authenticated Google Sheets client from inline JSON or key-file config.
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

// Validates sheet access by reading A1 from the configured sheet.
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

// Command flow:
// 1) Validate startup config.
// 2) Decide which checks to run based on flags.
// 3) Run checks and collect structured status.
// 4) Print JSON and exit non-zero if any selected check failed.
async function main() {
  const debug = isDebugEnabled();
  debugLog(debug, "Starting smoke check.", {
    args: process.argv.slice(2),
    cwd: process.cwd(),
  });

  const validation = loadStartupConfig({
    env: process.env,
    cwd: process.cwd(),
  });
  debugLog(debug, "Startup config loaded.", {
    errors: validation.errors.length,
    warnings: validation.warnings.length,
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
  debugLog(debug, "Check selection resolved.", {
    runDiscord,
    runSheets,
    discordOnly,
    sheetsOnly,
  });

  const status = {
    checkedAt: new Date().toISOString(),
    discord: null,
    sheets: null,
  };

  if (runDiscord) {
    debugLog(debug, "Running Discord auth check.");
    try {
      const result = await checkDiscord(validation.config);
      status.discord = {
        ok: true,
        ...result,
      };
      debugLog(debug, "Discord check passed.", result);
    } catch (err) {
      status.discord = {
        ok: false,
        error: err?.message || String(err),
      };
      debugLog(debug, "Discord check failed.", status.discord);
    }
  }

  if (runSheets) {
    debugLog(debug, "Running Google Sheets check.", {
      sheetName: validation.config.sheetName,
      spreadsheetId: String(validation.config.spreadsheetId || "").slice(0, 8),
    });
    try {
      const result = await checkSheets(validation.config);
      status.sheets = {
        ok: true,
        ...result,
      };
      debugLog(debug, "Sheets check passed.", result);
    } catch (err) {
      status.sheets = {
        ok: false,
        error: err?.message || String(err),
      };
      debugLog(debug, "Sheets check failed.", status.sheets);
    }
  }

  console.log(JSON.stringify(status, null, 2));

  const failedDiscord = runDiscord && status.discord && status.discord.ok === false;
  const failedSheets = runSheets && status.sheets && status.sheets.ok === false;
  debugLog(debug, "Smoke check complete.", {
    failedDiscord,
    failedSheets,
  });
  if (failedDiscord || failedSheets) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[smoke] unexpected failure: ${err?.message || String(err)}`);
  process.exit(1);
});
