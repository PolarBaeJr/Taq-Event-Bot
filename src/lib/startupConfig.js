const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ENV = [
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SHEET_NAME",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
];

const OPTIONAL_SNOWFLAKE_ENV_KEYS = [
  "DISCORD_GUILD_ID",
  "DISCORD_TESTER_CHANNEL_ID",
  "DISCORD_BUILDER_CHANNEL_ID",
  "DISCORD_CMD_CHANNEL_ID",
  "DISCORD_CHANNEL_ID",
  "DISCORD_LOGS_CHANNEL_ID",
  "DISCORD_BUG_CHANNEL_ID",
  "DISCORD_SUGGESTIONS_CHANNEL_ID",
  "ACCEPT_ANNOUNCE_CHANNEL_ID",
  "DISCORD_TESTER_APPROVED_ROLE_ID",
  "DISCORD_BUILDER_APPROVED_ROLE_ID",
  "DISCORD_CMD_APPROVED_ROLE_ID",
  "DISCORD_APPROVED_ROLE_ID",
];

const OPTIONAL_SNOWFLAKE_LIST_ENV_KEYS = [
  "DISCORD_TESTER_APPROVED_ROLE_IDS",
  "DISCORD_BUILDER_APPROVED_ROLE_IDS",
  "DISCORD_CMD_APPROVED_ROLE_IDS",
  "DISCORD_APPROVED_ROLE_IDS",
];

const VALID_THREAD_ARCHIVE_MINUTES = new Set([60, 1440, 4320, 10080]);

function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(normalizeString(value));
}

function parseSnowflakeList(raw) {
  const tokens = normalizeString(raw).split(/[,\s]+/).filter(Boolean);
  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const token of tokens) {
    if (!isSnowflake(token)) {
      invalid.push(token);
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    valid.push(token);
  }

  return {
    valid,
    invalid,
  };
}

function parseNumberEnv(env, key, defaultValue, rules = {}, errors = []) {
  const raw = normalizeString(env[key]);
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push(`${key} must be a number. Received: "${raw}"`);
    return defaultValue;
  }

  if (rules.integer && !Number.isInteger(value)) {
    errors.push(`${key} must be an integer. Received: "${raw}"`);
    return defaultValue;
  }

  if (Number.isFinite(rules.min) && value < rules.min) {
    errors.push(`${key} must be >= ${rules.min}. Received: "${raw}"`);
    return defaultValue;
  }

  if (Number.isFinite(rules.max) && value > rules.max) {
    errors.push(`${key} must be <= ${rules.max}. Received: "${raw}"`);
    return defaultValue;
  }

  if (rules.allowedValues && !rules.allowedValues.has(value)) {
    const allowed = [...rules.allowedValues].join(", ");
    errors.push(`${key} must be one of [${allowed}]. Received: "${raw}"`);
    return defaultValue;
  }

  return value;
}

function loadStartupConfig(options = {}) {
  const env = options.env && typeof options.env === "object" ? options.env : process.env;
  const cwd =
    typeof options.cwd === "string" && options.cwd.length > 0
      ? options.cwd
      : process.cwd();
  const errors = [];
  const warnings = [];

  for (const key of REQUIRED_ENV) {
    if (!normalizeString(env[key])) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  if (!normalizeString(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) &&
      !normalizeString(env.GOOGLE_SERVICE_ACCOUNT_JSON)) {
    errors.push(
      "Missing Google credentials: set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON"
    );
  }

  if (normalizeString(env.DISCORD_CLIENT_ID) && !isSnowflake(env.DISCORD_CLIENT_ID)) {
    errors.push("DISCORD_CLIENT_ID must be a valid Discord snowflake.");
  }

  const optionalSnowflakeValues = {};
  for (const key of OPTIONAL_SNOWFLAKE_ENV_KEYS) {
    const value = normalizeString(env[key]);
    if (!value) {
      optionalSnowflakeValues[key] = null;
      continue;
    }
    if (!isSnowflake(value)) {
      warnings.push(`${key} is not a valid Discord snowflake; ignoring configured value.`);
      optionalSnowflakeValues[key] = null;
      continue;
    }
    optionalSnowflakeValues[key] = value;
  }

  const optionalSnowflakeListValues = {};
  for (const key of OPTIONAL_SNOWFLAKE_LIST_ENV_KEYS) {
    const value = normalizeString(env[key]);
    if (!value) {
      optionalSnowflakeListValues[key] = [];
      continue;
    }
    const parsed = parseSnowflakeList(value);
    if (parsed.invalid.length > 0) {
      warnings.push(`${key} contains invalid IDs and they were ignored: ${parsed.invalid.join(", ")}`);
    }
    optionalSnowflakeListValues[key] = parsed.valid;
  }

  const serviceAccountKeyFile = normalizeString(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  if (serviceAccountKeyFile && !normalizeString(env.GOOGLE_SERVICE_ACCOUNT_JSON)) {
    const resolvedKeyPath = path.resolve(cwd, serviceAccountKeyFile);
    if (!fs.existsSync(resolvedKeyPath)) {
      errors.push(
        `GOOGLE_SERVICE_ACCOUNT_KEY_FILE does not exist: ${resolvedKeyPath}`
      );
    }
  }

  const config = {
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    sheetName: env.GOOGLE_SHEET_NAME,
    serviceAccountKeyFile,
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    botToken: env.DISCORD_BOT_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    guildId: optionalSnowflakeValues.DISCORD_GUILD_ID,
    testerChannelId: optionalSnowflakeValues.DISCORD_TESTER_CHANNEL_ID,
    builderChannelId: optionalSnowflakeValues.DISCORD_BUILDER_CHANNEL_ID,
    cmdChannelId: optionalSnowflakeValues.DISCORD_CMD_CHANNEL_ID,
    channelId: optionalSnowflakeValues.DISCORD_CHANNEL_ID,
    pollIntervalMs: parseNumberEnv(env, "POLL_INTERVAL_MS", 30000, {
      integer: true,
      min: 1000,
    }, errors),
    stateFile: env.STATE_FILE || ".bot-state.json",
    crashLogDir: env.CRASH_LOG_DIR || "crashlog",
    controlLogFile: env.CONTROL_LOG_FILE || "logs/control-actions.log",
    logsChannelName: env.DISCORD_LOGS_CHANNEL_NAME || "application-logs",
    logsChannelId: optionalSnowflakeValues.DISCORD_LOGS_CHANNEL_ID,
    bugChannelId: optionalSnowflakeValues.DISCORD_BUG_CHANNEL_ID,
    suggestionsChannelId: optionalSnowflakeValues.DISCORD_SUGGESTIONS_CHANNEL_ID,
    acceptAnnounceChannelId: optionalSnowflakeValues.ACCEPT_ANNOUNCE_CHANNEL_ID,
    acceptAnnounceTemplate: env.ACCEPT_ANNOUNCE_TEMPLATE,
    denyDmTemplate: env.DENY_DM_TEMPLATE,
    testerApprovedRoleIds: optionalSnowflakeListValues.DISCORD_TESTER_APPROVED_ROLE_IDS,
    builderApprovedRoleIds: optionalSnowflakeListValues.DISCORD_BUILDER_APPROVED_ROLE_IDS,
    cmdApprovedRoleIds: optionalSnowflakeListValues.DISCORD_CMD_APPROVED_ROLE_IDS,
    approvedRoleIds: optionalSnowflakeListValues.DISCORD_APPROVED_ROLE_IDS,
    testerApprovedRoleId: optionalSnowflakeValues.DISCORD_TESTER_APPROVED_ROLE_ID,
    builderApprovedRoleId: optionalSnowflakeValues.DISCORD_BUILDER_APPROVED_ROLE_ID,
    cmdApprovedRoleId: optionalSnowflakeValues.DISCORD_CMD_APPROVED_ROLE_ID,
    approvedRoleId: optionalSnowflakeValues.DISCORD_APPROVED_ROLE_ID,
    startupRetryMs: parseNumberEnv(env, "STARTUP_RETRY_MS", 15000, {
      integer: true,
      min: 1000,
    }, errors),
    threadArchiveMinutes: parseNumberEnv(env, "DISCORD_THREAD_AUTO_ARCHIVE_MINUTES", 10080, {
      integer: true,
      allowedValues: VALID_THREAD_ARCHIVE_MINUTES,
    }, errors),
    reminderThresholdHours: parseNumberEnv(env, "REMINDER_THRESHOLD_HOURS", 24, {
      min: 0.5,
    }, errors),
    reminderRepeatHours: parseNumberEnv(env, "REMINDER_REPEAT_HOURS", 12, {
      min: 0.5,
    }, errors),
    dailyDigestEnabled: normalizeString(env.DAILY_DIGEST_ENABLED || "true")
      .toLowerCase() !== "false",
    dailyDigestHourUtc: parseNumberEnv(env, "DAILY_DIGEST_HOUR_UTC", 15, {
      integer: true,
      min: 0,
      max: 23,
    }, errors),
    duplicateLookbackDays: parseNumberEnv(env, "DUPLICATE_LOOKBACK_DAYS", 60, {
      integer: true,
      min: 1,
    }, errors),
  };

  if (config.dailyDigestEnabled && !Number.isInteger(config.dailyDigestHourUtc)) {
    warnings.push("Daily digest is enabled but DAILY_DIGEST_HOUR_UTC is invalid. Using fallback.");
  }

  return {
    config,
    errors,
    warnings,
  };
}

module.exports = {
  REQUIRED_ENV,
  OPTIONAL_SNOWFLAKE_ENV_KEYS,
  OPTIONAL_SNOWFLAKE_LIST_ENV_KEYS,
  VALID_THREAD_ARCHIVE_MINUTES,
  isSnowflake,
  parseSnowflakeList,
  loadStartupConfig,
};
