const test = require("node:test");
const assert = require("node:assert/strict");

const { loadStartupConfig } = require("../src/lib/startupConfig");

test("startup config validation reports missing required env", () => {
  const result = loadStartupConfig({
    env: {},
    cwd: process.cwd(),
  });

  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some((message) => message.includes("GOOGLE_SPREADSHEET_ID")));
  assert.ok(result.errors.some((message) => message.includes("GOOGLE_SHEET_NAME")));
  assert.ok(result.errors.some((message) => message.includes("DISCORD_BOT_TOKEN")));
});

test("startup config validation reports malformed ids", () => {
  const result = loadStartupConfig({
    env: {
      GOOGLE_SPREADSHEET_ID: "sheet",
      GOOGLE_SHEET_NAME: "Form Responses",
      DISCORD_BOT_TOKEN: "token",
      DISCORD_CLIENT_ID: "abc",
      GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
      DISCORD_TESTER_CHANNEL_ID: "xyz",
      DISCORD_TESTER_APPROVED_ROLE_IDS: "123,abc",
    },
    cwd: process.cwd(),
  });

  assert.ok(result.errors.some((message) => message.includes("DISCORD_CLIENT_ID")));
  assert.ok(result.warnings.some((message) => message.includes("DISCORD_TESTER_CHANNEL_ID")));
  assert.ok(result.warnings.some((message) => message.includes("DISCORD_TESTER_APPROVED_ROLE_IDS")));
});
