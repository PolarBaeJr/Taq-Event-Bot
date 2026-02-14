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
const { createTrackRegistry } = require("./lib/trackRegistry");
const { createTrackAutoManager } = require("./lib/trackAutoManager");
const { createApplicationIdUtils } = require("./lib/applicationIdUtils");
const { createTrackStateUtils } = require("./lib/trackStateUtils");
const { createStateFileFallbackUtils } = require("./lib/stateFileFallbackUtils");
const { createChannelSettingsAccessors } = require("./lib/channelSettingsAccessors");
const { createSlashCommandLifecycle } = require("./lib/slashCommandLifecycle");
const { createApplicationFormUtils } = require("./lib/applicationFormUtils");
const { createDebugAndFeedbackUtils } = require("./lib/debugAndFeedbackUtils");
const { createPollingPipeline } = require("./lib/pollingPipeline");
const { createInteractionCommandHandler } = require("./lib/interactionCommandHandler");
const {
  toCodeBlock,
  applyTemplatePlaceholders,
  splitMessageByLength,
  sleep,
  getRetryAfterMsFromBody,
  withRateLimitRetry,
} = require("./lib/messageAndRetryUtils");

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
  bugChannelId: process.env.DISCORD_BUG_CHANNEL_ID,
  suggestionsChannelId: process.env.DISCORD_SUGGESTIONS_CHANNEL_ID,
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
const STATE_FILE_FALLBACK_BASENAME = "taq-event-team-bot-state.json";
const { isStateFilePermissionError, switchStateFileToWritableFallback } =
  createStateFileFallbackUtils({
    config,
    stateFileFallbackBasename: STATE_FILE_FALLBACK_BASENAME,
  });

const TRACK_TESTER = "tester";
const TRACK_BUILDER = "builder";
const TRACK_CMD = "cmd";
const DEFAULT_TRACK_KEY = TRACK_TESTER;
const BASE_APPLICATION_TRACKS = [
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
const {
  normalizeTrackAlias,
  parseTrackAliasInput,
  buildTrackAliasLookup,
  normalizeCustomTrackDefinition,
  setCustomTracks: setRuntimeCustomTracks,
  getCustomTracksSnapshot,
  getApplicationTracks,
  getApplicationTrackKeys,
  getTrackLookupByKey,
} = createTrackRegistry({
  baseTracks: BASE_APPLICATION_TRACKS,
});
const BASE_TRACK_ENV_OVERRIDES = Object.freeze({
  [TRACK_TESTER]: {
    channelKeys: ["testerChannelId", "channelId"],
    approvedRoleListKeys: ["testerApprovedRoleIds", "approvedRoleIds"],
    approvedRoleSingleKeys: ["testerApprovedRoleId", "approvedRoleId"],
  },
  [TRACK_BUILDER]: {
    channelKeys: ["builderChannelId"],
    approvedRoleListKeys: ["builderApprovedRoleIds"],
    approvedRoleSingleKeys: ["builderApprovedRoleId"],
  },
  [TRACK_CMD]: {
    channelKeys: ["cmdChannelId"],
    approvedRoleListKeys: ["cmdApprovedRoleIds"],
    approvedRoleSingleKeys: ["cmdApprovedRoleId"],
  },
});
const BASE_SETCHANNEL_TRACK_OPTIONS = Object.freeze([
  {
    trackKey: TRACK_TESTER,
    optionName: "tester_post",
    description: "Tester application post channel",
    legacyOptionName: "application_post",
    legacyDescription: "Legacy tester post channel (optional)",
  },
  {
    trackKey: TRACK_BUILDER,
    optionName: "builder_post",
    description: "Builder application post channel",
  },
  {
    trackKey: TRACK_CMD,
    optionName: "cmd_post",
    description: "CMD application post channel",
  },
]);

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
const JOB_ID_PATTERN = /^job-(\d+)$/i;
const JOB_TYPE_POST_APPLICATION = "post_application";
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

const {
  normalizeTrackKey,
  getTrackLabel,
  normalizeTrackKeys,
  formatTrackLabels,
  createEmptyTrackMap,
  createEmptyTrackRoleMap,
  normalizeTrackMap,
  normalizeTrackRoleMap,
} = createTrackStateUtils({
  defaultTrackKey: DEFAULT_TRACK_KEY,
  normalizeTrackAlias,
  getApplicationTracks,
  getApplicationTrackKeys,
  getTrackLookupByKey,
  isSnowflake,
  parseRoleIdList,
});

const {
  ensureTrackSettingsContainers,
  upsertCustomTrackInState,
  autoRegisterTracksFromFormRow,
} = createTrackAutoManager({
  setRuntimeCustomTracks,
  normalizeTrackMap,
  normalizeTrackRoleMap,
  normalizeCustomTrackDefinition,
  parseTrackAliasInput,
  getApplicationTracks,
  buildTrackAliasLookup,
  getTrackLabel,
  normalizeTrackKey,
});
const {
  formatJobId,
  parseJobIdSequence,
  normalizeJobIdForLookup,
  normalizeApplicationIdForLookup,
  sortPostJobsInPlace,
  getTrackApplicationIdPrefix,
  buildApplicationId,
  getApplicationDisplayId,
} = createApplicationIdUtils({
  jobIdPattern: JOB_ID_PATTERN,
  defaultTrackKey: DEFAULT_TRACK_KEY,
  normalizeTrackKey,
  getTrackLabel,
});

function normalizeCell(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function upsertCustomTrack({ name, key, aliases }) {
  const state = readState();
  const result = upsertCustomTrackInState(state, { name, key, aliases });
  writeState(state);
  return result;
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
      bugChannelId: null,
      suggestionsChannelId: null,
      approvedRoles: createEmptyTrackRoleMap(),
      acceptAnnounceChannelId: null,
      acceptAnnounceTemplate: null,
      denyDmTemplate: null,
      customTracks: getCustomTracksSnapshot(),
    },
  };
}

function readState() {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    const legacySettings = parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : {};
    const normalizedCustomTracks = setRuntimeCustomTracks(legacySettings.customTracks);
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

    const normalizedChannels = normalizeTrackMap(legacySettings.channels);
    const normalizedApprovedRoles = normalizeTrackRoleMap(legacySettings.approvedRoles);
    if (isSnowflake(legacySettings.channelId) && !normalizedChannels[DEFAULT_TRACK_KEY]) {
      normalizedChannels[DEFAULT_TRACK_KEY] = legacySettings.channelId;
    }
    if (
      isSnowflake(legacySettings.approvedRoleId) &&
      normalizedApprovedRoles[DEFAULT_TRACK_KEY].length === 0
    ) {
      normalizedApprovedRoles[DEFAULT_TRACK_KEY] = [legacySettings.approvedRoleId];
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
        bugChannelId: isSnowflake(legacySettings.bugChannelId)
          ? legacySettings.bugChannelId
          : null,
        suggestionsChannelId: isSnowflake(legacySettings.suggestionsChannelId)
          ? legacySettings.suggestionsChannelId
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
        customTracks: normalizedCustomTracks,
      },
    };
  } catch {
    setRuntimeCustomTracks([]);
    return defaultState();
  }
}

function writeState(state) {
  const serialized = JSON.stringify(state, null, 2);
  const writeToPath = (stateFilePath) => {
    const stateDir = path.dirname(path.resolve(stateFilePath));
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(stateFilePath, serialized);
  };

  try {
    writeToPath(config.stateFile);
  } catch (err) {
    if (!isStateFilePermissionError(err) || !switchStateFileToWritableFallback()) {
      throw err;
    }
    writeToPath(config.stateFile);
  }
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

const {
  getEnvChannelIdForTrack,
  getEnvApprovedRoleIdsForTrack,
  getActiveChannelIdFromState,
  getActiveChannelId,
  getActiveChannelMap,
  getAnyActiveChannelId,
  getTrackKeyForChannelId,
  hasAnyActivePostChannelConfigured,
  setActiveChannel,
  getActiveLogsChannelId,
  setActiveLogsChannel,
  getActiveBugChannelId,
  setActiveBugChannel,
  getActiveSuggestionsChannelId,
  setActiveSuggestionsChannel,
  getActiveAcceptAnnounceChannelId,
  setActiveAcceptAnnounceChannel,
  getActiveAcceptAnnounceTemplate,
  setActiveAcceptAnnounceTemplate,
  getActiveDenyDmTemplate,
  setActiveDenyDmTemplate,
  getActiveApprovedRoleMap,
  getActiveApprovedRoleIdsFromState,
  getActiveApprovedRoleIds,
  setActiveApprovedRoles,
} = createChannelSettingsAccessors({
  config,
  defaultTrackKey: DEFAULT_TRACK_KEY,
  baseTrackEnvOverrides: BASE_TRACK_ENV_OVERRIDES,
  defaultAcceptAnnounceTemplate: DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE,
  defaultDenyDmTemplate: DEFAULT_DENY_DM_TEMPLATE,
  readState,
  writeState,
  normalizeTrackKey,
  normalizeTrackMap,
  normalizeTrackRoleMap,
  parseRoleIdList,
  isSnowflake,
  getApplicationTrackKeys,
});

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
  function resolveUniqueMatch(matches) {
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

  function resolveByApplicationId(state, rawApplicationId) {
    const needle = normalizeApplicationIdForLookup(rawApplicationId);
    if (!needle) {
      return null;
    }
    const matches = [];
    for (const [messageId, application] of Object.entries(state.applications || {})) {
      const candidate = normalizeApplicationIdForLookup(
        getApplicationDisplayId(application, messageId)
      );
      if (candidate === needle) {
        matches.push({ messageId, application });
      }
    }
    return resolveUniqueMatch(matches);
  }

  function resolveByJobId(state, rawJobId) {
    const needle = normalizeJobIdForLookup(rawJobId);
    if (!needle) {
      return null;
    }
    const matches = [];
    for (const [messageId, application] of Object.entries(state.applications || {})) {
      if (normalizeJobIdForLookup(application?.jobId) === needle) {
        matches.push({ messageId, application });
      }
    }
    return resolveUniqueMatch(matches);
  }

  const explicitMessageId = interaction.options.getString("message_id");
  if (explicitMessageId) {
    const trimmedMessageId = explicitMessageId.trim();
    if (isSnowflake(trimmedMessageId)) {
      return trimmedMessageId;
    }

    const state = readState();
    const compatibilityMatch =
      resolveByApplicationId(state, trimmedMessageId) ||
      resolveByJobId(state, trimmedMessageId);
    return compatibilityMatch;
  }

  const explicitApplicationId = interaction.options.getString("application_id");
  if (explicitApplicationId) {
    const state = readState();
    return resolveByApplicationId(state, explicitApplicationId);
  }

  const explicitJobId = interaction.options.getString("job_id");
  if (explicitJobId) {
    const state = readState();
    return resolveByJobId(state, explicitJobId);
  }

  if (interaction.channel && interaction.channel.type === ChannelType.PublicThread) {
    const state = readState();
    return state.threads[interaction.channel.id] || null;
  }

  return null;
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

const {
  sanitizeThreadName,
  makeApplicationContent,
  inferApplicantDiscordValue,
  extractDiscordUserId,
  normalizeDiscordLookupQuery,
  resolveApplicantDiscordUser,
  makeApplicationPostContent,
  isAnsweredValue,
  extractAnsweredFields,
  sendDebugDm,
  inferApplicantName,
  detectTracksFromText,
  inferApplicationTracks,
  inferApplicationTrack,
  extractCellByHeaderHints,
  buildResponseKey,
  extractSubmittedFieldValue,
  buildResponseKeyFromApplication,
  requiredVotesCount,
  allocateNextJobId,
  buildTrackedRowSet,
  buildTrackedResponseKeySet,
  createPostJob,
} = createApplicationFormUtils({
  client,
  getTrackLabel,
  toCodeBlock,
  splitMessageByLength,
  getApplicationTracks,
  normalizeTrackKeys,
  defaultTrackKey: DEFAULT_TRACK_KEY,
  formatJobId,
  jobTypePostApplication: JOB_TYPE_POST_APPLICATION,
  normalizeCell,
});

const {
  buildDebugReport,
  runDebugPostTest,
  formatDecisionLabel,
  relayFeedbackCommand,
  runDebugDecisionTest,
} = createDebugAndFeedbackUtils({
  client,
  config,
  REST,
  Routes,
  getActiveChannelMap,
  getActiveApprovedRoleMap,
  getApplicationTrackKeys,
  getTrackLabel,
  getActiveAcceptAnnounceChannelId,
  requiredChannelPermissions: REQUIRED_CHANNEL_PERMISSIONS,
  normalizeTrackKey,
  getTrackKeyForChannelId,
  defaultTrackKey: DEFAULT_TRACK_KEY,
  getActiveChannelId,
  sendChannelMessage,
  addReaction,
  createThread,
  acceptEmoji: ACCEPT_EMOJI,
  denyEmoji: DENY_EMOJI,
  makeMessageUrl,
  isSnowflake,
  grantApprovedRoleOnAcceptance,
  sendDeniedApplicationDm,
  resolveMessageIdForCommand,
  statusAccepted: STATUS_ACCEPTED,
  statusDenied: STATUS_DENIED,
  statusPending: STATUS_PENDING,
  getTrackApplicationIdPrefix,
  finalizeApplication,
  readState,
  getApplicationDisplayId,
  channelTypeGuildText: ChannelType.GuildText,
});

const { processQueuedPostJobs, pollOnce } = createPollingPipeline({
  client,
  readState,
  writeState,
  inferApplicationTracks,
  normalizeTrackKeys,
  getActiveChannelId,
  getTrackLabel,
  inferApplicantName,
  resolveApplicantDiscordUser,
  buildApplicationId,
  makeApplicationPostContent,
  sendChannelMessage,
  withRateLimitRetry,
  addReaction,
  createThread,
  extractAnsweredFields,
  buildResponseKey,
  buildResponseKeyFromApplication,
  statusPending: STATUS_PENDING,
  acceptEmoji: ACCEPT_EMOJI,
  denyEmoji: DENY_EMOJI,
  formatTrackLabels,
  sortPostJobsInPlace,
  hasAnyActivePostChannelConfigured,
  readAllResponses,
  buildTrackedResponseKeySet,
  buildTrackedRowSet,
  autoRegisterTracksFromFormRow,
  createPostJob,
});

const {
  buildSlashCommands,
  registerSlashCommands,
  registerSlashCommandsForGuild,
  auditBotPermissions,
} = createSlashCommandLifecycle({
  config,
  client,
  REST,
  Routes,
  SlashCommandBuilder,
  baseSetChannelTrackOptions: BASE_SETCHANNEL_TRACK_OPTIONS,
  debugModes: {
    report: DEBUG_MODE_REPORT,
    post_test: DEBUG_MODE_POST_TEST,
    accept_test: DEBUG_MODE_ACCEPT_TEST,
    deny_test: DEBUG_MODE_DENY_TEST,
  },
  isSnowflake,
  getAnyActiveChannelId,
  getActiveChannelMap,
  getApplicationTrackKeys,
  getTrackLabel,
  requiredChannelPermissions: REQUIRED_CHANNEL_PERMISSIONS,
  requiredGuildPermissions: REQUIRED_GUILD_PERMISSIONS,
});

const onInteractionCreate = createInteractionCommandHandler({
  PermissionsBitField,
  ChannelType,
  relayFeedbackCommand,
  getActiveBugChannelId,
  getActiveSuggestionsChannelId,
  getApplicationTracks,
  getCustomTracksSnapshot,
  upsertCustomTrack,
  postConfigurationLog,
  userDisplayName,
  debugModeReport: DEBUG_MODE_REPORT,
  debugModePostTest: DEBUG_MODE_POST_TEST,
  debugModeAcceptTest: DEBUG_MODE_ACCEPT_TEST,
  debugModeDenyTest: DEBUG_MODE_DENY_TEST,
  buildDebugReport,
  runDebugPostTest,
  runDebugDecisionTest,
  sendDebugDm,
  formatDecisionLabel,
  statusAccepted: STATUS_ACCEPTED,
  statusDenied: STATUS_DENIED,
  setActiveDenyDmTemplate,
  setActiveAcceptAnnounceChannel,
  setActiveAcceptAnnounceTemplate,
  getActiveAcceptAnnounceChannelId,
  sendChannelMessage,
  parseRoleIdList,
  setActiveApprovedRoles,
  normalizeTrackKey,
  getTrackLabel,
  baseSetChannelTrackOptions: BASE_SETCHANNEL_TRACK_OPTIONS,
  getActiveChannelMap,
  isSnowflake,
  defaultTrackKey: DEFAULT_TRACK_KEY,
  getActiveLogsChannelId,
  getActiveBugChannelIdForSetChannel: getActiveBugChannelId,
  getActiveSuggestionsChannelIdForSetChannel: getActiveSuggestionsChannelId,
  getApplicationTrackKeys,
  setActiveChannel,
  setActiveLogsChannel,
  setActiveBugChannel,
  setActiveSuggestionsChannel,
  readState,
  processQueuedPostJobs,
  auditBotPermissions,
  logControlCommand,
  resolveMessageIdForCommand,
  finalizeApplication,
  getTrackKeyForChannelId,
  getActiveChannelId,
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

client.on("interactionCreate", onInteractionCreate);

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
