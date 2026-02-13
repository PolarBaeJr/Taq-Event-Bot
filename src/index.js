const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

dotenv.config();

const REQUIRED_ENV = [
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SHEET_NAME",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

if (
  !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE &&
  !process.env.GOOGLE_SERVICE_ACCOUNT_JSON
) {
  console.error(
    "Missing Google credentials: set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON"
  );
  process.exit(1);
}

const config = {
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
  sheetName: process.env.GOOGLE_SHEET_NAME,
  serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  botToken: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  testerChannelId: process.env.DISCORD_TESTER_CHANNEL_ID,
  builderChannelId: process.env.DISCORD_BUILDER_CHANNEL_ID,
  cmdChannelId: process.env.DISCORD_CMD_CHANNEL_ID,
  channelId: process.env.DISCORD_CHANNEL_ID,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 30000),
  stateFile: process.env.STATE_FILE || ".bot-state.json",
  crashLogDir: process.env.CRASH_LOG_DIR || "crashlog",
  controlLogFile: process.env.CONTROL_LOG_FILE || "logs/control-actions.log",
  logsChannelName: process.env.DISCORD_LOGS_CHANNEL_NAME || "application-logs",
  logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID,
  acceptAnnounceChannelId: process.env.ACCEPT_ANNOUNCE_CHANNEL_ID,
  acceptAnnounceTemplate: process.env.ACCEPT_ANNOUNCE_TEMPLATE,
  denyDmTemplate: process.env.DENY_DM_TEMPLATE,
  testerApprovedRoleIds: process.env.DISCORD_TESTER_APPROVED_ROLE_IDS,
  builderApprovedRoleIds: process.env.DISCORD_BUILDER_APPROVED_ROLE_IDS,
  cmdApprovedRoleIds: process.env.DISCORD_CMD_APPROVED_ROLE_IDS,
  approvedRoleIds: process.env.DISCORD_APPROVED_ROLE_IDS,
  testerApprovedRoleId: process.env.DISCORD_TESTER_APPROVED_ROLE_ID,
  builderApprovedRoleId: process.env.DISCORD_BUILDER_APPROVED_ROLE_ID,
  cmdApprovedRoleId: process.env.DISCORD_CMD_APPROVED_ROLE_ID,
  approvedRoleId: process.env.DISCORD_APPROVED_ROLE_ID,
  startupRetryMs: Number(process.env.STARTUP_RETRY_MS || 15000),
  threadArchiveMinutes: Number(
    process.env.DISCORD_THREAD_AUTO_ARCHIVE_MINUTES || 10080
  ),
};

const TRACK_TESTER = "tester";
const TRACK_BUILDER = "builder";
const TRACK_CMD = "cmd";
const DEFAULT_TRACK_KEY = TRACK_TESTER;
const APPLICATION_TRACKS = [
  {
    key: TRACK_TESTER,
    label: "Tester",
    aliases: ["tester", "test", "qa"],
  },
  {
    key: TRACK_BUILDER,
    label: "Builder",
    aliases: ["builder", "build"],
  },
  {
    key: TRACK_CMD,
    label: "CMD",
    aliases: ["cmd", "command", "commands"],
  },
];
const APPLICATION_TRACK_KEYS = APPLICATION_TRACKS.map((track) => track.key);
const TRACK_LOOKUP_BY_KEY = Object.fromEntries(
  APPLICATION_TRACKS.map((track) => [track.key, track])
);

const STATUS_PENDING = "pending";
const STATUS_ACCEPTED = "accepted";
const STATUS_DENIED = "denied";
const DEBUG_MODE_REPORT = "report";
const DEBUG_MODE_POST_TEST = "post_test";
const DEBUG_MODE_ACCEPT_TEST = "accept_test";
const DEBUG_MODE_DENY_TEST = "deny_test";

const ACCEPT_EMOJI = "✅";
const DENY_EMOJI = "❌";
const REQUIRED_CHANNEL_PERMISSIONS = [
  ["ViewChannel", PermissionsBitField.Flags.ViewChannel],
  ["ReadMessageHistory", PermissionsBitField.Flags.ReadMessageHistory],
  ["SendMessages", PermissionsBitField.Flags.SendMessages],
  ["AddReactions", PermissionsBitField.Flags.AddReactions],
  ["CreatePublicThreads", PermissionsBitField.Flags.CreatePublicThreads],
  ["SendMessagesInThreads", PermissionsBitField.Flags.SendMessagesInThreads],
];
const REQUIRED_GUILD_PERMISSIONS = [
  ["ManageChannels", PermissionsBitField.Flags.ManageChannels],
];
let loggedNoChannelWarning = false;
const JOB_ID_PATTERN = /^job-(\d+)$/i;
const JOB_TYPE_POST_APPLICATION = "post_application";
let isProcessingPostJobs = false;
const DEFAULT_DENY_DM_TEMPLATE = [
  "Your application has been denied.",
  "",
  "Track: {track}",
  "Application ID: {application_id}",
  "Job ID: {job_id}",
  "Server: {server}",
].join("\n");
const DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE =
  "Welcome to {track} team, if you need any information please contact administrators.";

function normalizeCell(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function formatJobId(sequence) {
  return `job-${String(sequence).padStart(6, "0")}`;
}

function parseJobIdSequence(jobId) {
  if (typeof jobId !== "string") {
    return 0;
  }
  const match = JOB_ID_PATTERN.exec(jobId.trim());
  if (!match) {
    return 0;
  }
  const sequence = Number(match[1]);
  if (!Number.isInteger(sequence) || sequence <= 0) {
    return 0;
  }
  return sequence;
}

function compareJobsByOrder(a, b) {
  const rowDiff = a.rowIndex - b.rowIndex;
  if (rowDiff !== 0) {
    return rowDiff;
  }

  const aSeq = parseJobIdSequence(a.jobId);
  const bSeq = parseJobIdSequence(b.jobId);
  if (aSeq > 0 && bSeq > 0 && aSeq !== bSeq) {
    return aSeq - bSeq;
  }

  const aCreated = Date.parse(a.createdAt || "");
  const bCreated = Date.parse(b.createdAt || "");
  if (!Number.isNaN(aCreated) && !Number.isNaN(bCreated) && aCreated !== bCreated) {
    return aCreated - bCreated;
  }

  return String(a.jobId).localeCompare(String(b.jobId));
}

function sortPostJobsInPlace(postJobs) {
  postJobs.sort(compareJobsByOrder);
}

function normalizeTrackKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const track of APPLICATION_TRACKS) {
    if (track.key === normalized || track.aliases.includes(normalized)) {
      return track.key;
    }
  }
  return null;
}

function getTrackLabel(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  return TRACK_LOOKUP_BY_KEY[normalized]?.label || TRACK_LOOKUP_BY_KEY[DEFAULT_TRACK_KEY].label;
}

function normalizeTrackKeys(values, options = {}) {
  const { allowEmpty = false } = options;
  const fallback = Object.prototype.hasOwnProperty.call(options, "fallback")
    ? options.fallback
    : [DEFAULT_TRACK_KEY];

  const unique = new Set();
  const source = Array.isArray(values) ? values : [values];
  for (const value of source) {
    const normalized = normalizeTrackKey(value);
    if (normalized) {
      unique.add(normalized);
    }
  }

  const ordered = APPLICATION_TRACK_KEYS.filter((key) => unique.has(key));
  if (ordered.length > 0) {
    return ordered;
  }

  const fallbackSet = new Set();
  const fallbackSource = Array.isArray(fallback) ? fallback : [fallback];
  for (const value of fallbackSource) {
    const normalized = normalizeTrackKey(value);
    if (normalized) {
      fallbackSet.add(normalized);
    }
  }
  const fallbackOrdered = APPLICATION_TRACK_KEYS.filter((key) =>
    fallbackSet.has(key)
  );
  if (fallbackOrdered.length > 0) {
    return fallbackOrdered;
  }

  return allowEmpty ? [] : [DEFAULT_TRACK_KEY];
}

function formatTrackLabels(trackKeys) {
  return normalizeTrackKeys(trackKeys).map(getTrackLabel).join(", ");
}

function getTrackApplicationIdPrefix(trackKey) {
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const label = getTrackLabel(normalizedTrack);
  const cleaned = String(label).replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  return cleaned || "APP";
}

function buildApplicationId(trackKey, jobId, fallbackSequence = null) {
  let sequence = parseJobIdSequence(jobId);
  if (
    sequence <= 0 &&
    Number.isInteger(fallbackSequence) &&
    fallbackSequence > 0
  ) {
    sequence = fallbackSequence;
  }
  if (sequence <= 0) {
    return null;
  }
  return `${getTrackApplicationIdPrefix(trackKey)}-${sequence}`;
}

function getApplicationDisplayId(application, fallbackMessageId = null) {
  const derived = buildApplicationId(application?.trackKey, application?.jobId);
  if (derived) {
    return derived;
  }

  const explicit = String(application?.applicationId || "").trim();
  if (explicit) {
    return explicit;
  }

  const messageId = String(application?.messageId || fallbackMessageId || "").trim();
  return messageId || "Unknown";
}

function createEmptyTrackMap() {
  return {
    [TRACK_TESTER]: null,
    [TRACK_BUILDER]: null,
    [TRACK_CMD]: null,
  };
}

function createEmptyTrackRoleMap() {
  return {
    [TRACK_TESTER]: [],
    [TRACK_BUILDER]: [],
    [TRACK_CMD]: [],
  };
}

function normalizeTrackMap(rawMap) {
  const normalized = createEmptyTrackMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key || !isSnowflake(rawValue)) {
      continue;
    }
    normalized[key] = rawValue;
  }

  return normalized;
}

function normalizeTrackRoleMap(rawMap) {
  const normalized = createEmptyTrackRoleMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key) {
      continue;
    }
    normalized[key] = parseRoleIdList(rawValue);
  }

  return normalized;
}

function defaultState() {
  return {
    lastRow: 1,
    applications: {},
    threads: {},
    controlActions: [],
    nextJobId: 1,
    postJobs: [],
    settings: {
      channels: createEmptyTrackMap(),
      logChannelId: null,
      approvedRoles: createEmptyTrackRoleMap(),
      acceptAnnounceChannelId: null,
      acceptAnnounceTemplate: null,
      denyDmTemplate: null,
    },
  };
}

function readState() {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    const postJobs = [];
    const usedJobIds = new Set();
    let generatedSequence = 1;
    let highestSeenSequence = 0;
    const rawJobs = Array.isArray(parsed.postJobs) ? parsed.postJobs : [];

    for (const rawJob of rawJobs) {
      if (!rawJob || typeof rawJob !== "object") {
        continue;
      }

      const rowIndex = Number(rawJob.rowIndex);
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        continue;
      }

      let jobSequence = parseJobIdSequence(rawJob.jobId);
      if (jobSequence <= 0 || usedJobIds.has(formatJobId(jobSequence))) {
        while (usedJobIds.has(formatJobId(generatedSequence))) {
          generatedSequence += 1;
        }
        jobSequence = generatedSequence;
      }

      const normalizedJobId = formatJobId(jobSequence);
      usedJobIds.add(normalizedJobId);
      highestSeenSequence = Math.max(highestSeenSequence, jobSequence);
      if (generatedSequence <= jobSequence) {
        generatedSequence = jobSequence + 1;
      }

      const normalizedHeaders = Array.isArray(rawJob.headers)
        ? rawJob.headers.map(normalizeCell)
        : [];
      const normalizedRow = Array.isArray(rawJob.row)
        ? rawJob.row.map(normalizeCell)
        : [];

      postJobs.push({
        jobId: normalizedJobId,
        type: JOB_TYPE_POST_APPLICATION,
        rowIndex,
        trackKeys: normalizeTrackKeys(
          Array.isArray(rawJob.trackKeys) ? rawJob.trackKeys : rawJob.trackKey,
          {
            fallback: inferApplicationTracks(normalizedHeaders, normalizedRow),
          }
        ),
        postedTrackKeys: normalizeTrackKeys(rawJob.postedTrackKeys, {
          allowEmpty: true,
          fallback: [],
        }),
        responseKey:
          typeof rawJob.responseKey === "string" && rawJob.responseKey.trim()
            ? rawJob.responseKey.trim()
            : buildResponseKey(normalizedHeaders, normalizedRow),
        headers: normalizedHeaders,
        row: normalizedRow,
        createdAt:
          typeof rawJob.createdAt === "string"
            ? rawJob.createdAt
            : new Date().toISOString(),
        attempts:
          Number.isInteger(rawJob.attempts) && rawJob.attempts >= 0
            ? rawJob.attempts
            : 0,
        lastAttemptAt:
          typeof rawJob.lastAttemptAt === "string" ? rawJob.lastAttemptAt : null,
        lastError: typeof rawJob.lastError === "string" ? rawJob.lastError : null,
      });
    }
    sortPostJobsInPlace(postJobs);

    let nextJobId = Number(parsed.nextJobId);
    if (!Number.isInteger(nextJobId) || nextJobId < 1) {
      nextJobId = 1;
    }
    if (nextJobId <= highestSeenSequence) {
      nextJobId = highestSeenSequence + 1;
    }

    const legacySettings = parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : {};
    const normalizedChannels = normalizeTrackMap(legacySettings.channels);
    const normalizedApprovedRoles = normalizeTrackRoleMap(legacySettings.approvedRoles);
    if (isSnowflake(legacySettings.channelId) && !normalizedChannels[TRACK_TESTER]) {
      normalizedChannels[TRACK_TESTER] = legacySettings.channelId;
    }
    if (
      isSnowflake(legacySettings.approvedRoleId) &&
      normalizedApprovedRoles[TRACK_TESTER].length === 0
    ) {
      normalizedApprovedRoles[TRACK_TESTER] = [legacySettings.approvedRoleId];
    }

    return {
      lastRow: typeof parsed.lastRow === "number" ? parsed.lastRow : 1,
      applications:
        parsed.applications && typeof parsed.applications === "object"
          ? parsed.applications
          : {},
      threads:
        parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {},
      controlActions:
        Array.isArray(parsed.controlActions) ? parsed.controlActions : [],
      nextJobId,
      postJobs,
      settings: {
        channels: normalizedChannels,
        logChannelId: isSnowflake(legacySettings.logChannelId)
          ? legacySettings.logChannelId
          : null,
        approvedRoles: normalizedApprovedRoles,
        acceptAnnounceChannelId: isSnowflake(legacySettings.acceptAnnounceChannelId)
          ? legacySettings.acceptAnnounceChannelId
          : null,
        acceptAnnounceTemplate:
          typeof legacySettings.acceptAnnounceTemplate === "string" &&
          legacySettings.acceptAnnounceTemplate.trim()
            ? legacySettings.acceptAnnounceTemplate
            : null,
        denyDmTemplate:
          typeof legacySettings.denyDmTemplate === "string" &&
          legacySettings.denyDmTemplate.trim()
            ? legacySettings.denyDmTemplate
            : null,
      },
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

function toCrashFileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function serializeCrashReason(reason) {
  if (reason instanceof Error) {
    return {
      type: "Error",
      name: reason.name,
      message: reason.message,
      code: reason.code || null,
      stack: reason.stack || null,
    };
  }

  if (typeof reason === "string") {
    return {
      type: "string",
      value: reason,
    };
  }

  try {
    return {
      type: typeof reason,
      value: JSON.stringify(reason, null, 2),
    };
  } catch {
    return {
      type: typeof reason,
      value: String(reason),
    };
  }
}

function writeCrashLog(kind, reason, extra = null) {
  const at = new Date();
  const crashDir = path.resolve(config.crashLogDir || "crashlog");
  if (!fs.existsSync(crashDir)) {
    fs.mkdirSync(crashDir, { recursive: true });
  }

  const baseName = `crash-${toCrashFileTimestamp(at)}`;
  let crashPath = path.join(crashDir, `${baseName}.log`);
  let suffix = 1;
  while (fs.existsSync(crashPath)) {
    crashPath = path.join(crashDir, `${baseName}-${suffix}.log`);
    suffix += 1;
  }

  const payload = {
    kind,
    at: at.toISOString(),
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    reason: serializeCrashReason(reason),
    extra: extra || null,
  };

  fs.writeFileSync(crashPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return crashPath;
}

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function parseRoleIdList(value) {
  const out = [];
  const seen = new Set();

  if (Array.isArray(value)) {
    for (const item of value) {
      const roleId = String(item || "").trim();
      if (!isSnowflake(roleId) || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push(roleId);
    }
    return out;
  }

  if (isSnowflake(value)) {
    return [value.trim()];
  }

  if (typeof value === "string" && value.trim()) {
    const parts = value.split(/[,\s]+/);
    for (const part of parts) {
      const roleId = String(part || "").trim();
      if (!isSnowflake(roleId) || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push(roleId);
    }
  }

  return out;
}

function getEnvChannelIdForTrack(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  if (normalized === TRACK_TESTER) {
    if (isSnowflake(config.testerChannelId)) {
      return config.testerChannelId;
    }
    if (isSnowflake(config.channelId)) {
      return config.channelId;
    }
    return null;
  }
  if (normalized === TRACK_BUILDER && isSnowflake(config.builderChannelId)) {
    return config.builderChannelId;
  }
  if (normalized === TRACK_CMD && isSnowflake(config.cmdChannelId)) {
    return config.cmdChannelId;
  }
  return null;
}

function getEnvApprovedRoleIdsForTrack(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  if (normalized === TRACK_TESTER) {
    const fromList = parseRoleIdList(config.testerApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.testerApprovedRoleId)) {
      return [config.testerApprovedRoleId];
    }
    const legacyList = parseRoleIdList(config.approvedRoleIds);
    if (legacyList.length > 0) {
      return legacyList;
    }
    if (isSnowflake(config.approvedRoleId)) {
      return [config.approvedRoleId];
    }
    return [];
  }
  if (normalized === TRACK_BUILDER) {
    const fromList = parseRoleIdList(config.builderApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.builderApprovedRoleId)) {
      return [config.builderApprovedRoleId];
    }
    return [];
  }
  if (normalized === TRACK_CMD) {
    const fromList = parseRoleIdList(config.cmdApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.cmdApprovedRoleId)) {
      return [config.cmdApprovedRoleId];
    }
    return [];
  }
  return [];
}

function getActiveChannelIdFromState(state, trackKey = DEFAULT_TRACK_KEY) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const stateChannels = normalizeTrackMap(state?.settings?.channels);
  if (isSnowflake(stateChannels[normalized])) {
    return stateChannels[normalized];
  }
  return getEnvChannelIdForTrack(normalized);
}

function getActiveChannelId(trackKey = DEFAULT_TRACK_KEY) {
  const state = readState();
  return getActiveChannelIdFromState(state, trackKey);
}

function getActiveChannelMap() {
  const state = readState();
  const result = createEmptyTrackMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    result[trackKey] = getActiveChannelIdFromState(state, trackKey);
  }
  return result;
}

function getAnyActiveChannelId() {
  const channels = getActiveChannelMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    if (isSnowflake(channels[trackKey])) {
      return channels[trackKey];
    }
  }
  return null;
}

function getTrackKeyForChannelId(channelId) {
  if (!isSnowflake(channelId)) {
    return null;
  }
  const channels = getActiveChannelMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    if (channels[trackKey] === channelId) {
      return trackKey;
    }
  }
  return null;
}

function hasAnyActivePostChannelConfigured() {
  return Boolean(getAnyActiveChannelId());
}

function setActiveChannel(trackKey, channelId) {
  const normalized = normalizeTrackKey(trackKey);
  if (!normalized) {
    throw new Error("Invalid track key.");
  }
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.channels = normalizeTrackMap(state.settings.channels);
  state.settings.channels[normalized] = channelId;
  writeState(state);
}

function getActiveLogsChannelId() {
  const state = readState();
  if (isSnowflake(state.settings.logChannelId)) {
    return state.settings.logChannelId;
  }
  if (isSnowflake(config.logsChannelId)) {
    return config.logsChannelId;
  }
  return null;
}

function setActiveLogsChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid log channel id.");
  }
  const state = readState();
  state.settings.logChannelId = channelId;
  writeState(state);
}

function getActiveAcceptAnnounceChannelId() {
  const state = readState();
  if (isSnowflake(state?.settings?.acceptAnnounceChannelId)) {
    return state.settings.acceptAnnounceChannelId;
  }
  if (isSnowflake(config.acceptAnnounceChannelId)) {
    return config.acceptAnnounceChannelId;
  }
  return null;
}

function setActiveAcceptAnnounceChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid accept announce channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.acceptAnnounceChannelId = channelId;
  writeState(state);
}

function getActiveAcceptAnnounceTemplate() {
  const state = readState();
  const fromState = state?.settings?.acceptAnnounceTemplate;
  if (typeof fromState === "string" && fromState.trim()) {
    return fromState;
  }
  if (
    typeof config.acceptAnnounceTemplate === "string" &&
    config.acceptAnnounceTemplate.trim()
  ) {
    return config.acceptAnnounceTemplate;
  }
  return DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE;
}

function setActiveAcceptAnnounceTemplate(template) {
  const value = String(template || "").trim();
  if (!value) {
    throw new Error("Accept announcement template cannot be empty.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.acceptAnnounceTemplate = value;
  writeState(state);
}

function getActiveDenyDmTemplate() {
  const state = readState();
  const fromState = state?.settings?.denyDmTemplate;
  if (typeof fromState === "string" && fromState.trim()) {
    return fromState;
  }
  if (typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()) {
    return config.denyDmTemplate;
  }
  return DEFAULT_DENY_DM_TEMPLATE;
}

function setActiveDenyDmTemplate(template) {
  const value = String(template || "").trim();
  if (!value) {
    throw new Error("Deny DM template cannot be empty.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.denyDmTemplate = value;
  writeState(state);
}

function getActiveApprovedRoleMap() {
  const state = readState();
  const result = createEmptyTrackRoleMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    result[trackKey] = getActiveApprovedRoleIdsFromState(state, trackKey);
  }
  return result;
}

function getActiveApprovedRoleIdsFromState(state, trackKey = DEFAULT_TRACK_KEY) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const stateRoles = normalizeTrackRoleMap(state?.settings?.approvedRoles);
  if (stateRoles[normalized].length > 0) {
    return stateRoles[normalized];
  }
  return getEnvApprovedRoleIdsForTrack(normalized);
}

function getActiveApprovedRoleIds(trackKey = DEFAULT_TRACK_KEY) {
  const state = readState();
  return getActiveApprovedRoleIdsFromState(state, trackKey);
}

function setActiveApprovedRoles(trackKey, roleIds) {
  const normalized = normalizeTrackKey(trackKey);
  if (!normalized) {
    throw new Error("Invalid track key.");
  }
  const normalizedRoleIds = parseRoleIdList(roleIds);
  if (normalizedRoleIds.length === 0) {
    throw new Error("At least one valid approved role id is required.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.approvedRoles = normalizeTrackRoleMap(state.settings.approvedRoles);
  state.settings.approvedRoles[normalized] = normalizedRoleIds;
  writeState(state);
  return {
    replaced: true,
    roleIds: state.settings.approvedRoles[normalized],
  };
}

function sanitizeThreadName(name) {
  return (
    name.replace(/[^\p{L}\p{N}\s\-_]/gu, "").trim().slice(0, 90) ||
    "Application Discussion"
  );
}

function makeApplicationContent(headers, row) {
  const answered = extractAnsweredFields(headers, row);
  if (answered.length === 0) {
    return "No answered questions.";
  }
  return answered.map(({ key, value }) => `${key}: ${value}`).join("\n\n");
}

function inferApplicantDiscordValue(headers, row) {
  let fallback = null;
  for (let i = 0; i < headers.length; i += 1) {
    const value = String(row[i] || "").trim();
    if (!value) {
      continue;
    }
    const header = String(headers[i] || "").toLowerCase();
    const isDiscordId = header.includes("discord") && header.includes("id");
    if (isDiscordId) {
      return value;
    }
    const isDiscordField = header.includes("discord");
    if (isDiscordField && !fallback) {
      fallback = value;
    }
    const isUserId = (header.includes("user") || header.includes("member")) && header.includes("id");
    if (isUserId && !fallback) {
      fallback = value;
    }
  }
  return fallback;
}

function extractDiscordUserId(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  const snowflakeMatch = raw.match(/\b(\d{17,20})\b/);
  if (snowflakeMatch) {
    return snowflakeMatch[1];
  }
  return null;
}

function normalizeDiscordLookupQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/^@/, "").trim() || null;
}

async function resolveApplicantDiscordUser(channelId, headers, row) {
  const rawValue = inferApplicantDiscordValue(headers, row);
  if (!rawValue) {
    return { rawValue: null, userId: null };
  }

  const directId = extractDiscordUserId(rawValue);
  if (directId) {
    return { rawValue, userId: directId };
  }

  const query = normalizeDiscordLookupQuery(rawValue);
  if (!query) {
    return { rawValue, userId: null };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return { rawValue, userId: null };
    }

    const matches = await channel.guild.members.fetch({ query, limit: 10 });
    if (!matches || matches.size === 0) {
      return { rawValue, userId: null };
    }

    const needle = query.toLowerCase();
    const exact =
      matches.find((member) => member.user.username.toLowerCase() === needle) ||
      matches.find((member) => (member.user.globalName || "").toLowerCase() === needle) ||
      matches.find((member) => (member.displayName || "").toLowerCase() === needle);
    const chosen = exact || matches.first();
    return { rawValue, userId: chosen?.id || null };
  } catch {
    return { rawValue, userId: null };
  }
}

function makeApplicationPostContent({
  applicationId,
  trackKey,
  applicantMention,
  applicantRawValue,
  headers,
  row,
}) {
  const lines = ["📥 **New Application**"];
  lines.push(`🧭 **Track:** ${getTrackLabel(trackKey)}`);
  if (applicationId) {
    lines.push(`🧩 **Application ID:** \`${applicationId}\``);
  }
  if (applicantMention) {
    lines.push(`👤 **Discord User:** ${applicantMention}`);
  } else if (applicantRawValue) {
    lines.push(`👤 **Discord User:** ${applicantRawValue}`);
  }
  lines.push("", toCodeBlock(makeApplicationContent(headers, row)));
  return lines.join("\n");
}

function toCodeBlock(text) {
  const safe = String(text || "").replace(/```/g, "``\u200b`");
  return `\`\`\`txt\n${safe}\n\`\`\``;
}

function applyTemplatePlaceholders(template, replacements) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(replacements || {})) {
    const safeKey = escapeRegExp(String(key));
    const regex = new RegExp(`\\{${safeKey}\\}`, "g");
    output = output.replace(regex, String(value ?? ""));
  }
  return output;
}

function splitMessageByLength(text, maxLength = 1900) {
  const lines = String(text || "").split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [""];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMsFromBody(body) {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.retry_after === "number" && parsed.retry_after >= 0) {
      return Math.ceil(parsed.retry_after * 1000);
    }
  } catch {
    // ignore malformed or non-JSON bodies
  }
  return null;
}

function getRetryAfterMsFromError(err) {
  const directRetryAfter =
    err?.rawError?.retry_after ?? err?.data?.retry_after ?? err?.retry_after;
  if (typeof directRetryAfter === "number" && Number.isFinite(directRetryAfter) && directRetryAfter >= 0) {
    if (directRetryAfter > 1000) {
      return Math.ceil(directRetryAfter);
    }
    return Math.ceil(directRetryAfter * 1000);
  }
  return null;
}

function isRateLimitError(err) {
  if (!err) {
    return false;
  }
  const status = Number(err.status);
  if (status === 429) {
    return true;
  }
  const code = Number(err.code);
  if (code === 429) {
    return true;
  }
  const message = String(err.message || "").toLowerCase();
  return message.includes("rate limit");
}

async function withRateLimitRetry(label, run, options = {}) {
  const maxAttempts =
    Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
      ? options.maxAttempts
      : 6;
  const minimumWaitMs =
    Number.isInteger(options.minimumWaitMs) && options.minimumWaitMs >= 0
      ? options.minimumWaitMs
      : 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const retryAfterMs = getRetryAfterMsFromError(err);
      const waitMs = Math.max(minimumWaitMs, retryAfterMs ?? 1000) + 100;
      console.warn(
        `${label} rate limited. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts}).`
      );
      await sleep(waitMs);
    }
  }
}

function isAnsweredValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  return String(value).trim().length > 0;
}

function extractAnsweredFields(headers, row) {
  const headerList = Array.isArray(headers) ? headers : [];
  const rowList = Array.isArray(row) ? row : [];
  const count = Math.max(headerList.length, rowList.length);
  const fields = [];

  for (let i = 0; i < count; i += 1) {
    const rawValue = rowList[i];
    if (!isAnsweredValue(rawValue)) {
      continue;
    }

    const key = String(headerList[i] || `Field ${i + 1}`).trim() || `Field ${i + 1}`;
    const value = String(rawValue).trim();
    fields.push({ key, value });
  }

  return fields;
}

async function sendDebugDm(user, text) {
  const chunks = splitMessageByLength(text);
  for (const chunk of chunks) {
    await user.send(chunk);
  }
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectTracksFromText(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) {
    return new Set();
  }

  const matched = new Set();
  for (const track of APPLICATION_TRACKS) {
    for (const alias of track.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (pattern.test(text)) {
        matched.add(track.key);
      }
    }
  }

  return matched;
}

function inferApplicationTracks(headers, row) {
  const explicitSelectionHeaderHints = [
    "what are you applying for",
  ];
  const primaryHeaderHints = [
    "applying for",
    "apply for",
    "application for",
    "track",
    "position",
    "role",
  ];
  const secondaryHeaderHints = [
    "department",
    "team",
    "type",
  ];

  const collectMatchesFromHeaders = (hints) => {
    const matches = new Set();
    for (let i = 0; i < headers.length; i += 1) {
      const header = String(headers[i] || "").toLowerCase();
      if (!hints.some((hint) => header.includes(hint))) {
        continue;
      }
      const value = String(row[i] || "").trim();
      if (!value) {
        // Ignore intentionally empty form fields.
        continue;
      }
      const detected = detectTracksFromText(value);
      for (const key of detected) {
        matches.add(key);
      }
    }
    return matches;
  };

  // Highest priority: exact form selection columns.
  const explicitSelectionMatches = collectMatchesFromHeaders(
    explicitSelectionHeaderHints
  );
  if (explicitSelectionMatches.size > 0) {
    return normalizeTrackKeys([...explicitSelectionMatches]);
  }

  // Highest priority: explicit "applying for/role/track" style answers.
  const primaryMatches = collectMatchesFromHeaders(primaryHeaderHints);
  if (primaryMatches.size > 0) {
    return normalizeTrackKeys([...primaryMatches]);
  }

  // Secondary priority: department/team/type style answers.
  const secondaryMatches = collectMatchesFromHeaders(secondaryHeaderHints);
  if (secondaryMatches.size > 0) {
    return normalizeTrackKeys([...secondaryMatches]);
  }

  // Last fallback: scan all answered cells.
  const found = new Set();
  for (const cell of row) {
    const value = String(cell || "").trim();
    if (!value) {
      continue;
    }
    const detected = detectTracksFromText(value);
    for (const key of detected) {
      found.add(key);
    }
  }

  return normalizeTrackKeys([...found], {
    fallback: [DEFAULT_TRACK_KEY],
  });
}

function inferApplicationTrack(headers, row) {
  return inferApplicationTracks(headers, row)[0] || DEFAULT_TRACK_KEY;
}

function extractCellByHeaderHints(headers, row, hintSets) {
  for (let i = 0; i < headers.length; i += 1) {
    const header = String(headers[i] || "").toLowerCase();
    for (const hints of hintSets) {
      if (!Array.isArray(hints) || hints.length === 0) {
        continue;
      }
      if (hints.every((hint) => header.includes(String(hint).toLowerCase()))) {
        return String(row[i] || "").trim();
      }
    }
  }
  return "";
}

function buildResponseKey(headers, row) {
  const timestamp = extractCellByHeaderHints(headers, row, [["timestamp"]]);
  const discordId = extractCellByHeaderHints(headers, row, [
    ["discord", "id"],
    ["user", "id"],
    ["member", "id"],
  ]);
  const discordUserName = extractCellByHeaderHints(headers, row, [
    ["discord", "user", "name"],
    ["discord", "name"],
  ]);
  const inGameUserName = extractCellByHeaderHints(headers, row, [
    ["ingame", "user", "name"],
    ["ingame", "user", "name"],
    ["in game", "user", "name"],
    ["ingame", "name"],
  ]);
  const applyingFor = extractCellByHeaderHints(headers, row, [
    ["what are you applying for"],
    ["applying for"],
    ["application for"],
    ["track"],
    ["position"],
    ["role"],
  ]);
  if (timestamp) {
    return [
      `ts:${timestamp.toLowerCase()}`,
      `id:${discordId.toLowerCase()}`,
      `dname:${discordUserName.toLowerCase()}`,
      `ign:${inGameUserName.toLowerCase()}`,
      `apply:${applyingFor.toLowerCase()}`,
    ].join("|");
  }

  const normalizedCells = (Array.isArray(row) ? row : [])
    .map(normalizeCell)
    .map((value) => value.trim())
    .filter(Boolean);
  if (normalizedCells.length === 0) {
    return null;
  }
  return `row:${normalizedCells.join("\u241f").toLowerCase()}`;
}

function extractSubmittedFieldValue(submittedFields, hintSets) {
  if (!Array.isArray(submittedFields)) {
    return "";
  }
  for (const rawLine of submittedFields) {
    const line = String(rawLine || "");
    const match = /^\*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const key = String(match[1] || "").toLowerCase();
    const value = String(match[2] || "").trim();
    if (!value) {
      continue;
    }
    for (const hints of hintSets) {
      if (!Array.isArray(hints) || hints.length === 0) {
        continue;
      }
      if (hints.every((hint) => key.includes(String(hint).toLowerCase()))) {
        return value;
      }
    }
  }
  return "";
}

function buildResponseKeyFromApplication(application) {
  if (!application || typeof application !== "object") {
    return null;
  }
  const explicit = String(application.responseKey || "").trim();
  if (explicit) {
    return explicit;
  }

  const timestamp = extractSubmittedFieldValue(application.submittedFields, [
    ["timestamp"],
  ]);
  const discordId = extractSubmittedFieldValue(application.submittedFields, [
    ["discord", "id"],
    ["user", "id"],
    ["member", "id"],
  ]);
  const discordUserName = extractSubmittedFieldValue(application.submittedFields, [
    ["discord", "user", "name"],
    ["discord", "name"],
  ]);
  const inGameUserName = extractSubmittedFieldValue(application.submittedFields, [
    ["ingame", "user", "name"],
    ["ingame", "user", "name"],
    ["in game", "user", "name"],
    ["ingame", "name"],
  ]);
  const applyingFor = extractSubmittedFieldValue(application.submittedFields, [
    ["what are you applying for"],
    ["applying for"],
    ["application for"],
    ["track"],
    ["position"],
    ["role"],
  ]);
  if (timestamp) {
    return [
      `ts:${timestamp.toLowerCase()}`,
      `id:${discordId.toLowerCase()}`,
      `dname:${discordUserName.toLowerCase()}`,
      `ign:${inGameUserName.toLowerCase()}`,
      `apply:${applyingFor.toLowerCase()}`,
    ].join("|");
  }
  return null;
}

function requiredVotesCount(eligibleCount) {
  return Math.ceil((eligibleCount * 2) / 3);
}

function allocateNextJobId(state) {
  if (!Number.isInteger(state.nextJobId) || state.nextJobId < 1) {
    state.nextJobId = 1;
  }
  const jobId = formatJobId(state.nextJobId);
  state.nextJobId += 1;
  return jobId;
}

function buildTrackedRowSet(state) {
  const trackedRows = new Set();

  if (Array.isArray(state.postJobs)) {
    for (const job of state.postJobs) {
      if (Number.isInteger(job?.rowIndex) && job.rowIndex >= 2) {
        trackedRows.add(job.rowIndex);
      }
    }
  }

  for (const application of Object.values(state.applications || {})) {
    if (Number.isInteger(application?.rowIndex) && application.rowIndex >= 2) {
      trackedRows.add(application.rowIndex);
    }
  }

  return trackedRows;
}

function buildTrackedResponseKeySet(state) {
  const trackedKeys = new Set();

  if (Array.isArray(state.postJobs)) {
    for (const job of state.postJobs) {
      const explicit = String(job?.responseKey || "").trim();
      if (explicit) {
        trackedKeys.add(explicit);
        continue;
      }
      const inferred = buildResponseKey(
        Array.isArray(job?.headers) ? job.headers : [],
        Array.isArray(job?.row) ? job.row : []
      );
      if (inferred) {
        trackedKeys.add(inferred);
      }
    }
  }

  for (const application of Object.values(state.applications || {})) {
    const key = buildResponseKeyFromApplication(application);
    if (key) {
      trackedKeys.add(key);
    }
  }

  return trackedKeys;
}

function createPostJob(state, headers, row, rowIndex) {
  const normalizedHeaders = (Array.isArray(headers) ? headers : []).map(normalizeCell);
  const normalizedRow = (Array.isArray(row) ? row : []).map(normalizeCell);
  const trackKeys = inferApplicationTracks(normalizedHeaders, normalizedRow);
  return {
    jobId: allocateNextJobId(state),
    type: JOB_TYPE_POST_APPLICATION,
    rowIndex,
    trackKeys,
    postedTrackKeys: [],
    responseKey: buildResponseKey(normalizedHeaders, normalizedRow),
    headers: normalizedHeaders,
    row: normalizedRow,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
}

async function getSheetsClient() {
  let authOptions;
  if (config.serviceAccountJson) {
    const raw = config.serviceAccountJson.trim();
    const decoded = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    authOptions = {
      credentials: JSON.parse(decoded),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  } else {
    const keyPath = path.resolve(config.serviceAccountKeyFile);
    authOptions = {
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  }

  const auth = new google.auth.GoogleAuth(authOptions);
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

async function sendChannelMessage(channelId, content, allowedMentions = { parse: [] }) {
  return withRateLimitRetry("Send message", async () => {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Configured channel is not text-based.");
    }

    return channel.send({
      content,
      allowedMentions,
    });
  });
}

async function addReaction(channelId, messageId, emoji) {
  const encodedEmoji = encodeURIComponent(emoji);
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`;
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${config.botToken}`,
      },
    });

    if (res.ok) {
      return;
    }

    const body = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterMs = getRetryAfterMsFromBody(body);
      const waitMs = Math.max(300, retryAfterMs ?? 1000) + 100;
      await sleep(waitMs);
      continue;
    }

    throw new Error(`Failed adding reaction ${emoji} (${res.status}): ${body}`);
  }
}

async function createThread(channelId, messageId, name) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/threads`;
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

    if (res.ok) {
      return res.json();
    }

    const body = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterMs = getRetryAfterMsFromBody(body);
      const waitMs = Math.max(300, retryAfterMs ?? 1000) + 100;
      console.warn(
        `Thread creation rate limited. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts}).`
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`Thread creation failed (${res.status}): ${body}`);
  }
}

async function getReviewersWithChannelAccess(channel) {
  const members = await channel.guild.members.fetch();
  const reviewers = new Set();

  for (const member of members.values()) {
    if (member.user.bot) {
      continue;
    }

    const perms = channel.permissionsFor(member);
    if (perms && perms.has(PermissionsBitField.Flags.ViewChannel)) {
      reviewers.add(member.id);
    }
  }

  return reviewers;
}

async function getVoteSnapshot(message, eligibleReviewerIds) {
  const yesReaction = message.reactions.cache.find(
    (r) => r.emoji.name === ACCEPT_EMOJI
  );
  const noReaction = message.reactions.cache.find((r) => r.emoji.name === DENY_EMOJI);

  const yesUsers = new Set();
  const noUsers = new Set();

  if (yesReaction) {
    const users = await yesReaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot && eligibleReviewerIds.has(user.id)) {
        yesUsers.add(user.id);
      }
    }
  }

  if (noReaction) {
    const users = await noReaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot && eligibleReviewerIds.has(user.id)) {
        noUsers.add(user.id);
      }
    }
  }

  for (const userId of yesUsers) {
    if (noUsers.has(userId)) {
      yesUsers.delete(userId);
      noUsers.delete(userId);
    }
  }

  return {
    yesCount: yesUsers.size,
    noCount: noUsers.size,
  };
}

async function postDecisionUpdate(application, decision, reason) {
  const decisionLabel = decision === STATUS_ACCEPTED ? "ACCEPTED" : "DENIED";
  const summary = `🧾 **Application ${decisionLabel}**\n${reason}`;

  try {
    const parentChannel = await client.channels.fetch(application.channelId);
    if (parentChannel && parentChannel.isTextBased()) {
      const message = await parentChannel.messages.fetch(application.messageId);
      await message.reply({ content: summary, allowedMentions: { parse: [] } });
    }
  } catch (err) {
    console.error(`Failed posting decision to parent message ${application.messageId}:`, err.message);
  }

  if (application.threadId) {
    try {
      const thread = await client.channels.fetch(application.threadId);
      if (thread && thread.isTextBased()) {
        await thread.send({ content: summary, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error(`Failed posting decision to thread ${application.threadId}:`, err.message);
    }
  }
}

async function postForcedDecisionTemplateToThread(application, decision, decisionReason) {
  if (application?.decisionSource !== "force_command") {
    return;
  }
  if (!application?.threadId) {
    return;
  }

  try {
    const thread = await client.channels.fetch(application.threadId);
    if (!thread || !thread.isTextBased()) {
      return;
    }

    // If the thread auto-archived, try to reopen so the forced decision note is visible there.
    if (
      "archived" in thread &&
      thread.archived &&
      typeof thread.setArchived === "function"
    ) {
      try {
        await thread.setArchived(false, "Posting forced decision template message");
      } catch {
        // ignore; send will fail naturally if thread stays archived/locked
      }
    }

    const trackLabel = getTrackLabel(application.trackKey);
    let serverName = "Unknown Server";
    try {
      const sourceChannel = await client.channels.fetch(application.channelId);
      if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
        serverName = sourceChannel.guild.name;
      }
    } catch {
      // keep fallback server name
    }

    const replacements = {
      user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
      user_id: application.applicantUserId || "",
      applicant_name: application.applicantName || "Applicant",
      track: trackLabel,
      application_id: getApplicationDisplayId(application),
      job_id: application.jobId || "Unknown",
      server: serverName,
      decision_source: application.decisionSource || "Unknown",
      role_result: application.approvedRoleResult?.message || "",
      reason: decisionReason || "",
      decided_at: application.decidedAt || new Date().toISOString(),
    };

    const isAccepted = decision === STATUS_ACCEPTED;
    const template = isAccepted
      ? getActiveAcceptAnnounceTemplate()
      : getActiveDenyDmTemplate();
    const fallback = isAccepted
      ? DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE
      : DEFAULT_DENY_DM_TEMPLATE;
    const rendered = applyTemplatePlaceholders(template, replacements).trim() || fallback;
    const label = isAccepted ? "ACCEPTED" : "DENIED";

    const lines = [
      `📨 **Forced ${label} Message**`,
      `**By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
      `**Application ID:** \`${getApplicationDisplayId(application)}\``,
      "",
      toCodeBlock(rendered),
    ];
    await thread.send({ content: lines.join("\n"), allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(
      `Failed posting forced ${decision} template to thread ${application.threadId}:`,
      err.message
    );
  }
}

function makeMessageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function ensureLogsChannel(guild) {
  const configuredLogChannelId = getActiveLogsChannelId();
  if (configuredLogChannelId) {
    try {
      const configured = await guild.channels.fetch(configuredLogChannelId);
      if (configured && configured.type === ChannelType.GuildText) {
        return configured;
      }
    } catch {
      // fallback to name-based lookup/create below
    }
  }

  const targetName = config.logsChannelName.toLowerCase();
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === targetName
  );
  if (existing) {
    return existing;
  }

  return guild.channels.create({
    name: config.logsChannelName,
    type: ChannelType.GuildText,
    reason: "Application decision logs channel",
  });
}

function userDisplayName(user) {
  if (!user) {
    return "unknown";
  }
  if (user.globalName) {
    return `${user.globalName} (@${user.username})`;
  }
  return user.username;
}

async function postConfigurationLog(interaction, title, detailLines = []) {
  if (!interaction?.guild) {
    return;
  }

  try {
    const logsChannel = await ensureLogsChannel(interaction.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const lines = [
      `⚙️ **${title}**`,
      `**By:** ${userDisplayName(interaction.user)} (<@${interaction.user.id}>)`,
      `**Guild:** ${interaction.guild.name} (${interaction.guild.id})`,
      `**Source Channel:** <#${interaction.channelId}>`,
      `**Time:** ${new Date().toISOString()}`,
      ...detailLines,
    ];

    await logsChannel.send({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error(`Failed posting configuration log (${title}):`, err.message);
  }
}

function appendControlLogToFile(entry) {
  const logPath = path.resolve(config.controlLogFile);
  const logDir = path.dirname(logPath);
  if (logDir && logDir !== "." && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const line = `${JSON.stringify(entry)}\n`;
  fs.appendFileSync(logPath, line, "utf8");
}

async function logControlCommand(action, interaction) {
  const entry = {
    action,
    at: new Date().toISOString(),
    userId: interaction.user.id,
    username: interaction.user.username,
    globalName: interaction.user.globalName || null,
    guildId: interaction.guildId || null,
    guildName: interaction.guild?.name || null,
    channelId: interaction.channelId || null,
  };

  const state = readState();
  const existing = Array.isArray(state.controlActions) ? state.controlActions : [];
  existing.push(entry);
  if (existing.length > 200) {
    existing.splice(0, existing.length - 200);
  }
  state.controlActions = existing;
  writeState(state);

  console.log(
    `[CONTROL] ${action} by ${entry.username} (${entry.userId}) in ${entry.guildName || "DM"} (${entry.guildId || "n/a"})`
  );

  try {
    appendControlLogToFile(entry);
  } catch (err) {
    console.error(`Failed writing ${action} control log file:`, err.message);
  }

  if (action === "stop" || action === "restart") {
    return;
  }

  if (!interaction.guild) {
    return;
  }

  try {
    const logsChannel = await ensureLogsChannel(interaction.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const details = [
      `🛑 **Bot ${action.toUpperCase()} Command Executed**`,
      `**By:** ${userDisplayName(interaction.user)} (<@${interaction.user.id}>)`,
      `**User ID:** ${interaction.user.id}`,
      `**Guild:** ${interaction.guild.name} (${interaction.guild.id})`,
      `**Channel:** <#${interaction.channelId}>`,
      `**Time:** ${entry.at}`,
    ].join("\n");

    await logsChannel.send({ content: details, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(`Failed writing ${action} control log:`, err.message);
  }
}

async function postClosureLog(application) {
  try {
    const channel = await client.channels.fetch(application.channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return;
    }

    const logsChannel = await ensureLogsChannel(channel.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const decisionLabel =
      application.status === STATUS_ACCEPTED ? "ACCEPTED" : "DENIED";
    const trackKey = normalizeTrackKey(application.trackKey) || DEFAULT_TRACK_KEY;
    const trackLabel = getTrackLabel(trackKey);
    const submittedLines =
      Array.isArray(application.submittedFields) &&
      application.submittedFields.length > 0
        ? application.submittedFields.join("\n")
        : "_No answered fields stored_";
    const messageLink = makeMessageUrl(
      channel.guild.id,
      application.channelId,
      application.messageId
    );
    const threadLink = application.threadId
      ? makeMessageUrl(channel.guild.id, application.threadId, application.threadId)
      : "_No thread_";
    const approvedRoleNote =
      application.approvedRoleResult && application.status === STATUS_ACCEPTED
        ? application.approvedRoleResult.message
        : "No role action recorded.";
    const acceptAnnounceNote =
      application.acceptAnnounceResult && application.status === STATUS_ACCEPTED
        ? application.acceptAnnounceResult.message
        : "No acceptance announcement action recorded.";
    const deniedDmNote =
      application.denyDmResult && application.status === STATUS_DENIED
        ? application.denyDmResult.message
        : "No denied-DM action recorded.";

    const logLines = [
      "📚 **Application Closed (History Log)**",
      `**Decision:** ${decisionLabel}`,
      `**Track:** ${trackLabel}`,
      `**Applicant:** ${application.applicantName || "Unknown"}`,
      `**Row:** ${application.rowIndex || "Unknown"}`,
      `**Application ID:** ${getApplicationDisplayId(application)}`,
      `**Created At:** ${application.createdAt || "Unknown"}`,
      `**Decided At:** ${application.decidedAt || "Unknown"}`,
      `**Decision Source:** ${application.decisionSource || "Unknown"}`,
      `**Decided By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
      `**Approved Role Action:** ${approvedRoleNote}`,
      `**Acceptance Announcement Action:** ${acceptAnnounceNote}`,
      `**Denied DM Action:** ${deniedDmNote}`,
      `**Application Message:** ${messageLink}`,
      `**Discussion Thread:** ${threadLink}`,
      "",
      "**Submitted Fields:**",
      submittedLines,
    ];
    const log = logLines.join("\n");

    await logsChannel.send({ content: log, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("Failed posting closure log:", err.message);
  }
}

async function grantApprovedRoleOnAcceptance(application) {
  const trackKey = normalizeTrackKey(application.trackKey) || DEFAULT_TRACK_KEY;
  const trackLabel = getTrackLabel(trackKey);
  const approvedRoleIds = getActiveApprovedRoleIds(trackKey);
  if (approvedRoleIds.length === 0) {
    return {
      status: "skipped_no_role_configured",
      message: `No approved roles configured for ${trackLabel}.`,
      roleIds: [],
      userId: application.applicantUserId || null,
    };
  }

  if (!application.applicantUserId) {
    return {
      status: "skipped_no_user",
      message: "No applicant Discord user could be resolved from the form data.",
      roleIds: approvedRoleIds,
      userId: null,
    };
  }

  try {
    const channel = await client.channels.fetch(application.channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return {
        status: "failed_no_guild",
        message: "Could not resolve guild for role assignment.",
        roleIds: approvedRoleIds,
        userId: application.applicantUserId,
      };
    }

    const guild = channel.guild;
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return {
        status: "failed_missing_permission",
        message: "Bot is missing Manage Roles permission.",
        roleIds: approvedRoleIds,
        userId: application.applicantUserId,
      };
    }

    let member = null;
    try {
      member = await guild.members.fetch(application.applicantUserId);
    } catch {
      member = null;
    }

    if (!member) {
      return {
        status: "failed_member_not_found",
        message: `Applicant user <@${application.applicantUserId}> is not in this server.`,
        roleIds: approvedRoleIds,
        userId: application.applicantUserId,
      };
    }

    const grantedRoleIds = [];
    const alreadyHasRoleIds = [];
    const failedRoleEntries = [];

    for (const roleId of approvedRoleIds) {
      let role = null;
      try {
        role = await guild.roles.fetch(roleId);
      } catch (err) {
        failedRoleEntries.push({
          roleId,
          reason: `fetch failed (${err.message})`,
        });
        continue;
      }

      if (!role) {
        failedRoleEntries.push({
          roleId,
          reason: "role not found in guild",
        });
        continue;
      }

      if (role.managed) {
        failedRoleEntries.push({
          roleId,
          reason: "managed/integration role",
        });
        continue;
      }

      if (me.roles.highest.comparePositionTo(role) <= 0) {
        failedRoleEntries.push({
          roleId,
          reason: "bot role hierarchy is too low",
        });
        continue;
      }

      if (member.roles.cache.has(roleId)) {
        alreadyHasRoleIds.push(roleId);
        continue;
      }

      try {
        await member.roles.add(
          roleId,
          `Application accepted (${getApplicationDisplayId(application)})`
        );
        grantedRoleIds.push(roleId);
      } catch (err) {
        failedRoleEntries.push({
          roleId,
          reason: `add failed (${err.message})`,
        });
      }
    }

    const summaryParts = [];
    if (grantedRoleIds.length > 0) {
      summaryParts.push(
        `granted: ${grantedRoleIds.map((id) => `<@&${id}>`).join(", ")}`
      );
    }
    if (alreadyHasRoleIds.length > 0) {
      summaryParts.push(
        `already had: ${alreadyHasRoleIds.map((id) => `<@&${id}>`).join(", ")}`
      );
    }
    if (failedRoleEntries.length > 0) {
      summaryParts.push(
        `failed: ${failedRoleEntries
          .map((entry) => `<@&${entry.roleId}> (${entry.reason})`)
          .join(", ")}`
      );
    }

    let status = "failed_all";
    if (grantedRoleIds.length > 0 && failedRoleEntries.length === 0) {
      status = "granted";
    } else if (grantedRoleIds.length > 0 && failedRoleEntries.length > 0) {
      status = "granted_partial";
    } else if (alreadyHasRoleIds.length > 0 && failedRoleEntries.length === 0) {
      status = "already_has_role";
    }

    return {
      status,
      message:
        summaryParts.length > 0
          ? `Role assignment for <@${member.id}>: ${summaryParts.join(" | ")}`
          : `No role changes were made for <@${member.id}>.`,
      roleIds: approvedRoleIds,
      grantedRoleIds,
      alreadyHasRoleIds,
      failedRoleEntries,
      userId: member.id,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Role assignment failed: ${err.message}`,
      roleIds: approvedRoleIds,
      userId: application.applicantUserId,
    };
  }
}

async function sendDeniedApplicationDm(application, decisionReason) {
  if (!application.applicantUserId) {
    return {
      status: "skipped_no_user",
      message: "No applicant Discord user could be resolved from discord_ID.",
      userId: null,
    };
  }

  const trackLabel = getTrackLabel(application.trackKey);
  let serverName = "Unknown Server";
  try {
    const channel = await client.channels.fetch(application.channelId);
    if (channel && "guild" in channel && channel.guild?.name) {
      serverName = channel.guild.name;
    }
  } catch {
    // ignore and keep fallback server name
  }

  const replacements = {
    user: `<@${application.applicantUserId}>`,
    user_id: application.applicantUserId,
    applicant_name: application.applicantName || "Applicant",
    track: trackLabel,
    application_id: getApplicationDisplayId(application),
    job_id: application.jobId || "Unknown",
    server: serverName,
    decision_source: application.decisionSource || "Unknown",
    reason: decisionReason || "",
    decided_at: application.decidedAt || new Date().toISOString(),
  };
  const template = getActiveDenyDmTemplate();
  const rendered = applyTemplatePlaceholders(template, replacements).trim();
  const content = rendered || DEFAULT_DENY_DM_TEMPLATE;

  try {
    const user = await client.users.fetch(application.applicantUserId);
    await sendDebugDm(user, content);
    return {
      status: "sent",
      message: `Denied DM sent to <@${application.applicantUserId}>.`,
      userId: application.applicantUserId,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Failed sending denied DM to <@${application.applicantUserId}>: ${err.message}`,
      userId: application.applicantUserId,
    };
  }
}

async function sendAcceptedApplicationAnnouncement(application, roleResult) {
  const channelId = getActiveAcceptAnnounceChannelId();
  if (!channelId) {
    return {
      status: "skipped_no_channel",
      message: "No accept announcement channel configured.",
      channelId: null,
    };
  }

  const trackLabel = getTrackLabel(application.trackKey);
  let serverName = "Unknown Server";
  try {
    const sourceChannel = await client.channels.fetch(application.channelId);
    if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
      serverName = sourceChannel.guild.name;
    }
  } catch {
    // ignore and keep fallback
  }

  const replacements = {
    user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
    user_id: application.applicantUserId || "",
    applicant_name: application.applicantName || "Applicant",
    track: trackLabel,
    application_id: getApplicationDisplayId(application),
    job_id: application.jobId || "Unknown",
    server: serverName,
    role_result: roleResult?.message || "",
    decided_at: application.decidedAt || new Date().toISOString(),
  };
  const template = getActiveAcceptAnnounceTemplate();
  const rendered = applyTemplatePlaceholders(template, replacements).trim();
  const content = rendered || DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE;

  try {
    await sendChannelMessage(channelId, content, {
      parse: [],
      users: application.applicantUserId ? [application.applicantUserId] : [],
    });
    return {
      status: "sent",
      message: `Acceptance announcement posted in <#${channelId}>.`,
      channelId,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Failed posting acceptance announcement in <#${channelId}>: ${err.message}`,
      channelId,
    };
  }
}

async function finalizeApplication(messageId, decision, sourceLabel, actorId) {
  const state = readState();
  const application = state.applications[messageId];

  if (!application) {
    return { ok: false, reason: "unknown_application" };
  }

  if (application.status !== STATUS_PENDING) {
    return { ok: false, reason: "already_decided", status: application.status };
  }

  application.applicationId = getApplicationDisplayId(application, messageId);
  application.status = decision;
  application.decidedAt = new Date().toISOString();
  application.decidedBy = actorId;
  application.decisionSource = sourceLabel;
  let decisionReason =
    sourceLabel === "vote"
      ? "Decision reached with 2/3 channel supermajority."
      : `Forced by <@${actorId}> using slash command.`;

  if (decision === STATUS_ACCEPTED) {
    const roleResult = await grantApprovedRoleOnAcceptance(application);
    application.approvedRoleResult = roleResult;
    decisionReason = `${decisionReason}\n${roleResult.message}`;
    const acceptAnnounceResult = await sendAcceptedApplicationAnnouncement(
      application,
      roleResult
    );
    application.acceptAnnounceResult = acceptAnnounceResult;
    decisionReason = `${decisionReason}\n${acceptAnnounceResult.message}`;
  } else if (decision === STATUS_DENIED) {
    const denyDmResult = await sendDeniedApplicationDm(application, decisionReason);
    application.denyDmResult = denyDmResult;
    decisionReason = `${decisionReason}\n${denyDmResult.message}`;
  }

  writeState(state);

  await postDecisionUpdate(
    application,
    decision,
    decisionReason
  );
  await postForcedDecisionTemplateToThread(application, decision, decisionReason);
  await postClosureLog(application);

  return { ok: true };
}

async function evaluateAndApplyVoteDecision(messageId) {
  const state = readState();
  const application = state.applications[messageId];

  if (!application || application.status !== STATUS_PENDING) {
    return;
  }

  const channel = await client.channels.fetch(application.channelId);
  if (!channel || !channel.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(messageId);
  const eligibleReviewerIds = await getReviewersWithChannelAccess(channel);

  if (eligibleReviewerIds.size === 0) {
    return;
  }

  const threshold = requiredVotesCount(eligibleReviewerIds.size);
  const { yesCount, noCount } = await getVoteSnapshot(message, eligibleReviewerIds);

  if (yesCount >= threshold && noCount >= threshold) {
    return;
  }

  if (yesCount >= threshold) {
    await finalizeApplication(messageId, STATUS_ACCEPTED, "vote", client.user.id);
    return;
  }

  if (noCount >= threshold) {
    await finalizeApplication(messageId, STATUS_DENIED, "vote", client.user.id);
  }
}

function resolveMessageIdForCommand(interaction) {
  const explicitMessageId = interaction.options.getString("message_id");
  if (explicitMessageId) {
    return explicitMessageId;
  }

  const explicitJobId = interaction.options.getString("job_id");
  if (explicitJobId) {
    const state = readState();
    const needle = String(explicitJobId).trim().toLowerCase();
    const matches = [];
    for (const [messageId, application] of Object.entries(state.applications || {})) {
      if (String(application?.jobId || "").toLowerCase() === needle) {
        matches.push({ messageId, application });
      }
    }

    if (matches.length === 1) {
      return matches[0].messageId;
    }

    if (interaction.channel) {
      const threadScoped = matches.filter(
        (match) => match.application?.threadId === interaction.channel.id
      );
      if (threadScoped.length === 1) {
        return threadScoped[0].messageId;
      }

      const channelScoped = matches.filter(
        (match) => match.application?.channelId === interaction.channel.id
      );
      if (channelScoped.length === 1) {
        return channelScoped[0].messageId;
      }
    }

    return null;
  }

  if (interaction.channel && interaction.channel.type === ChannelType.PublicThread) {
    const state = readState();
    return state.threads[interaction.channel.id] || null;
  }

  return null;
}

function buildSlashCommands() {
  const trackChoices = APPLICATION_TRACKS.map((track) => ({
    name: track.label,
    value: track.key,
  }));
  return [
    new SlashCommandBuilder()
      .setName("accept")
      .setDescription("Force-accept an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Application job ID (e.g. job-000123)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("deny")
      .setDescription("Force-deny an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Application job ID (e.g. job-000123)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set application channels for Tester/Builder/CMD plus log channel")
      .addChannelOption((option) =>
        option
          .setName("application_post")
          .setDescription("Legacy tester post channel (optional)")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("tester_post")
          .setDescription("Tester application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("builder_post")
          .setDescription("Builder application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("cmd_post")
          .setDescription("CMD application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("log")
          .setDescription("Application log channel (defaults to tester/current)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setapprole")
      .setDescription("Set accepted roles for a track (overwrites previous roles)")
      .addStringOption((option) =>
        option
          .setName("track")
          .setDescription("Application track for these roles")
          .setRequired(true)
          .addChoices(...trackChoices)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("First role to grant on acceptance")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role_2")
          .setDescription("Second role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_3")
          .setDescription("Third role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_4")
          .setDescription("Fourth role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_5")
          .setDescription("Fifth role to grant on acceptance")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setdenymsg")
      .setDescription("Set the DM message sent to users when an application is denied")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template with placeholders like {track}, {application_id}, {server}")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("setacceptmsg")
      .setDescription("Set accepted announcement channel/template")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where accepted announcements should be posted")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template (e.g. welcome to {track} team...)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setaccept")
      .setDescription("Set accepted announcement channel/template")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where accepted announcements should be posted")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template (e.g. welcome to {track} team...)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("structuredmsg")
      .setDescription("Post a structured bot message in the current channel")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Message title")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("line_1")
          .setDescription("First content line")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("line_2")
          .setDescription("Second content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_3")
          .setDescription("Third content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_4")
          .setDescription("Fourth content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_5")
          .setDescription("Fifth content line")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("code_block")
          .setDescription("Wrap content lines in a code block")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("debug")
      .setDescription("Run bot integration diagnostics and tests")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Choose which debug action to run")
          .setRequired(true)
          .addChoices(
            { name: "report", value: DEBUG_MODE_REPORT },
            { name: "post_test", value: DEBUG_MODE_POST_TEST },
            { name: "accept_test", value: DEBUG_MODE_ACCEPT_TEST },
            { name: "deny_test", value: DEBUG_MODE_DENY_TEST }
          )
      )
      .addStringOption((option) =>
        option
          .setName("track")
          .setDescription("Optional track label override for debug tests")
          .setRequired(false)
          .addChoices(...trackChoices)
      )
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID (for accept_test / deny_test)")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Job ID text (real ID targets app; unknown value runs simulation)")
          .setRequired(false)
      )
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Required for accept_test/deny_test simulation checks")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Stop the bot process"),
    new SlashCommandBuilder()
      .setName("restart")
      .setDescription("Restart the bot process"),
  ].map((command) => command.toJSON());
}

async function isGuildCommandSetCurrent(rest, guildId, commands) {
  const existing = await rest.get(
    Routes.applicationGuildCommands(config.clientId, guildId)
  );

  const normalizeCommand = (command) => ({
    name: command.name || "",
    description: command.description || "",
    type: command.type || 1,
    options: Array.isArray(command.options) ? command.options : [],
    default_member_permissions: command.default_member_permissions || null,
    dm_permission:
      typeof command.dm_permission === "boolean" ? command.dm_permission : null,
    nsfw: typeof command.nsfw === "boolean" ? command.nsfw : false,
  });

  const normalizeSet = (items) =>
    items
      .map(normalizeCommand)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => JSON.stringify(item))
      .join("\n");

  return normalizeSet(existing) === normalizeSet(commands);
}

async function clearGlobalCommands(rest) {
  const existing = await rest.get(Routes.applicationCommands(config.clientId));
  if (Array.isArray(existing) && existing.length > 0) {
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log("Cleared global slash commands to avoid duplicate command entries.");
    return existing.length;
  }
  return 0;
}

async function confirmGuildCommandSet(rest, guildId, commands) {
  const existing = await rest.get(
    Routes.applicationGuildCommands(config.clientId, guildId)
  );
  const existingNames = new Set(existing.map((cmd) => cmd.name));
  const desiredNames = new Set(commands.map((cmd) => cmd.name));

  if (existingNames.size !== desiredNames.size) {
    throw new Error(
      `Guild ${guildId} command set mismatch after sync. Expected ${desiredNames.size}, got ${existingNames.size}.`
    );
  }
  for (const name of desiredNames) {
    if (!existingNames.has(name)) {
      throw new Error(`Guild ${guildId} missing expected command: ${name}`);
    }
  }
}

async function registerSlashCommands() {
  const commands = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(config.botToken);

  const guildId = await resolveGuildIdForCommands();
  if (guildId) {
    await registerSlashCommandsForGuild(rest, guildId, commands);
    const removed = await clearGlobalCommands(rest);
    await confirmGuildCommandSet(rest, guildId, commands);
    console.log(
      `Command scope confirmed for guild ${guildId}. Global commands removed: ${removed}.`
    );
    return;
  }

  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length > 0) {
    for (const id of guildIds) {
      await registerSlashCommandsForGuild(rest, id, commands);
      await confirmGuildCommandSet(rest, id, commands);
    }
    const removed = await clearGlobalCommands(rest);
    console.log(
      `Command scope confirmed for ${guildIds.length} guild(s). Global commands removed: ${removed}.`
    );
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log("Registered global slash commands (may take time to appear)");
}

async function registerSlashCommandsForGuild(rest, guildId, commands) {
  if (await isGuildCommandSetCurrent(rest, guildId, commands)) {
    console.log(`Slash commands already up to date in guild ${guildId}`);
    return;
  }

  await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), {
    body: commands,
  });
  console.log(`Registered slash commands in guild ${guildId}`);
}

async function resolveGuildIdForCommands() {
  if (isSnowflake(config.guildId)) {
    return config.guildId;
  }

  const activeChannelId = getAnyActiveChannelId();
  if (!activeChannelId) {
    return null;
  }

  try {
    const channel = await client.channels.fetch(activeChannelId);
    if (!channel || !("guildId" in channel) || !channel.guildId) {
      return null;
    }
    return channel.guildId;
  } catch (err) {
    console.error("Failed deriving guild from channel:", err.message);
    return null;
  }
}

async function auditBotPermissions() {
  const channelMap = getActiveChannelMap();
  const configuredEntries = Object.entries(channelMap).filter(([, channelId]) =>
    isSnowflake(channelId)
  );
  if (configuredEntries.length === 0) {
    console.log("Permission audit skipped: no active channel set. Use /setchannel.");
    return;
  }

  const issues = [];
  for (const [trackKey, channelId] of configuredEntries) {
    const trackLabel = getTrackLabel(trackKey);
    let channel = null;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      issues.push(`${trackLabel}: failed to fetch channel ${channelId} (${err.message})`);
      continue;
    }

    if (!channel || !("guild" in channel) || !channel.guild) {
      issues.push(`${trackLabel}: channel ${channelId} is not a guild text channel.`);
      continue;
    }

    const guild = channel.guild;
    const me = await guild.members.fetchMe();
    const missingGuildPerms = REQUIRED_GUILD_PERMISSIONS.filter(
      ([, perm]) => !me.permissions.has(perm)
    ).map(([name]) => name);
    const channelPerms = channel.permissionsFor(me);
    const missingChannelPerms = REQUIRED_CHANNEL_PERMISSIONS.filter(
      ([, perm]) => !channelPerms || !channelPerms.has(perm)
    ).map(([name]) => name);

    if (missingGuildPerms.length > 0) {
      issues.push(`${trackLabel}: missing guild perms: ${missingGuildPerms.join(", ")}`);
    }
    if (missingChannelPerms.length > 0) {
      issues.push(
        `${trackLabel}: missing channel perms in <#${channelId}>: ${missingChannelPerms.join(", ")}`
      );
    }
  }

  if (issues.length === 0) {
    console.log(`Permission audit passed for ${configuredEntries.length} channel(s).`);
    return;
  }

  for (const issue of issues) {
    console.error(issue);
  }
  throw new Error("Permission audit failed. Grant missing permissions and check overrides.");
}

async function buildDebugReport(interaction) {
  const lines = [];
  const state = readState();
  const activeChannelMap = getActiveChannelMap();
  const activeApprovedRoleMap = getActiveApprovedRoleMap();

  lines.push(`Bot User ID: ${client.user?.id || "unknown"}`);
  lines.push(`Configured Client ID: ${config.clientId || "missing"}`);
  lines.push(
    `Client ID matches bot user ID: ${client.user?.id === config.clientId ? "yes" : "no"}`
  );
  lines.push(`Interaction Guild ID: ${interaction.guildId || "none"}`);
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    const trackLabel = getTrackLabel(trackKey);
    const approvedRoles = Array.isArray(activeApprovedRoleMap[trackKey])
      ? activeApprovedRoleMap[trackKey]
      : [];
    lines.push(
      `Track ${trackLabel}: channel=${activeChannelMap[trackKey] || "none"}, approvedRoles=${
        approvedRoles.length > 0 ? approvedRoles.join(",") : "none"
      }`
    );
  }
  lines.push(
    `Denied DM Template Configured: ${
      typeof state.settings?.denyDmTemplate === "string" &&
      state.settings.denyDmTemplate.trim()
        ? "state"
        : typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()
          ? "env"
          : "default"
    }`
  );
  lines.push(`Accept Announcement Channel ID: ${getActiveAcceptAnnounceChannelId() || "none"}`);
  lines.push(
    `Accept Announcement Template Configured: ${
      typeof state.settings?.acceptAnnounceTemplate === "string" &&
      state.settings.acceptAnnounceTemplate.trim()
        ? "state"
        : typeof config.acceptAnnounceTemplate === "string" &&
            config.acceptAnnounceTemplate.trim()
          ? "env"
          : "default"
    }`
  );
  lines.push(`Queued Post Jobs: ${Array.isArray(state.postJobs) ? state.postJobs.length : 0}`);

  const rest = new REST({ version: "10" }).setToken(config.botToken);
  try {
    const globals = await rest.get(Routes.applicationCommands(config.clientId));
    lines.push(`Global Commands: ${Array.isArray(globals) ? globals.length : 0}`);
  } catch (err) {
    lines.push(`Global Commands: error (${err.message})`);
  }

  if (interaction.guildId) {
    try {
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(config.clientId, interaction.guildId)
      );
      const names = Array.isArray(guildCommands)
        ? guildCommands.map((c) => c.name).sort().join(", ")
        : "";
      lines.push(
        `Guild Commands (${interaction.guildId}): ${
          Array.isArray(guildCommands) ? guildCommands.length : 0
        }`
      );
      if (names) {
        lines.push(`Guild Command Names: ${names}`);
      }
    } catch (err) {
      lines.push(`Guild Commands: error (${err.message})`);
    }
  }

  for (const trackKey of APPLICATION_TRACK_KEYS) {
    const channelId = activeChannelMap[trackKey];
    if (!channelId) {
      continue;
    }
    const trackLabel = getTrackLabel(trackKey);
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && "guild" in channel && channel.guild) {
        const me = await channel.guild.members.fetchMe();
        const channelPerms = channel.permissionsFor(me);
        const missing = REQUIRED_CHANNEL_PERMISSIONS.filter(
          ([, perm]) => !channelPerms || !channelPerms.has(perm)
        ).map(([name]) => name);
        lines.push(
          `${trackLabel} Missing Channel Perms: ${
            missing.length > 0 ? missing.join(", ") : "none"
          }`
        );
      } else {
        lines.push(`${trackLabel} Channel Check: not a guild text channel`);
      }
    } catch (err) {
      lines.push(`${trackLabel} Channel Check: error (${err.message})`);
    }
  }

  return lines.join("\n");
}

async function runDebugPostTest(interaction) {
  const requestedTrack = normalizeTrackKey(interaction.options.getString("track"));
  const currentChatIsGuildText =
    interaction.inGuild() && interaction.channel?.type === ChannelType.GuildText;
  const mappedTrackFromChat = getTrackKeyForChannelId(interaction.channelId || "");

  let selectedTrack = mappedTrackFromChat || requestedTrack || DEFAULT_TRACK_KEY;
  let targetChannelId = null;
  let channelSourceLabel = "";

  if (currentChatIsGuildText) {
    targetChannelId = interaction.channelId;
    channelSourceLabel = "current_chat";
  } else {
    targetChannelId = getActiveChannelId(selectedTrack);
    channelSourceLabel = "configured_track_channel";
  }

  if (!targetChannelId) {
    const trackLabel = getTrackLabel(selectedTrack);
    throw new Error(
      `No active channel configured for ${trackLabel}. Run /setchannel first.`
    );
  }
  const trackLabel = getTrackLabel(selectedTrack);

  const triggeredAt = new Date().toISOString();
  const content = [
    "🧪 **Debug Application Post Test**",
    "This is a live test post from `/debug mode:post_test`.",
    `**Triggered By:** <@${interaction.user.id}>`,
    `**Triggered At:** ${triggeredAt}`,
    `**Target Channel:** <#${targetChannelId}>`,
    `**Channel Source:** ${channelSourceLabel === "current_chat" ? "Current Chat" : "Configured Track Channel"}`,
    "",
    `**Track:** ${trackLabel}`,
    "**Example Fields:**",
    "**Name:** Debug Applicant",
    "**Discord Name:** debug-user",
    "**Reason:** Validate direct bot post flow end-to-end",
  ].join("\n");

  const msg = await sendChannelMessage(targetChannelId, content);
  const postedChannelId = msg.channelId || targetChannelId;

  const warnings = [];

  try {
    await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
    await addReaction(postedChannelId, msg.id, DENY_EMOJI);
  } catch (err) {
    warnings.push(`Reaction setup failed: ${err.message}`);
  }

  let threadId = null;
  try {
    const thread = await createThread(postedChannelId, msg.id, "Debug Application Test");
    threadId = thread.id || null;
    if (threadId) {
      const threadChannel = await client.channels.fetch(threadId);
      if (threadChannel && threadChannel.isTextBased()) {
        await threadChannel.send({
          content:
            "This is a debug discussion thread test. No application state was changed.",
          allowedMentions: { parse: [] },
        });
      }
    }
  } catch (err) {
    warnings.push(`Thread creation failed: ${err.message}`);
  }

  let guildId = interaction.guildId || null;
  if (!guildId) {
    const channel = await client.channels.fetch(postedChannelId);
    if (channel && "guildId" in channel && channel.guildId) {
      guildId = channel.guildId;
    }
  }

  return {
    trackKey: selectedTrack,
    trackLabel,
    channelId: postedChannelId,
    messageId: msg.id,
    threadId,
    messageUrl: guildId
      ? makeMessageUrl(guildId, postedChannelId, msg.id)
      : null,
    threadUrl: guildId && threadId ? makeMessageUrl(guildId, threadId, threadId) : null,
    warnings,
  };
}

function formatDecisionLabel(decision) {
  return decision === STATUS_ACCEPTED ? "ACCEPTED" : "DENIED";
}

async function runDebugRoleAssignmentSimulation({
  trackKey,
  channelId,
  userId,
  applicationId,
  jobId,
}) {
  if (!isSnowflake(userId)) {
    return {
      outcome: "warning",
      message: "Role test warning: invalid debug user id.",
      roleResult: null,
    };
  }
  if (!isSnowflake(channelId)) {
    return {
      outcome: "warning",
      message:
        "Role test warning: no valid guild channel context available. Run the command in a server text channel or configure /setchannel.",
      roleResult: null,
    };
  }

  const simulatedApplication = {
    trackKey,
    channelId,
    applicantUserId: userId,
    applicantName: `Debug User ${userId}`,
    applicationId,
    messageId: null,
    jobId: String(jobId || "").trim() || null,
  };
  const roleResult = await grantApprovedRoleOnAcceptance(simulatedApplication);
  const okStatuses = new Set(["granted", "already_has_role", "granted_partial"]);
  const isOk = okStatuses.has(String(roleResult?.status || ""));

  return {
    outcome: isOk ? "works" : "warning",
    message: isOk
      ? `Role test works: ${roleResult?.message || "role assignment succeeded."}`
      : `Role test warning: ${roleResult?.message || "role assignment did not succeed."}`,
    roleResult,
  };
}

async function runDebugDeniedDmSimulation({
  trackKey,
  channelId,
  userId,
  applicationId,
  jobId,
}) {
  if (!isSnowflake(userId)) {
    return {
      outcome: "warning",
      message: "Denied DM test warning: invalid debug user id.",
      dmResult: null,
    };
  }

  const simulatedApplication = {
    trackKey,
    channelId: isSnowflake(channelId) ? channelId : null,
    applicantUserId: userId,
    applicantName: `Debug User ${userId}`,
    applicationId,
    messageId: null,
    jobId: String(jobId || "").trim() || null,
    decisionSource: "debug_simulation",
    decidedAt: new Date().toISOString(),
  };
  const dmResult = await sendDeniedApplicationDm(
    simulatedApplication,
    "Debug deny simulation."
  );
  const isOk = String(dmResult?.status || "") === "sent";

  return {
    outcome: isOk ? "works" : "warning",
    message: isOk
      ? `Denied DM test works: ${dmResult?.message || "DM sent successfully."}`
      : `Denied DM test warning: ${dmResult?.message || "DM send did not succeed."}`,
    dmResult,
  };
}

async function runDebugDecisionTest(interaction, decision) {
  const suppliedJobId = interaction.options.getString("job_id");
  const messageId = resolveMessageIdForCommand(interaction);
  if (!messageId) {
    if (suppliedJobId) {
      const selectedTrack =
        getTrackKeyForChannelId(interaction.channelId || "") ||
        normalizeTrackKey(interaction.options.getString("track")) ||
        DEFAULT_TRACK_KEY;
      const selectedTrackLabel = getTrackLabel(selectedTrack);
      const normalizedJobId = String(suppliedJobId).trim();
      const derivedApplicationId = normalizedJobId || `${getTrackApplicationIdPrefix(selectedTrack)}-SIMULATED`;
      const fallbackChannelId =
        (interaction.inGuild() && isSnowflake(interaction.channelId)
          ? interaction.channelId
          : null) || getActiveChannelId(selectedTrack);
      const targetUser = interaction.options.getUser("user");
      const sideEffects = [
        `Simulation only: \`${normalizedJobId}\` is not a tracked application job ID in this chat context.`,
      ];

      if (!targetUser) {
        return {
          ok: false,
          simulated: true,
          decision,
          jobId: normalizedJobId,
          trackLabel: selectedTrackLabel,
          channelId: fallbackChannelId || null,
          error:
            decision === STATUS_ACCEPTED
              ? "For `/debug mode:accept_test` simulation, provide `user` to test role assignment."
              : "For `/debug mode:deny_test` simulation, provide `user` to test denied DM delivery.",
        };
      }

      if (decision === STATUS_ACCEPTED) {
        const roleTest = await runDebugRoleAssignmentSimulation({
          trackKey: selectedTrack,
          channelId: fallbackChannelId,
          userId: targetUser.id,
          applicationId: derivedApplicationId,
          jobId: normalizedJobId,
        });
        sideEffects.push(`Role Test User: <@${targetUser.id}>`);
        sideEffects.push(roleTest.message);
      } else {
        const deniedDmTest = await runDebugDeniedDmSimulation({
          trackKey: selectedTrack,
          channelId: fallbackChannelId,
          userId: targetUser.id,
          applicationId: derivedApplicationId,
          jobId: normalizedJobId,
        });
        sideEffects.push(`Denied DM Test User: <@${targetUser.id}>`);
        sideEffects.push(deniedDmTest.message);
      }
      sideEffects.push("No application state was changed.");

      return {
        ok: true,
        simulated: true,
        decision,
        messageId: null,
        applicationId: derivedApplicationId,
        jobId: normalizedJobId,
        trackLabel: selectedTrackLabel,
        channelId: fallbackChannelId || null,
        messageUrl: null,
        priorStatus: STATUS_PENDING,
        currentStatus: decision,
        decidedAt: new Date().toISOString(),
        sideEffects,
      };
    }
    return {
      ok: false,
      decision,
      error: suppliedJobId
        ? "That `job_id` was not found, or it maps to multiple track posts in this context."
        : "Message ID not found. Use this command in an application thread or pass `message_id`/`job_id`.",
    };
  }

  const stateBefore = readState();
  const applicationBefore = stateBefore.applications?.[messageId];
  if (!applicationBefore) {
    return {
      ok: false,
      decision,
      messageId,
      error: "This message ID is not a tracked application.",
    };
  }

  let finalizeResult = null;
  try {
    finalizeResult = await finalizeApplication(
      messageId,
      decision,
      "debug_command",
      interaction.user.id
    );
  } catch (err) {
    return {
      ok: false,
      decision,
      messageId,
      jobId: applicationBefore.jobId || null,
      trackLabel: getTrackLabel(applicationBefore.trackKey),
      priorStatus: applicationBefore.status || STATUS_PENDING,
      error: `Decision attempt failed: ${err.message}`,
    };
  }

  const stateAfter = readState();
  const applicationAfter = stateAfter.applications?.[messageId] || applicationBefore;

  const priorStatus = applicationBefore.status || STATUS_PENDING;
  const currentStatus = applicationAfter.status || priorStatus;
  const trackLabel = getTrackLabel(applicationAfter.trackKey);
  const channelId = applicationAfter.channelId || null;
  const jobId = applicationAfter.jobId || null;
  const applicationId = getApplicationDisplayId(applicationAfter, messageId);

  let messageUrl = null;
  let guildId = interaction.guildId || null;
  if (!guildId && channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && "guildId" in channel && channel.guildId) {
        guildId = channel.guildId;
      }
    } catch {
      // ignore URL resolution failure
    }
  }
  if (guildId && channelId) {
    messageUrl = makeMessageUrl(guildId, channelId, messageId);
  }

  const sideEffects = [];
  if (decision === STATUS_ACCEPTED) {
    sideEffects.push(
      `Approved Role Action: ${
        applicationAfter.approvedRoleResult?.message || "No approved-role action recorded."
      }`
    );
    sideEffects.push(
      `Acceptance Announcement Action: ${
        applicationAfter.acceptAnnounceResult?.message ||
        "No acceptance-announcement action recorded."
      }`
    );
  } else {
    sideEffects.push(
      `Denied DM Action: ${
        applicationAfter.denyDmResult?.message || "No denied-DM action recorded."
      }`
    );
  }

  if (!finalizeResult?.ok) {
    const reason =
      finalizeResult?.reason === "already_decided"
        ? `Already decided as ${String(finalizeResult?.status || currentStatus).toUpperCase()}.`
        : finalizeResult?.reason === "unknown_application"
          ? "This message ID is not a tracked application."
          : "Decision was not applied.";

    return {
      ok: false,
      decision,
      messageId,
      applicationId,
      jobId,
      trackLabel,
      channelId,
      messageUrl,
      priorStatus,
      currentStatus,
      error: reason,
      sideEffects,
    };
  }

  return {
    ok: true,
    decision,
    messageId,
    applicationId,
    jobId,
    trackLabel,
    channelId,
    messageUrl,
    priorStatus,
    currentStatus,
    decidedAt: applicationAfter.decidedAt || null,
    sideEffects,
  };
}

async function postApplicationForJob(state, job) {
  const headers = Array.isArray(job.headers) ? job.headers : [];
  const row = Array.isArray(job.row) ? job.row : [];
  const inferredTrackKeys = inferApplicationTracks(headers, row);
  const trackKeys = normalizeTrackKeys(
    Array.isArray(job.trackKeys) ? job.trackKeys : job.trackKey,
    { fallback: inferredTrackKeys }
  );
  job.trackKeys = trackKeys;
  const postedTrackKeys = normalizeTrackKeys(job.postedTrackKeys, {
    allowEmpty: true,
    fallback: [],
  });
  job.postedTrackKeys = postedTrackKeys;

  const pendingTrackKeys = trackKeys.filter(
    (trackKey) => !postedTrackKeys.includes(trackKey)
  );
  if (pendingTrackKeys.length === 0) {
    return;
  }

  const missingTrackKeys = [];
  const channelByTrack = {};
  for (const trackKey of pendingTrackKeys) {
    const channelId = getActiveChannelId(trackKey);
    if (!channelId) {
      missingTrackKeys.push(trackKey);
    } else {
      channelByTrack[trackKey] = channelId;
    }
  }
  if (missingTrackKeys.length > 0) {
    throw new Error(
      `Missing post channels for: ${missingTrackKeys
        .map((trackKey) => getTrackLabel(trackKey))
        .join(", ")}. Run /setchannel.`
    );
  }

  const rowIndex = Number.isInteger(job.rowIndex) ? job.rowIndex : "unknown";
  const applicantName = inferApplicantName(headers, row);
  const postedTrackSet = new Set(postedTrackKeys);

  for (const trackKey of pendingTrackKeys) {
    const trackLabel = getTrackLabel(trackKey);
    const configuredChannelId = channelByTrack[trackKey];

    const applicantDiscord = await resolveApplicantDiscordUser(
      configuredChannelId,
      headers,
      row
    );
    const applicantMention = applicantDiscord.userId
      ? `<@${applicantDiscord.userId}>`
      : null;
    const allowedMentions = applicantDiscord.userId
      ? { parse: [], users: [applicantDiscord.userId] }
      : { parse: [] };
    const builtApplicationId = buildApplicationId(trackKey, job.jobId);

    const initialContent = makeApplicationPostContent({
      applicationId: builtApplicationId,
      trackKey,
      applicantMention,
      applicantRawValue: applicantDiscord.rawValue,
      headers,
      row,
    });

    const msg = await sendChannelMessage(
      configuredChannelId,
      initialContent,
      allowedMentions
    );
    const postedChannelId = msg.channelId || configuredChannelId;

    const applicationId = builtApplicationId || msg.id;
    const finalContent = makeApplicationPostContent({
      applicationId,
      trackKey,
      applicantMention,
      applicantRawValue: applicantDiscord.rawValue,
      headers,
      row,
    });
    if (finalContent !== initialContent) {
      try {
        await withRateLimitRetry("Edit message", async () =>
          msg.edit({
            content: finalContent,
            allowedMentions,
          })
        );
      } catch (err) {
        console.error(
          `[JOB ${job.jobId}] Failed updating application ID text for ${trackLabel}:`,
          err.message
        );
      }
    }

    try {
      await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
      await addReaction(postedChannelId, msg.id, DENY_EMOJI);
    } catch (err) {
      console.error(
        `[JOB ${job.jobId}] Failed adding reactions for ${trackLabel}:`,
        err.message
      );
    }

    let thread = null;
    try {
      thread = await createThread(
        postedChannelId,
        msg.id,
        `${trackLabel} Application - ${applicantName}`
      );
    } catch (err) {
      console.error(
        `[JOB ${job.jobId}] Failed creating thread for ${trackLabel}:`,
        err.message
      );
    }

    state.applications[msg.id] = {
      messageId: msg.id,
      applicationId,
      channelId: postedChannelId,
      threadId: thread?.id || null,
      status: STATUS_PENDING,
      trackKey,
      rowIndex: typeof rowIndex === "number" ? rowIndex : null,
      responseKey: String(job.responseKey || "").trim() || buildResponseKey(headers, row),
      jobId: job.jobId,
      applicantName,
      applicantUserId: applicantDiscord.userId || null,
      createdAt: new Date().toISOString(),
      submittedFields: extractAnsweredFields(headers, row).map(
        ({ key, value }) => `**${key}:** ${value}`
      ),
    };

    if (thread?.id) {
      state.threads[thread.id] = msg.id;
    }

    postedTrackSet.add(trackKey);
    job.postedTrackKeys = normalizeTrackKeys([...postedTrackSet], {
      allowEmpty: true,
      fallback: [],
    });
    writeState(state);
  }
}

async function processQueuedPostJobs() {
  if (isProcessingPostJobs) {
    const state = readState();
    return {
      queuedBefore: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
      posted: 0,
      failed: 0,
      remaining: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
      busy: true,
      failedJobId: null,
      failedError: null,
    };
  }

  if (!hasAnyActivePostChannelConfigured()) {
    const state = readState();
    return {
      queuedBefore: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
      posted: 0,
      failed: 0,
      remaining: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
      busy: false,
      failedJobId: null,
      failedError: null,
    };
  }

  isProcessingPostJobs = true;
  try {
    const state = readState();
    if (!Array.isArray(state.postJobs) || state.postJobs.length === 0) {
      return {
        queuedBefore: 0,
        posted: 0,
        failed: 0,
        remaining: 0,
        busy: false,
        failedJobId: null,
        failedError: null,
      };
    }

    sortPostJobsInPlace(state.postJobs);
    const queuedBefore = state.postJobs.length;
    let posted = 0;
    let failed = 0;
    let failedJobId = null;
    let failedError = null;

    while (state.postJobs.length > 0) {
      const job = state.postJobs[0];
      const inferredTrackKeys = inferApplicationTracks(
        Array.isArray(job.headers) ? job.headers : [],
        Array.isArray(job.row) ? job.row : []
      );
      job.trackKeys = normalizeTrackKeys(
        Array.isArray(job.trackKeys) ? job.trackKeys : job.trackKey,
        { fallback: inferredTrackKeys }
      );
      job.postedTrackKeys = normalizeTrackKeys(job.postedTrackKeys, {
        allowEmpty: true,
        fallback: [],
      });
      const trackLabels = formatTrackLabels(job.trackKeys);
      job.attempts = (Number.isInteger(job.attempts) ? job.attempts : 0) + 1;
      job.lastAttemptAt = new Date().toISOString();

      try {
        await postApplicationForJob(state, job);
        state.postJobs.shift();
        posted += 1;
        writeState(state);
        console.log(
          `[JOB ${job.jobId}] Posted ${trackLabels} application(s) for row ${job.rowIndex}.`
        );
      } catch (err) {
        job.lastError = err.message;
        failed += 1;
        failedJobId = job.jobId;
        failedError = err.message;
        writeState(state);
        console.error(
          `[JOB ${job.jobId}] Failed posting ${trackLabels} row ${job.rowIndex}:`,
          err.message
        );
        break;
      }
    }

    return {
      queuedBefore,
      posted,
      failed,
      remaining: state.postJobs.length,
      busy: false,
      failedJobId,
      failedError,
    };
  } finally {
    isProcessingPostJobs = false;
  }
}

async function pollOnce() {
  const state = readState();
  const values = await readAllResponses();

  if (values.length > 0) {
    const headers = Array.isArray(values[0]) ? values[0] : [];
    const rows = values.slice(1);
    const endDataRow = rows.length + 1;
    const trackedResponseKeys = buildTrackedResponseKeySet(state);
    const trackedRows = buildTrackedRowSet(state);
    let stateChanged = false;

    for (let sheetRowNumber = 2; sheetRowNumber <= endDataRow; sheetRowNumber += 1) {
      const row = values[sheetRowNumber - 1] || [];
      if (row.every((cell) => !String(cell || "").trim())) {
        continue;
      }

      const responseKey = buildResponseKey(headers, row);
      if (responseKey && trackedResponseKeys.has(responseKey)) {
        continue;
      }

      if (!responseKey && trackedRows.has(sheetRowNumber)) {
        continue;
      }

      const job = createPostJob(state, headers, row, sheetRowNumber);
      if (responseKey && !job.responseKey) {
        job.responseKey = responseKey;
      }

      state.postJobs.push(job);
      if (responseKey) {
        trackedResponseKeys.add(responseKey);
      } else {
        trackedRows.add(sheetRowNumber);
      }
      stateChanged = true;
      console.log(
        `[JOB ${job.jobId}] Queued ${formatTrackLabels(job.trackKeys)} application post for row ${sheetRowNumber}.`
      );
    }

    if (state.lastRow !== endDataRow) {
      state.lastRow = endDataRow;
      stateChanged = true;
    }

    if (stateChanged) {
      sortPostJobsInPlace(state.postJobs);
      writeState(state);
    }
  }

  if (!hasAnyActivePostChannelConfigured()) {
    if (!loggedNoChannelWarning) {
      console.log(
        "Posting paused: no application post channels configured. Use /setchannel."
      );
      loggedNoChannelWarning = true;
    }
    return;
  }
  loggedNoChannelWarning = false;

  const queueResult = await processQueuedPostJobs();
  if (queueResult.posted > 0 || queueResult.failed > 0) {
    const details = [
      `queue=${queueResult.queuedBefore}`,
      `posted=${queueResult.posted}`,
      `remaining=${queueResult.remaining}`,
    ];
    if (queueResult.failed > 0 && queueResult.failedJobId) {
      details.push(`blocked=${queueResult.failedJobId}`);
    }
    console.log(`Job run summary: ${details.join(", ")}`);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) {
      return;
    }

    if (reaction.partial) {
      await reaction.fetch();
    }

    const emojiName = reaction.emoji.name;
    if (emojiName !== ACCEPT_EMOJI && emojiName !== DENY_EMOJI) {
      return;
    }

    const state = readState();
    if (!state.applications[reaction.message.id]) {
      return;
    }

    await evaluateAndApplyVoteDecision(reaction.message.id);
  } catch (err) {
    console.error("Reaction add handler failed:", err.message);
  }
});

client.on("messageReactionRemove", async (reaction) => {
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }

    const emojiName = reaction.emoji.name;
    if (emojiName !== ACCEPT_EMOJI && emojiName !== DENY_EMOJI) {
      return;
    }

    const state = readState();
    if (!state.applications[reaction.message.id]) {
      return;
    }

    await evaluateAndApplyVoteDecision(reaction.message.id);
  } catch (err) {
    console.error("Reaction remove handler failed:", err.message);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const isAccept = interaction.commandName === "accept";
    const isDeny = interaction.commandName === "deny";
    const isSetChannel = interaction.commandName === "setchannel";
    const isSetAppRole = interaction.commandName === "setapprole";
    const isSetDenyMsg = interaction.commandName === "setdenymsg";
    const isSetAcceptMsg =
      interaction.commandName === "setacceptmsg" ||
      interaction.commandName === "setaccept";
    const isStructuredMsg = interaction.commandName === "structuredmsg";
    const isDebug = interaction.commandName === "debug";
    const isStop = interaction.commandName === "stop";
    const isRestart = interaction.commandName === "restart";
    if (
      !isAccept &&
      !isDeny &&
      !isSetChannel &&
      !isSetAppRole &&
      !isSetDenyMsg &&
      !isSetAcceptMsg &&
      !isStructuredMsg &&
      !isDebug &&
      !isStop &&
      !isRestart
    ) {
      return;
    }

    const memberPerms = interaction.memberPermissions;
    if (!memberPerms) {
      await interaction.reply({
        content: "Unable to determine your permissions.",
        ephemeral: true,
      });
      return;
    }

    const canManageServer =
      memberPerms.has(PermissionsBitField.Flags.Administrator) ||
      memberPerms.has(PermissionsBitField.Flags.ManageGuild);
    const canForceDecision =
      memberPerms.has(PermissionsBitField.Flags.Administrator) ||
      (memberPerms.has(PermissionsBitField.Flags.ManageGuild) &&
        memberPerms.has(PermissionsBitField.Flags.ManageRoles));

    if (isDebug) {
      if (!canManageServer) {
        await interaction.reply({
          content: "You need Manage Server permission (or Administrator) to use /debug.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const mode =
        interaction.options.getString("mode", true) || DEBUG_MODE_REPORT;

      let dmText = "";
      let confirmText = "Debug result sent to your DMs.";

      if (mode === DEBUG_MODE_REPORT) {
        const report = await buildDebugReport(interaction);
        dmText = [`🧪 Debug Report`, `Requested by: ${userDisplayName(interaction.user)}`, "", report].join(
          "\n"
        );
      } else if (mode === DEBUG_MODE_POST_TEST) {
        const result = await runDebugPostTest(interaction);
        const lines = [
          "🧪 Debug Post Test Completed",
          `Requested by: ${userDisplayName(interaction.user)}`,
          `Track: ${result.trackLabel}`,
          `Channel ID: ${result.channelId}`,
          `Message ID: ${result.messageId}`,
        ];
        if (result.messageUrl) {
          lines.push(`Message Link: ${result.messageUrl}`);
        }
        if (result.threadId) {
          lines.push(`Thread ID: ${result.threadId}`);
        }
        if (result.threadUrl) {
          lines.push(`Thread Link: ${result.threadUrl}`);
        }
        if (result.warnings.length > 0) {
          lines.push(`Warnings: ${result.warnings.join(" | ")}`);
        } else {
          lines.push("Message post, reactions, and thread creation all succeeded.");
        }
        dmText = lines.join("\n");
        confirmText = "Debug post test ran. Results sent to your DMs.";
      } else if (
        mode === DEBUG_MODE_ACCEPT_TEST ||
        mode === DEBUG_MODE_DENY_TEST
      ) {
        if (!canForceDecision) {
          await interaction.editReply({
            content:
              "Debug accept/deny tests require both Manage Server and Manage Roles permissions (or Administrator).",
          });
          return;
        }

        const decision =
          mode === DEBUG_MODE_ACCEPT_TEST ? STATUS_ACCEPTED : STATUS_DENIED;
        const result = await runDebugDecisionTest(interaction, decision);
        const lines = [
          `🧪 Debug ${formatDecisionLabel(decision)} Test Completed`,
          `Requested by: ${userDisplayName(interaction.user)}`,
          `Decision: ${formatDecisionLabel(decision)}`,
        ];
        if (result.messageId) {
          lines.push(`Message ID: ${result.messageId}`);
        }
        if (result.applicationId) {
          lines.push(`Application ID: ${result.applicationId}`);
        }
        if (result.jobId) {
          lines.push(`Job ID: ${result.jobId}`);
        }
        if (result.trackLabel) {
          lines.push(`Track: ${result.trackLabel}`);
        }
        if (result.simulated) {
          lines.push("Mode: SIMULATED (no state changes)");
        }
        if (result.priorStatus) {
          lines.push(`Previous Status: ${String(result.priorStatus).toUpperCase()}`);
        }
        if (result.currentStatus) {
          lines.push(`Current Status: ${String(result.currentStatus).toUpperCase()}`);
        }
        if (result.channelId) {
          lines.push(`Channel ID: ${result.channelId}`);
        }
        if (result.messageUrl) {
          lines.push(`Message Link: ${result.messageUrl}`);
        }
        if (result.decidedAt) {
          lines.push(`Decided At: ${result.decidedAt}`);
        }
        if (Array.isArray(result.sideEffects) && result.sideEffects.length > 0) {
          lines.push(...result.sideEffects);
        }
        lines.push(
          result.ok
            ? result.simulated
              ? "Outcome: simulation completed (no state changes)."
              : "Outcome: decision applied successfully."
            : `Outcome: ${result.error || "decision not applied"}.`
        );
        dmText = lines.join("\n");
        confirmText = result.ok
          ? result.simulated
            ? `Debug ${formatDecisionLabel(decision).toLowerCase()} simulation ran. Results sent to your DMs.`
            : `Debug ${formatDecisionLabel(decision).toLowerCase()} test ran. Results sent to your DMs.`
          : `Debug ${formatDecisionLabel(decision).toLowerCase()} test completed with warnings. Results sent to your DMs.`;
      } else {
        throw new Error(`Unknown debug mode: ${mode}`);
      }

      try {
        await sendDebugDm(interaction.user, dmText);
      } catch (err) {
        await interaction.editReply({
          content:
            "I could not DM you. Enable DMs from server members, then run /debug again.",
        });
        return;
      }

      await interaction.editReply({
        content: confirmText,
      });
      return;
    }

    if (isSetDenyMsg) {
      if (!canManageServer) {
        await interaction.reply({
          content:
            "You need Manage Server permission (or Administrator) to run this command.",
          ephemeral: true,
        });
        return;
      }

      const message = interaction.options.getString("message", true)?.trim();
      if (!message) {
        await interaction.reply({
          content: "Please provide a non-empty message template.",
          ephemeral: true,
        });
        return;
      }

      setActiveDenyDmTemplate(message);
      await interaction.reply({
        content:
          "Denied DM template updated. Placeholders supported: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{decision_source}`, `{reason}`, `{decided_at}`.",
        ephemeral: true,
      });
      return;
    }

    if (isSetAcceptMsg) {
      if (!canManageServer) {
        await interaction.reply({
          content:
            "You need Manage Server permission (or Administrator) to run this command.",
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel("channel");
      const message = interaction.options.getString("message");
      const trimmedMessage = typeof message === "string" ? message.trim() : "";
      if (!channel && !trimmedMessage) {
        await interaction.reply({
          content:
            "Provide `channel`, `message`, or both. Example: `/setaccept message:Welcome to {track} team...`",
          ephemeral: true,
        });
        return;
      }

      if (channel) {
        if (channel.type !== ChannelType.GuildText) {
          await interaction.reply({
            content: "Please choose a guild text channel for accepted announcements.",
            ephemeral: true,
          });
          return;
        }
        setActiveAcceptAnnounceChannel(channel.id);
      }

      if (trimmedMessage) {
        setActiveAcceptAnnounceTemplate(trimmedMessage);
      }

      const activeChannelId = getActiveAcceptAnnounceChannelId();
      const lines = [];
      if (channel) {
        lines.push(`Accepted announcement channel set to <#${channel.id}>.`);
      } else if (activeChannelId) {
        lines.push(`Accepted announcement channel unchanged: <#${activeChannelId}>.`);
      } else {
        lines.push("Accepted announcement channel is not configured yet.");
      }

      if (trimmedMessage) {
        lines.push(
          "Accepted announcement template updated. Placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{role_result}`, `{decided_at}`."
        );
      }

      await interaction.reply({
        content: lines.join("\n"),
        ephemeral: true,
      });
      return;
    }

    if (isStructuredMsg) {
      if (!canManageServer) {
        await interaction.reply({
          content:
            "You need Manage Server permission (or Administrator) to run this command.",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.channel || !interaction.channel.isTextBased()) {
        await interaction.reply({
          content: "Run this command in a text channel.",
          ephemeral: true,
        });
        return;
      }

      const title = interaction.options.getString("title", true).trim();
      const rawLines = [
        interaction.options.getString("line_1", true),
        interaction.options.getString("line_2"),
        interaction.options.getString("line_3"),
        interaction.options.getString("line_4"),
        interaction.options.getString("line_5"),
      ];
      const lines = rawLines
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const useCodeBlock = Boolean(interaction.options.getBoolean("code_block"));
      const contentLines = useCodeBlock
        ? [
            `📌 **${title}**`,
            "```",
            lines.join("\n\n"),
            "```",
          ]
        : [
            `📌 **${title}**`,
            "",
            ...lines.map((line, index) => `${index + 1}. ${line}`),
          ];
      const content = contentLines.join("\n");

      await sendChannelMessage(interaction.channelId, content, { parse: [] });
      await interaction.reply({
        content: `Structured message posted in <#${interaction.channelId}>.`,
        ephemeral: true,
      });
      return;
    }

    if (isSetAppRole) {
      const canSetRole =
        memberPerms.has(PermissionsBitField.Flags.Administrator) ||
        (memberPerms.has(PermissionsBitField.Flags.ManageGuild) &&
          memberPerms.has(PermissionsBitField.Flags.ManageRoles));
      if (!canSetRole) {
        await interaction.reply({
          content:
            "You need both Manage Server and Manage Roles (or Administrator) to run this command.",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.inGuild()) {
        await interaction.reply({
          content: "Run this command inside a server channel.",
          ephemeral: true,
        });
        return;
      }

      const primaryRole = interaction.options.getRole("role", true);
      if (!primaryRole) {
        await interaction.reply({
          content: "Role not found.",
          ephemeral: true,
        });
        return;
      }

      const selectedTrack = normalizeTrackKey(
        interaction.options.getString("track", true)
      );
      if (!selectedTrack) {
        await interaction.reply({
          content: "Please provide a valid track.",
          ephemeral: true,
        });
        return;
      }
      const trackLabel = getTrackLabel(selectedTrack);
      const optionalRoles = [
        interaction.options.getRole("role_2"),
        interaction.options.getRole("role_3"),
        interaction.options.getRole("role_4"),
        interaction.options.getRole("role_5"),
      ].filter(Boolean);
      const selectedRoleIds = parseRoleIdList([
        primaryRole.id,
        ...optionalRoles.map((role) => role.id),
      ]);
      const roleUpdate = setActiveApprovedRoles(selectedTrack, selectedRoleIds);

      let warning = "";
      try {
        const me = await interaction.guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          warning = "\nWarning: I do not currently have Manage Roles permission.";
        } else {
          const warningLines = [];
          for (const roleId of selectedRoleIds) {
            const fullRole = await interaction.guild.roles.fetch(roleId);
            if (fullRole && me.roles.highest.comparePositionTo(fullRole) <= 0) {
              warningLines.push(`My top role must be above <@&${roleId}> to assign it.`);
            }
            if (fullRole?.managed) {
              warningLines.push(
                `<@&${roleId}> is a managed/integration role and may not be assignable.`
              );
            }
          }
          if (warningLines.length > 0) {
            warning = `\nWarning: ${warningLines.join(" ")}`;
          }
        }
      } catch (err) {
        warning = `\nWarning: Could not fully validate role assignability (${err.message}).`;
      }

      const currentRoleMentions =
        roleUpdate.roleIds.length > 0
          ? roleUpdate.roleIds.map((id) => `<@&${id}>`).join(", ")
          : "none";
      await interaction.reply({
        content: [
          `${trackLabel} accepted roles replaced.`,
          `${trackLabel} current accepted roles (${roleUpdate.roleIds.length}): ${currentRoleMentions}.`,
        ].join("\n") + warning,
        ephemeral: true,
      });

      await postConfigurationLog(interaction, "Accepted Roles Updated", [
        `**Track:** ${trackLabel}`,
        `**Roles (${roleUpdate.roleIds.length}):** ${currentRoleMentions}`,
      ]);
      return;
    }

    if (isStop || isRestart) {
      if (!canManageServer) {
        await interaction.reply({
          content: "You need Manage Server permission (or Administrator) to use /stop or /restart.",
          ephemeral: true,
        });
        return;
      }

      await logControlCommand(isRestart ? "restart" : "stop", interaction);

      await interaction.reply({
        content: isRestart
          ? "Restarting bot process now."
          : "Stopping bot process now.",
        ephemeral: true,
      });

      setTimeout(() => process.exit(0), 500);
      return;
    }

    if (isSetChannel) {
      const canSetChannel =
        memberPerms.has(PermissionsBitField.Flags.Administrator) ||
        memberPerms.has(PermissionsBitField.Flags.ManageGuild);
      if (!canSetChannel) {
        await interaction.reply({
          content:
            "You need Manage Server permission (or Administrator) to run this command.",
          ephemeral: true,
        });
        return;
      }

      if (!interaction.inGuild()) {
        await interaction.reply({
          content: "Run this command inside a server channel.",
          ephemeral: true,
        });
        return;
      }

      const legacyTesterChannel = interaction.options.getChannel("application_post");
      const testerChannelInput =
        interaction.options.getChannel("tester_post") || legacyTesterChannel;
      const builderChannelInput = interaction.options.getChannel("builder_post");
      const cmdChannelInput = interaction.options.getChannel("cmd_post");
      const logChannelInput = interaction.options.getChannel("log");

      const providedTrackChannels = {
        [TRACK_TESTER]: testerChannelInput,
        [TRACK_BUILDER]: builderChannelInput,
        [TRACK_CMD]: cmdChannelInput,
      };
      const hasTrackOption = Object.values(providedTrackChannels).some(Boolean);
      const resolvedTrackChannelIds = getActiveChannelMap();

      if (!hasTrackOption) {
        const hasExistingTrackChannel = Object.values(resolvedTrackChannelIds).some((id) =>
          isSnowflake(id)
        );
        const shouldAutoSetTesterFromCurrent = !hasExistingTrackChannel || !logChannelInput;
        if (shouldAutoSetTesterFromCurrent) {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content:
                "Please run `/setchannel` in a guild text channel or provide track channel options.",
              ephemeral: true,
            });
            return;
          }
          resolvedTrackChannelIds[TRACK_TESTER] = interaction.channel.id;
        }
      } else {
        for (const [trackKey, channel] of Object.entries(providedTrackChannels)) {
          if (!channel) {
            continue;
          }
          if (channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: `Please choose a guild text channel for \`${trackKey}_post\`.`,
              ephemeral: true,
            });
            return;
          }
          resolvedTrackChannelIds[trackKey] = channel.id;
        }
      }

      if (!Object.values(resolvedTrackChannelIds).some((id) => isSnowflake(id))) {
        await interaction.reply({
          content:
            "No application post channels are configured. Set at least one of tester/builder/cmd post channels.",
          ephemeral: true,
        });
        return;
      }

      let nextLogChannelId = getActiveLogsChannelId();
      if (logChannelInput) {
        if (logChannelInput.type !== ChannelType.GuildText) {
          await interaction.reply({
            content: "Please choose a guild text channel for `log`.",
            ephemeral: true,
          });
          return;
        }
        nextLogChannelId = logChannelInput.id;
      }
      if (!nextLogChannelId) {
        nextLogChannelId =
          resolvedTrackChannelIds[TRACK_TESTER] ||
          resolvedTrackChannelIds[TRACK_BUILDER] ||
          resolvedTrackChannelIds[TRACK_CMD] ||
          null;
      }

      await interaction.deferReply({ ephemeral: true });

      for (const trackKey of APPLICATION_TRACK_KEYS) {
        if (isSnowflake(resolvedTrackChannelIds[trackKey])) {
          setActiveChannel(trackKey, resolvedTrackChannelIds[trackKey]);
        }
      }
      if (isSnowflake(nextLogChannelId)) {
        setActiveLogsChannel(nextLogChannelId);
      }

      const pendingBefore = readState().postJobs.length;
      const replayResult = await processQueuedPostJobs();
      let replayLine = "No queued application jobs to replay.";
      if (replayResult.busy) {
        replayLine =
          "Queued application replay is already running in another task; it will continue automatically.";
      } else if (pendingBefore > 0) {
        replayLine = `Queued application replay: posted ${replayResult.posted}/${pendingBefore} in row order. Remaining: ${replayResult.remaining}.`;
        if (replayResult.failed > 0 && replayResult.failedJobId) {
          replayLine += ` Blocked at ${replayResult.failedJobId}: ${replayResult.failedError}`;
        }
      }

      let auditResult = "Permission audit passed.";
      try {
        await auditBotPermissions();
      } catch (err) {
        auditResult = `Permission audit failed: ${err.message}`;
      }

      await interaction.editReply({
        content: [
          `Tester post channel: ${
            resolvedTrackChannelIds[TRACK_TESTER]
              ? `<#${resolvedTrackChannelIds[TRACK_TESTER]}>`
              : "not set"
          }`,
          `Builder post channel: ${
            resolvedTrackChannelIds[TRACK_BUILDER]
              ? `<#${resolvedTrackChannelIds[TRACK_BUILDER]}>`
              : "not set"
          }`,
          `CMD post channel: ${
            resolvedTrackChannelIds[TRACK_CMD]
              ? `<#${resolvedTrackChannelIds[TRACK_CMD]}>`
              : "not set"
          }`,
          `Application log channel: ${
            isSnowflake(nextLogChannelId) ? `<#${nextLogChannelId}>` : "not set"
          }`,
          replayLine,
          auditResult,
        ].join("\n"),
      });

      await postConfigurationLog(interaction, "Application Channels Updated", [
        `**Tester Post:** ${
          resolvedTrackChannelIds[TRACK_TESTER]
            ? `<#${resolvedTrackChannelIds[TRACK_TESTER]}>`
            : "not set"
        }`,
        `**Builder Post:** ${
          resolvedTrackChannelIds[TRACK_BUILDER]
            ? `<#${resolvedTrackChannelIds[TRACK_BUILDER]}>`
            : "not set"
        }`,
        `**CMD Post:** ${
          resolvedTrackChannelIds[TRACK_CMD]
            ? `<#${resolvedTrackChannelIds[TRACK_CMD]}>`
            : "not set"
        }`,
        `**Log Channel:** ${
          isSnowflake(nextLogChannelId) ? `<#${nextLogChannelId}>` : "not set"
        }`,
      ]);
      return;
    }

    if (!canForceDecision) {
      await interaction.reply({
        content:
          "You need both Manage Server and Manage Roles permissions (or Administrator) to use /accept or /deny.",
        ephemeral: true,
      });
      return;
    }

    const suppliedJobId = interaction.options.getString("job_id");
    const messageId = resolveMessageIdForCommand(interaction);
    if (!messageId) {
      await interaction.reply({
        content:
          suppliedJobId
            ? "That `job_id` was not found, or it matches multiple track posts. Use this command in the target application thread/channel or pass `message_id`."
            : "Message ID not found. Use this command inside an application thread or pass `message_id` or `job_id`.",
        ephemeral: true,
      });
      return;
    }

    const decision = isAccept ? STATUS_ACCEPTED : STATUS_DENIED;
    const result = await finalizeApplication(
      messageId,
      decision,
      "force_command",
      interaction.user.id
    );

    if (!result.ok && result.reason === "unknown_application") {
      await interaction.reply({
        content: suppliedJobId
          ? "That `job_id` does not map to a unique tracked application in this context."
          : "This message ID is not a tracked application.",
        ephemeral: true,
      });
      return;
    }

    if (!result.ok && result.reason === "already_decided") {
      await interaction.reply({
        content: `Already decided as **${result.status}**.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Application ${decision} by force command.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error("Interaction handler failed:", err.message);
    if (!interaction.isRepliable()) {
      return;
    }

    if (interaction.deferred && !interaction.replied) {
      await interaction
        .editReply({
          content: "Failed to process command.",
        })
        .catch(() => {});
      return;
    }

    if (!interaction.replied) {
      await interaction
        .reply({
          content: "Failed to process command.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

client.on("guildCreate", async (guild) => {
  try {
    await ensureLogsChannel(guild);
    const rest = new REST({ version: "10" }).setToken(config.botToken);
    const commands = buildSlashCommands();
    await registerSlashCommandsForGuild(rest, guild.id, commands);
  } catch (err) {
    console.error(`Failed creating logs channel in guild ${guild.id}:`, err.message);
  }
});

async function main() {
  await client.login(config.botToken);
  await auditBotPermissions();
  await registerSlashCommands();

  try {
    const activeChannelId = getAnyActiveChannelId();
    if (!activeChannelId) {
      console.log("No active application channels configured yet. Use /setchannel.");
    } else {
      const channel = await client.channels.fetch(activeChannelId);
      if (channel && "guild" in channel && channel.guild) {
        await ensureLogsChannel(channel.guild);
      }
    }
  } catch (err) {
    console.error("Failed ensuring logs channel on startup:", err.message);
  }

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

function isRetryableStartupError(err) {
  const retryableCodes = new Set([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ]);

  const code = String(err?.code || "").toUpperCase();
  if (retryableCodes.has(code)) {
    return true;
  }

  const message = String(err?.message || "").toLowerCase();
  return (
    message.includes("getaddrinfo") ||
    message.includes("network") ||
    message.includes("timed out")
  );
}

async function bootWithRetry() {
  const waitMs =
    Number.isFinite(config.startupRetryMs) && config.startupRetryMs > 0
      ? config.startupRetryMs
      : 15000;

  while (true) {
    try {
      await main();
      return;
    } catch (err) {
      if (!isRetryableStartupError(err)) {
        throw err;
      }

      console.error(
        `Startup failed (${err.code || err.name || "error"}: ${err.message}). Retrying in ${Math.ceil(
          waitMs / 1000
        )}s...`
      );
      try {
        client.destroy();
      } catch {
        // ignore cleanup errors between retries
      }
      await sleep(waitMs);
    }
  }
}

let crashHandlersInstalled = false;

function installCrashHandlers() {
  if (crashHandlersInstalled) {
    return;
  }
  crashHandlersInstalled = true;

  process.on("uncaughtException", (err) => {
    try {
      const crashPath = writeCrashLog("uncaughtException", err);
      console.error(`Uncaught exception. Crash log written to ${crashPath}`);
    } catch (logErr) {
      console.error("Failed writing uncaught exception crash log:", logErr.message);
    }
    console.error("Uncaught exception:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      const crashPath = writeCrashLog("unhandledRejection", reason);
      console.error(`Unhandled rejection. Crash log written to ${crashPath}`);
    } catch (logErr) {
      console.error("Failed writing unhandled rejection crash log:", logErr.message);
    }
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  });
}

installCrashHandlers();

bootWithRetry().catch((err) => {
  try {
    const crashPath = writeCrashLog("fatalStartup", err);
    console.error(`Fatal startup error. Crash log written to ${crashPath}`);
  } catch (logErr) {
    console.error("Failed writing fatal startup crash log:", logErr.message);
  }
  console.error("Fatal error:", err);
  process.exit(1);
});
