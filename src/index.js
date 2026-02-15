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
const { createDynamicMessageSystem } = require("./lib/dynamicMessageSystem");
const { loadStartupConfig } = require("./lib/startupConfig");
const { createStructuredLogger, serializeError } = require("./lib/structuredLogger");
const {
  toCodeBlock,
  applyTemplatePlaceholders,
  splitMessageByLength,
  sleep,
  getRetryAfterMsFromBody,
  withRateLimitRetry,
} = require("./lib/messageAndRetryUtils");

dotenv.config();
const logger = createStructuredLogger({
  baseContext: {
    service: "taq-event-team-bot",
    pid: process.pid,
  },
});
const startupConfig = loadStartupConfig({
  env: process.env,
  cwd: process.cwd(),
});
if (startupConfig.errors.length > 0) {
  for (const message of startupConfig.errors) {
    logger.error("startup_config_invalid", message);
  }
  process.exit(1);
}
for (const message of startupConfig.warnings) {
  logger.warn("startup_config_warning", message);
}
const config = startupConfig.config;
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
const DEFAULT_VOTE_RULE = Object.freeze({
  numerator: 2,
  denominator: 3,
  minimumVotes: 1,
});
const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  enabled: true,
  thresholdHours: Number.isFinite(config.reminderThresholdHours) &&
      config.reminderThresholdHours > 0
    ? config.reminderThresholdHours
    : 24,
  repeatHours: Number.isFinite(config.reminderRepeatHours) && config.reminderRepeatHours > 0
    ? config.reminderRepeatHours
    : 12,
});
const DEFAULT_DAILY_DIGEST_SETTINGS = Object.freeze({
  enabled: config.dailyDigestEnabled !== false,
  hourUtc:
    Number.isInteger(config.dailyDigestHourUtc) &&
    config.dailyDigestHourUtc >= 0 &&
    config.dailyDigestHourUtc <= 23
      ? config.dailyDigestHourUtc
      : 15,
  lastDigestDate: null,
});

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

function parseUserIdList(value) {
  const out = [];
  const seen = new Set();
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [value];

  for (const rawItem of source) {
    const userId = String(rawItem || "").trim();
    if (!isSnowflake(userId) || seen.has(userId)) {
      continue;
    }
    seen.add(userId);
    out.push(userId);
  }

  return out;
}

function clampNumber(value, { min, max, fallback }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (Number.isFinite(min) && numeric < min) {
    return fallback;
  }
  if (Number.isFinite(max) && numeric > max) {
    return fallback;
  }
  return numeric;
}

function clampInteger(value, { min, max, fallback }) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return fallback;
  }
  if (Number.isInteger(min) && numeric < min) {
    return fallback;
  }
  if (Number.isInteger(max) && numeric > max) {
    return fallback;
  }
  return numeric;
}

function normalizeVoteRule(rawRule) {
  const numerator = clampInteger(rawRule?.numerator, {
    min: 1,
    max: 20,
    fallback: DEFAULT_VOTE_RULE.numerator,
  });
  const denominator = clampInteger(rawRule?.denominator, {
    min: 1,
    max: 20,
    fallback: DEFAULT_VOTE_RULE.denominator,
  });
  const minimumVotes = clampInteger(rawRule?.minimumVotes, {
    min: 1,
    max: 200,
    fallback: DEFAULT_VOTE_RULE.minimumVotes,
  });

  return {
    numerator,
    denominator: denominator < numerator ? numerator : denominator,
    minimumVotes,
  };
}

function createEmptyTrackVoteRuleMap() {
  return Object.fromEntries(
    getApplicationTrackKeys().map((trackKey) => [trackKey, normalizeVoteRule(null)])
  );
}

function normalizeTrackVoteRuleMap(rawMap) {
  const normalized = createEmptyTrackVoteRuleMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key) {
      continue;
    }
    normalized[key] = normalizeVoteRule(rawValue);
  }

  return normalized;
}

function createEmptyTrackReviewerMap() {
  return Object.fromEntries(
    getApplicationTrackKeys().map((trackKey) => [
      trackKey,
      { roleIds: [], userIds: [], rotationIndex: 0 },
    ])
  );
}

function normalizeTrackReviewerMap(rawMap) {
  const normalized = createEmptyTrackReviewerMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key || !rawValue || typeof rawValue !== "object") {
      continue;
    }

    normalized[key] = {
      roleIds: parseRoleIdList(rawValue.roleIds),
      userIds: parseUserIdList(rawValue.userIds),
      rotationIndex: clampInteger(rawValue.rotationIndex, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        fallback: 0,
      }),
    };
  }

  return normalized;
}

function normalizeReminderSettings(rawReminder) {
  const source = rawReminder && typeof rawReminder === "object" ? rawReminder : {};
  return {
    enabled: source.enabled !== false,
    thresholdHours: clampNumber(source.thresholdHours, {
      min: 0.25,
      max: 720,
      fallback: DEFAULT_REMINDER_SETTINGS.thresholdHours,
    }),
    repeatHours: clampNumber(source.repeatHours, {
      min: 0.25,
      max: 720,
      fallback: DEFAULT_REMINDER_SETTINGS.repeatHours,
    }),
  };
}

function normalizeDailyDigestSettings(rawDigest) {
  const source = rawDigest && typeof rawDigest === "object" ? rawDigest : {};
  return {
    enabled: source.enabled !== false,
    hourUtc: clampInteger(source.hourUtc, {
      min: 0,
      max: 23,
      fallback: DEFAULT_DAILY_DIGEST_SETTINGS.hourUtc,
    }),
    lastDigestDate:
      typeof source.lastDigestDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.lastDigestDate)
        ? source.lastDigestDate
        : null,
  };
}

function ensureExtendedSettingsContainers(state) {
  const settings = ensureTrackSettingsContainers(state);
  settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  settings.reminders = normalizeReminderSettings(settings.reminders);
  settings.dailyDigest = normalizeDailyDigestSettings(settings.dailyDigest);
  return settings;
}

function parseReviewerMentionInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return {
      roleIds: [],
      userIds: [],
    };
  }

  const roleIds = [];
  const userIds = [];
  const seenRoles = new Set();
  const seenUsers = new Set();
  const tokens = raw.split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const roleMatch = /^<@&(\d{17,20})>$/.exec(token) || /^role:(\d{17,20})$/i.exec(token);
    if (roleMatch) {
      const roleId = roleMatch[1];
      if (!seenRoles.has(roleId)) {
        seenRoles.add(roleId);
        roleIds.push(roleId);
      }
      continue;
    }

    const userMatch =
      /^<@!?(\d{17,20})>$/.exec(token) ||
      /^user:(\d{17,20})$/i.exec(token) ||
      /^(\d{17,20})$/.exec(token);
    if (userMatch) {
      const userId = userMatch[1];
      if (!seenUsers.has(userId)) {
        seenUsers.add(userId);
        userIds.push(userId);
      }
    }
  }

  return {
    roleIds,
    userIds,
  };
}

function getActiveVoteRule(trackKey) {
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  return normalizeVoteRule(settings.voteRules[normalizedTrack]);
}

function upsertCustomTrack({ name, key, aliases }) {
  const state = readState();
  ensureExtendedSettingsContainers(state);
  const result = upsertCustomTrackInState(state, { name, key, aliases });
  ensureExtendedSettingsContainers(state);
  writeState(state);
  return result;
}

function editCustomTrack({ track, name, aliases }) {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const normalizedTrack = normalizeTrackKey(track);
  if (!normalizedTrack) {
    throw new Error("Unknown track. Use `/track list` to view tracks.");
  }

  const customTracks = Array.isArray(settings.customTracks) ? settings.customTracks : [];
  const existing = customTracks.find((item) => item.key === normalizedTrack);
  if (!existing) {
    throw new Error("Only custom tracks can be edited.");
  }

  const nextName = String(name || existing.label || "").trim() || existing.label;
  const aliasSource = aliases === undefined ? existing.aliases : aliases;
  const result = upsertCustomTrackInState(state, {
    name: nextName,
    key: existing.key,
    aliases: aliasSource,
  });
  ensureExtendedSettingsContainers(state);
  writeState(state);
  return result;
}

function hasTrackUsageInState(state, trackKey) {
  for (const application of Object.values(state.applications || {})) {
    if (String(application?.trackKey || "").toLowerCase() === String(trackKey).toLowerCase()) {
      return true;
    }
  }

  for (const job of Array.isArray(state.postJobs) ? state.postJobs : []) {
    const keys = normalizeTrackKeys(job?.trackKeys || job?.trackKey, {
      allowEmpty: true,
      fallback: [],
    });
    if (keys.includes(trackKey)) {
      return true;
    }
  }

  return false;
}

function removeCustomTrack(track) {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const normalizedTrack = normalizeTrackKey(track);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const customTracks = Array.isArray(settings.customTracks) ? settings.customTracks : [];
  const existing = customTracks.find((item) => item.key === normalizedTrack);
  if (!existing) {
    throw new Error("Only custom tracks can be removed.");
  }

  if (hasTrackUsageInState(state, normalizedTrack)) {
    throw new Error(
      "Cannot remove this track because existing applications/jobs still reference it."
    );
  }

  settings.customTracks = setRuntimeCustomTracks(
    customTracks.filter((item) => item.key !== normalizedTrack)
  );
  settings.channels = normalizeTrackMap(settings.channels);
  settings.approvedRoles = normalizeTrackRoleMap(settings.approvedRoles);
  settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  writeState(state);

  return existing;
}

function setTrackVoteRule(trackKey, rawRule) {
  const normalizedTrack = normalizeTrackKey(trackKey);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const voteRule = normalizeVoteRule(rawRule);
  settings.voteRules[normalizedTrack] = voteRule;
  writeState(state);
  return {
    trackKey: normalizedTrack,
    trackLabel: getTrackLabel(normalizedTrack),
    voteRule,
  };
}

function setReminderConfiguration({ enabled, thresholdHours, repeatHours }) {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const next = normalizeReminderSettings({
    enabled: enabled === undefined ? settings.reminders.enabled : enabled,
    thresholdHours:
      thresholdHours === undefined ? settings.reminders.thresholdHours : thresholdHours,
    repeatHours: repeatHours === undefined ? settings.reminders.repeatHours : repeatHours,
  });
  settings.reminders = next;
  writeState(state);
  return next;
}

function setDailyDigestConfiguration({ enabled, hourUtc }) {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const next = normalizeDailyDigestSettings({
    enabled: enabled === undefined ? settings.dailyDigest.enabled : enabled,
    hourUtc: hourUtc === undefined ? settings.dailyDigest.hourUtc : hourUtc,
    lastDigestDate: settings.dailyDigest.lastDigestDate,
  });
  settings.dailyDigest = next;
  writeState(state);
  return next;
}

function setTrackReviewerMentions(trackKey, mentionInput) {
  const normalizedTrack = normalizeTrackKey(trackKey);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const raw = String(mentionInput || "").trim();
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (/^clear$/i.test(raw)) {
    settings.reviewerMentions[normalizedTrack] = {
      roleIds: [],
      userIds: [],
      rotationIndex: 0,
    };
    writeState(state);
    return settings.reviewerMentions[normalizedTrack];
  }

  const parsed = parseReviewerMentionInput(raw);
  if (parsed.roleIds.length === 0 && parsed.userIds.length === 0) {
    throw new Error(
      "No valid reviewers found. Provide @user/@role mentions, raw user IDs, or `role:<id>`."
    );
  }

  settings.reviewerMentions[normalizedTrack] = {
    roleIds: parsed.roleIds,
    userIds: parsed.userIds,
    rotationIndex: 0,
  };
  writeState(state);
  return settings.reviewerMentions[normalizedTrack];
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
      voteRules: createEmptyTrackVoteRuleMap(),
      reviewerMentions: createEmptyTrackReviewerMap(),
      reminders: normalizeReminderSettings(null),
      dailyDigest: normalizeDailyDigestSettings(null),
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

    const normalizedApplications = {};
    if (parsed.applications && typeof parsed.applications === "object") {
      for (const [messageId, application] of Object.entries(parsed.applications)) {
        if (!application || typeof application !== "object") {
          continue;
        }
        const rawTrackKey = String(application.trackKey || "").trim();
        const normalizedTrackKey = normalizeTrackKey(rawTrackKey) || rawTrackKey || DEFAULT_TRACK_KEY;
        normalizedApplications[messageId] = {
          ...application,
          trackKey: normalizedTrackKey,
          status:
            application.status === STATUS_ACCEPTED || application.status === STATUS_DENIED
              ? application.status
              : STATUS_PENDING,
          applicantUserId: isSnowflake(application.applicantUserId)
            ? application.applicantUserId
            : null,
          duplicateSignals: Array.isArray(application.duplicateSignals)
            ? application.duplicateSignals
            : [],
          reminderCount: clampInteger(application.reminderCount, {
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            fallback: 0,
          }),
          lastReminderAt:
            typeof application.lastReminderAt === "string" ? application.lastReminderAt : null,
          submittedFieldsFingerprint:
            typeof application.submittedFieldsFingerprint === "string"
              ? application.submittedFieldsFingerprint
              : null,
        };
      }
    }

    const normalizedState = {
      lastRow: typeof parsed.lastRow === "number" ? parsed.lastRow : 1,
      applications: normalizedApplications,
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
        voteRules: normalizeTrackVoteRuleMap(legacySettings.voteRules),
        reviewerMentions: normalizeTrackReviewerMap(legacySettings.reviewerMentions),
        reminders: normalizeReminderSettings(legacySettings.reminders),
        dailyDigest: normalizeDailyDigestSettings(legacySettings.dailyDigest),
      },
    };
    ensureExtendedSettingsContainers(normalizedState);
    return normalizedState;
  } catch {
    setRuntimeCustomTracks([]);
    return defaultState();
  }
}

function writeState(state) {
  ensureExtendedSettingsContainers(state);
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

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSubmittedFieldsFingerprintFromLines(submittedFields) {
  return (Array.isArray(submittedFields) ? submittedFields : [])
    .map((line) => normalizeComparableText(line))
    .filter(Boolean)
    .join("|");
}

function formatVoteRule(rule) {
  const normalized = normalizeVoteRule(rule);
  return `${normalized.numerator}/${normalized.denominator} (min ${normalized.minimumVotes})`;
}

function computeVoteThreshold(eligibleCount, trackKey) {
  const rule = getActiveVoteRule(trackKey);
  const ratioThreshold = Math.ceil((eligibleCount * rule.numerator) / rule.denominator);
  const threshold = Math.max(rule.minimumVotes, ratioThreshold);
  return {
    rule,
    ratioThreshold,
    threshold,
  };
}

function formatDurationHours(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0h";
  }
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  if (minutes <= 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function summarizeReviewerMentions(configEntry) {
  const roleMentions = parseRoleIdList(configEntry?.roleIds).map((id) => `<@&${id}>`);
  const userMentions = parseUserIdList(configEntry?.userIds).map((id) => `<@${id}>`);
  const combined = [...userMentions, ...roleMentions];
  return combined.length > 0 ? combined.join(", ") : "none";
}

function getReviewerMentionsForTrackFromState(state, trackKey) {
  const settings = ensureExtendedSettingsContainers(state);
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  return settings.reviewerMentions[normalizedTrack] || {
    roleIds: [],
    userIds: [],
    rotationIndex: 0,
  };
}

function getReviewerAllowedMentions(configEntry) {
  const roleIds = parseRoleIdList(configEntry?.roleIds);
  const userIds = parseUserIdList(configEntry?.userIds);
  return {
    parse: [],
    roles: roleIds,
    users: userIds,
  };
}

function formatUtcDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoTimeMs(value) {
  if (typeof value !== "string") {
    return NaN;
  }
  return Date.parse(value);
}

function buildDashboardMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const nowMs = Date.now();
  const trackKeys = getApplicationTrackKeys();
  const header = [
    "📊 **Application Dashboard**",
    `Generated: ${new Date().toISOString()}`,
  ];

  const lines = [];
  for (const trackKey of trackKeys) {
    const trackLabel = getTrackLabel(trackKey);
    const apps = Object.values(state.applications || {}).filter(
      (application) => String(application?.trackKey || "").toLowerCase() === trackKey
    );
    const pending = apps.filter((application) => application.status === STATUS_PENDING);
    const accepted = apps.filter((application) => application.status === STATUS_ACCEPTED);
    const denied = apps.filter((application) => application.status === STATUS_DENIED);

    let oldestPendingAge = "n/a";
    if (pending.length > 0) {
      const oldestPendingMs = Math.min(
        ...pending
          .map((application) => parseIsoTimeMs(application.createdAt))
          .filter((value) => Number.isFinite(value))
      );
      if (Number.isFinite(oldestPendingMs)) {
        oldestPendingAge = formatDurationHours(nowMs - oldestPendingMs);
      }
    }

    const voteRule = settings.voteRules[trackKey] || DEFAULT_VOTE_RULE;
    lines.push(
      [
        `**${trackLabel}**`,
        `pending=${pending.length}`,
        `accepted=${accepted.length}`,
        `denied=${denied.length}`,
        `oldest_pending=${oldestPendingAge}`,
        `vote_rule=${formatVoteRule(voteRule)}`,
      ].join(" | ")
    );
  }

  if (lines.length === 0) {
    lines.push("No tracks configured.");
  }

  return [...header, ...lines].join("\n");
}

function buildSettingsMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const lines = [
    "⚙️ **Current Settings**",
    `Reminders: ${
      settings.reminders.enabled
        ? `enabled (threshold=${settings.reminders.thresholdHours}h, repeat=${settings.reminders.repeatHours}h)`
        : "disabled"
    }`,
    `Daily Digest: ${
      settings.dailyDigest.enabled
        ? `enabled at ${settings.dailyDigest.hourUtc}:00 UTC (last=${settings.dailyDigest.lastDigestDate || "never"})`
        : "disabled"
    }`,
  ];

  for (const trackKey of getApplicationTrackKeys()) {
    const trackLabel = getTrackLabel(trackKey);
    const voteRule = settings.voteRules[trackKey] || DEFAULT_VOTE_RULE;
    const reviewers = settings.reviewerMentions[trackKey] || {
      roleIds: [],
      userIds: [],
      rotationIndex: 0,
    };
    lines.push(
      `${trackLabel}: vote=${formatVoteRule(voteRule)} | reviewers=${summarizeReviewerMentions(reviewers)}`
    );
  }

  return lines.join("\n");
}

function stripCodeFence(raw) {
  const text = String(raw || "").trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) {
    return fenced[1];
  }
  return text;
}

function exportAdminConfig() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      customTracks: settings.customTracks,
      channels: settings.channels,
      logChannelId: settings.logChannelId || null,
      bugChannelId: settings.bugChannelId || null,
      suggestionsChannelId: settings.suggestionsChannelId || null,
      approvedRoles: settings.approvedRoles,
      acceptAnnounceChannelId: settings.acceptAnnounceChannelId || null,
      acceptAnnounceTemplate: settings.acceptAnnounceTemplate || null,
      denyDmTemplate: settings.denyDmTemplate || null,
      voteRules: settings.voteRules,
      reviewerMentions: settings.reviewerMentions,
      reminders: settings.reminders,
      dailyDigest: settings.dailyDigest,
    },
  };
  return JSON.stringify(payload, null, 2);
}

function importAdminConfig(rawJson) {
  const stripped = stripCodeFence(rawJson);
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  const settingsPayload = parsed?.settings && typeof parsed.settings === "object"
    ? parsed.settings
    : parsed;
  if (!settingsPayload || typeof settingsPayload !== "object") {
    throw new Error("JSON payload must be an object or `{ settings: { ... } }`.");
  }

  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "customTracks")) {
    settings.customTracks = setRuntimeCustomTracks(settingsPayload.customTracks);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "channels")) {
    settings.channels = normalizeTrackMap(settingsPayload.channels);
  } else {
    settings.channels = normalizeTrackMap(settings.channels);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "approvedRoles")) {
    settings.approvedRoles = normalizeTrackRoleMap(settingsPayload.approvedRoles);
  } else {
    settings.approvedRoles = normalizeTrackRoleMap(settings.approvedRoles);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "voteRules")) {
    settings.voteRules = normalizeTrackVoteRuleMap(settingsPayload.voteRules);
  } else {
    settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "reviewerMentions")) {
    settings.reviewerMentions = normalizeTrackReviewerMap(settingsPayload.reviewerMentions);
  } else {
    settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "reminders")) {
    settings.reminders = normalizeReminderSettings(settingsPayload.reminders);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "dailyDigest")) {
    settings.dailyDigest = normalizeDailyDigestSettings(settingsPayload.dailyDigest);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "logChannelId")) {
    settings.logChannelId = isSnowflake(settingsPayload.logChannelId)
      ? settingsPayload.logChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "bugChannelId")) {
    settings.bugChannelId = isSnowflake(settingsPayload.bugChannelId)
      ? settingsPayload.bugChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "suggestionsChannelId")) {
    settings.suggestionsChannelId = isSnowflake(settingsPayload.suggestionsChannelId)
      ? settingsPayload.suggestionsChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "acceptAnnounceChannelId")) {
    settings.acceptAnnounceChannelId = isSnowflake(settingsPayload.acceptAnnounceChannelId)
      ? settingsPayload.acceptAnnounceChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "acceptAnnounceTemplate")) {
    settings.acceptAnnounceTemplate =
      typeof settingsPayload.acceptAnnounceTemplate === "string" &&
      settingsPayload.acceptAnnounceTemplate.trim()
        ? settingsPayload.acceptAnnounceTemplate
        : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "denyDmTemplate")) {
    settings.denyDmTemplate =
      typeof settingsPayload.denyDmTemplate === "string" &&
      settingsPayload.denyDmTemplate.trim()
        ? settingsPayload.denyDmTemplate
        : null;
  }

  ensureExtendedSettingsContainers(state);
  writeState(state);

  return {
    trackCount: getApplicationTrackKeys().length,
    customTrackCount: getCustomTracksSnapshot().length,
  };
}

function findDuplicateApplications({
  state,
  trackKey,
  responseKey,
  submittedFieldsFingerprint,
  applicantUserId,
  rowIndex,
  jobId,
}) {
  const lookbackDays = clampNumber(config.duplicateLookbackDays, {
    min: 1,
    max: 3650,
    fallback: 60,
  });
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const normalizedTrackKey = normalizeTrackKey(trackKey) || trackKey;
  const matches = [];

  for (const [messageId, application] of Object.entries(state.applications || {})) {
    if (!application || typeof application !== "object") {
      continue;
    }

    if (String(application.jobId || "") === String(jobId || "")) {
      continue;
    }
    if (Number.isInteger(rowIndex) && Number(application.rowIndex) === rowIndex) {
      continue;
    }

    const createdAtMs = parseIsoTimeMs(application.createdAt);
    if (Number.isFinite(createdAtMs) && nowMs - createdAtMs > lookbackMs) {
      continue;
    }

    const reasons = [];
    if (applicantUserId && application.applicantUserId === applicantUserId) {
      reasons.push("same Discord user");
    }
    if (responseKey && application.responseKey && application.responseKey === responseKey) {
      reasons.push("same response fingerprint");
    }

    const candidateFingerprint =
      typeof application.submittedFieldsFingerprint === "string"
        ? application.submittedFieldsFingerprint
        : buildSubmittedFieldsFingerprintFromLines(application.submittedFields);
    if (
      submittedFieldsFingerprint &&
      candidateFingerprint &&
      candidateFingerprint === submittedFieldsFingerprint
    ) {
      reasons.push("same answered fields");
    }

    if (reasons.length === 0) {
      continue;
    }

    const applicationTrackKey =
      normalizeTrackKey(application.trackKey) || String(application.trackKey || "");
    matches.push({
      messageId,
      applicationId: getApplicationDisplayId(application, messageId),
      trackLabel: getTrackLabel(applicationTrackKey || normalizedTrackKey || DEFAULT_TRACK_KEY),
      status: String(application.status || STATUS_PENDING).toUpperCase(),
      reasons,
      createdAt: application.createdAt || "unknown",
    });
  }

  return matches
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);
}

async function postDuplicateWarning({
  application,
  trackLabel,
  channelId,
  threadId,
  duplicateSignals,
}) {
  const duplicates = Array.isArray(duplicateSignals) ? duplicateSignals : [];
  if (duplicates.length === 0) {
    return;
  }
  const targetChannelId = threadId || channelId;
  if (!targetChannelId) {
    return;
  }

  const lines = [
    "⚠️ **Potential Duplicate Application Detected**",
    `Track: ${trackLabel}`,
    `Application ID: \`${getApplicationDisplayId(application)}\``,
    "Possible matches:",
    ...duplicates.map((item) =>
      `- \`${item.applicationId}\` (${item.trackLabel}, ${item.status}) | ${item.reasons.join(", ")} | created ${item.createdAt}`
    ),
  ];

  await sendChannelMessage(targetChannelId, lines.join("\n"), { parse: [] });
}

async function announceReviewerAssignment({
  state,
  application,
  trackKey,
  trackLabel,
  channelId,
  threadId,
}) {
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const settings = ensureExtendedSettingsContainers(state);
  const reviewerConfig = settings.reviewerMentions[normalizedTrack];
  const roleIds = parseRoleIdList(reviewerConfig?.roleIds);
  const userIds = parseUserIdList(reviewerConfig?.userIds);
  const pool = [
    ...userIds.map((id) => ({ type: "user", id })),
    ...roleIds.map((id) => ({ type: "role", id })),
  ];
  if (pool.length === 0) {
    return;
  }

  const currentIndex = clampInteger(reviewerConfig?.rotationIndex, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  });
  const chosen = pool[currentIndex % pool.length];

  const targetChannelId = threadId || channelId;
  if (!targetChannelId) {
    return;
  }

  const mention =
    chosen.type === "role" ? `<@&${chosen.id}>` : `<@${chosen.id}>`;
  const allowedMentions = {
    parse: [],
    roles: chosen.type === "role" ? [chosen.id] : [],
    users: chosen.type === "user" ? [chosen.id] : [],
  };
  const content = [
    "🧭 **Reviewer Assignment**",
    `Track: ${trackLabel}`,
    `Application: \`${getApplicationDisplayId(application)}\``,
    `Assigned Reviewer: ${mention}`,
  ].join("\n");
  await sendChannelMessage(targetChannelId, content, allowedMentions);
  reviewerConfig.rotationIndex = (currentIndex + 1) % pool.length;
  writeState(state);
}

async function maybeSendPendingReminders() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (!settings.reminders.enabled) {
    return;
  }

  const thresholdMs = settings.reminders.thresholdHours * 60 * 60 * 1000;
  const repeatMs = settings.reminders.repeatHours * 60 * 60 * 1000;
  const nowMs = Date.now();
  let stateChanged = false;

  for (const application of Object.values(state.applications || {})) {
    if (!application || application.status !== STATUS_PENDING) {
      continue;
    }

    const createdAtMs = parseIsoTimeMs(application.createdAt);
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }
    const ageMs = nowMs - createdAtMs;
    if (ageMs < thresholdMs) {
      continue;
    }

    const lastReminderMs = parseIsoTimeMs(application.lastReminderAt);
    if (Number.isFinite(lastReminderMs) && nowMs - lastReminderMs < repeatMs) {
      continue;
    }

    const reviewerConfig = getReviewerMentionsForTrackFromState(state, application.trackKey);
    const targetChannelId = application.threadId || application.channelId;
    if (!targetChannelId) {
      continue;
    }

    const mentionSummary = summarizeReviewerMentions(reviewerConfig);
    const content = [
      "⏰ **Pending Application Reminder**",
      `Track: ${getTrackLabel(application.trackKey)}`,
      `Application ID: \`${getApplicationDisplayId(application)}\``,
      `Age: ${formatDurationHours(ageMs)}`,
      `Reviewers: ${mentionSummary}`,
    ].join("\n");
    const allowedMentions = getReviewerAllowedMentions(reviewerConfig);

    try {
      await sendChannelMessage(targetChannelId, content, allowedMentions);
      application.lastReminderAt = new Date(nowMs).toISOString();
      application.reminderCount = clampInteger(application.reminderCount, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        fallback: 0,
      }) + 1;
      stateChanged = true;
    } catch (err) {
      console.error(
        `Failed sending reminder for application ${application.messageId || "unknown"}:`,
        err.message
      );
    }
  }

  if (stateChanged) {
    writeState(state);
  }
}

async function maybeSendDailyDigest() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (!settings.dailyDigest.enabled) {
    return;
  }

  const now = new Date();
  const currentUtcHour = now.getUTCHours();
  if (currentUtcHour < settings.dailyDigest.hourUtc) {
    return;
  }

  const targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const targetDateKey = formatUtcDateKey(targetDate);
  if (settings.dailyDigest.lastDigestDate === targetDateKey) {
    return;
  }

  const trackKeys = getApplicationTrackKeys();
  const createdByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));
  const acceptedByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));
  const deniedByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));

  for (const application of Object.values(state.applications || {})) {
    const trackKey = normalizeTrackKey(application?.trackKey) || DEFAULT_TRACK_KEY;
    const createdKey = formatUtcDateKey(new Date(application?.createdAt || 0));
    const decidedKey = formatUtcDateKey(new Date(application?.decidedAt || 0));

    if (createdKey === targetDateKey && Object.prototype.hasOwnProperty.call(createdByTrack, trackKey)) {
      createdByTrack[trackKey] += 1;
    }

    if (application?.status === STATUS_ACCEPTED && decidedKey === targetDateKey) {
      if (Object.prototype.hasOwnProperty.call(acceptedByTrack, trackKey)) {
        acceptedByTrack[trackKey] += 1;
      }
    }
    if (application?.status === STATUS_DENIED && decidedKey === targetDateKey) {
      if (Object.prototype.hasOwnProperty.call(deniedByTrack, trackKey)) {
        deniedByTrack[trackKey] += 1;
      }
    }
  }

  const staleThresholdMs = settings.reminders.thresholdHours * 60 * 60 * 1000;
  const stalePending = Object.values(state.applications || {}).filter((application) => {
    if (!application || application.status !== STATUS_PENDING) {
      return false;
    }
    const createdAtMs = parseIsoTimeMs(application.createdAt);
    return Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= staleThresholdMs;
  });

  const lines = [
    `🗓️ **Daily Application Summary (${targetDateKey} UTC)**`,
  ];
  for (const trackKey of trackKeys) {
    lines.push(
      `${getTrackLabel(trackKey)}: new=${createdByTrack[trackKey]} | accepted=${acceptedByTrack[trackKey]} | denied=${deniedByTrack[trackKey]}`
    );
  }
  lines.push(`Stale Pending (>=${settings.reminders.thresholdHours}h): ${stalePending.length}`);

  const digestChannelId = getActiveLogsChannelId() || getAnyActiveChannelId();
  if (!digestChannelId) {
    return;
  }

  await sendChannelMessage(digestChannelId, lines.join("\n"), { parse: [] });
  settings.dailyDigest.lastDigestDate = targetDateKey;
  writeState(state);
}

async function postReopenUpdate(application, previousStatus, actorId, reopenReason) {
  const summaryLines = [
    "♻️ **Application Reopened**",
    `Previous Decision: ${String(previousStatus || "").toUpperCase()}`,
    `By: <@${actorId}>`,
  ];
  if (reopenReason) {
    summaryLines.push(`Reason: ${reopenReason}`);
  }
  summaryLines.push(
    "Note: prior side effects (roles, DMs, announcements) are not automatically reverted."
  );
  const summary = summaryLines.join("\n");

  try {
    const parentChannel = await client.channels.fetch(application.channelId);
    if (parentChannel && parentChannel.isTextBased()) {
      const message = await parentChannel.messages.fetch(application.messageId);
      await message.reply({ content: summary, allowedMentions: { parse: [] } });
    }
  } catch (err) {
    console.error(`Failed posting reopen notice to parent message ${application.messageId}:`, err.message);
  }

  if (application.threadId) {
    try {
      const thread = await client.channels.fetch(application.threadId);
      if (thread && thread.isTextBased()) {
        await thread.send({ content: summary, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error(`Failed posting reopen notice to thread ${application.threadId}:`, err.message);
    }
  }
}

async function reopenApplication(messageId, actorId, reopenReason = "") {
  const state = readState();
  const application = state.applications[messageId];
  if (!application) {
    return { ok: false, reason: "unknown_application" };
  }
  if (application.status === STATUS_PENDING) {
    return { ok: false, reason: "already_pending" };
  }

  const previousStatus = application.status;
  application.lastDecision = {
    status: application.status,
    decidedAt: application.decidedAt || null,
    decidedBy: application.decidedBy || null,
    decisionSource: application.decisionSource || null,
    decisionReason: application.decisionReason || null,
  };
  application.status = STATUS_PENDING;
  application.decidedAt = null;
  application.decidedBy = null;
  application.decisionSource = null;
  application.decisionReason = null;
  application.approvedRoleResult = null;
  application.acceptAnnounceResult = null;
  application.denyDmResult = null;
  application.voteContext = null;
  application.reopenedAt = new Date().toISOString();
  application.reopenedBy = actorId;
  application.reopenReason = String(reopenReason || "").trim() || null;
  application.lastReminderAt = null;
  application.reminderCount = 0;
  writeState(state);

  await postReopenUpdate(
    application,
    previousStatus,
    actorId,
    application.reopenReason
  );

  return {
    ok: true,
    previousStatus,
    application,
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
      logger.error(
        "discord_channel_not_text_based",
        "Configured channel is not text-based.",
        {
          channelId,
        }
      );
      throw new Error("Configured channel is not text-based.");
    }

    if (content && typeof content === "object" && !Array.isArray(content)) {
      const payload = {
        ...content,
      };
      if (!Object.prototype.hasOwnProperty.call(payload, "allowedMentions")) {
        payload.allowedMentions = allowedMentions;
      }
      if (typeof payload.content !== "string") {
        payload.content =
          payload.content === undefined || payload.content === null
            ? ""
            : String(payload.content);
      }
      return channel.send(payload);
    }

    return channel.send({
      content: String(content || ""),
      allowedMentions,
    });
  }, {
    logger,
    logContext: {
      channelId,
      operation: "send_message",
    },
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
      logger.warn("discord_reaction_rate_limited", "Reaction add rate limited.", {
        channelId,
        messageId,
        emoji,
        waitMs,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
      });
      await sleep(waitMs);
      continue;
    }

    logger.error("discord_reaction_failed", "Failed adding reaction.", {
      channelId,
      messageId,
      emoji,
      status: res.status,
      attempt,
      maxAttempts,
      body,
    });
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
      logger.warn("discord_thread_rate_limited", "Thread creation rate limited.", {
        channelId,
        messageId,
        waitMs,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
      });
      await sleep(waitMs);
      continue;
    }

    logger.error("discord_thread_create_failed", "Thread creation failed.", {
      channelId,
      messageId,
      status: res.status,
      attempt,
      maxAttempts,
      body,
    });
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
      `**Decision Reason:** ${application.decisionReason || "None provided"}`,
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
    reason: application.decisionReason || "",
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

async function finalizeApplication(messageId, decision, sourceLabel, actorId, context = {}) {
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
  application.decisionReason = String(context?.reason || "").trim() || null;

  const voteContext = context?.voteContext && typeof context.voteContext === "object"
    ? context.voteContext
    : null;
  let decisionReason =
    sourceLabel === "vote"
      ? `Decision reached by vote. YES ${voteContext?.yesCount ?? "?"}/${voteContext?.eligibleCount ?? "?"}, NO ${voteContext?.noCount ?? "?"}/${voteContext?.eligibleCount ?? "?"}, threshold ${voteContext?.threshold ?? "?"} using ${voteContext ? formatVoteRule(voteContext.rule) : "configured vote rule"}.`
      : `Forced by <@${actorId}> using slash command.`;
  if (application.decisionReason) {
    decisionReason = `${decisionReason}\nReviewer reason: ${application.decisionReason}`;
  }
  if (voteContext) {
    application.voteContext = voteContext;
  }

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
    const denyDmReason = application.decisionReason || decisionReason;
    const denyDmResult = await sendDeniedApplicationDm(application, denyDmReason);
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

  const voteThreshold = computeVoteThreshold(
    eligibleReviewerIds.size,
    application.trackKey
  );
  const { yesCount, noCount } = await getVoteSnapshot(message, eligibleReviewerIds);

  if (yesCount >= voteThreshold.threshold && noCount >= voteThreshold.threshold) {
    return;
  }

  if (yesCount >= voteThreshold.threshold) {
    await finalizeApplication(messageId, STATUS_ACCEPTED, "vote", client.user.id, {
      voteContext: {
        eligibleCount: eligibleReviewerIds.size,
        yesCount,
        noCount,
        threshold: voteThreshold.threshold,
        rule: voteThreshold.rule,
      },
    });
    return;
  }

  if (noCount >= voteThreshold.threshold) {
    await finalizeApplication(messageId, STATUS_DENIED, "vote", client.user.id, {
      voteContext: {
        eligibleCount: eligibleReviewerIds.size,
        yesCount,
        noCount,
        threshold: voteThreshold.threshold,
        rule: voteThreshold.rule,
      },
    });
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
const interactionLogger = logger.child({ component: "interaction_handler" });
const pipelineLogger = logger.child({ component: "polling_pipeline" });

const { buildApplicationMessagePayload, buildFeedbackMessagePayload } =
  createDynamicMessageSystem({
    toCodeBlock,
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
  buildApplicationMessagePayload,
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
  makeApplicationPostContent,
  buildFeedbackMessagePayload,
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
  withRateLimitRetry: (label, run, retryOptions = {}) =>
    withRateLimitRetry(label, run, {
      ...retryOptions,
      logger: pipelineLogger,
      logContext: {
        ...(retryOptions.logContext && typeof retryOptions.logContext === "object"
          ? retryOptions.logContext
          : {}),
        component: "polling_pipeline",
        operation: label,
      },
    }),
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
  findDuplicateApplications,
  postDuplicateWarning,
  announceReviewerAssignment,
  logger: pipelineLogger,
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
  editCustomTrack,
  removeCustomTrack,
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
  reopenApplication,
  buildDashboardMessage,
  buildSettingsMessage,
  setTrackVoteRule,
  setReminderConfiguration,
  setDailyDigestConfiguration,
  setTrackReviewerMentions,
  exportAdminConfig,
  importAdminConfig,
  formatVoteRule,
  getTrackKeyForChannelId,
  getActiveChannelId,
  logger: interactionLogger,
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
    logger.error("reaction_add_handler_failed", "Reaction add handler failed.", {
      error: err.message,
    });
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
    logger.error("reaction_remove_handler_failed", "Reaction remove handler failed.", {
      error: err.message,
    });
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
    logger.error("guild_create_setup_failed", "Failed creating logs channel in guild.", {
      guildId: guild.id,
      error: err.message,
    });
  }
});

async function main() {
  await client.login(config.botToken);
  await auditBotPermissions();
  await registerSlashCommands();

  try {
    const activeChannelId = getAnyActiveChannelId();
    if (!activeChannelId) {
      logger.info(
        "startup_no_active_channels",
        "No active application channels configured yet. Use /setchannel."
      );
    } else {
      const channel = await client.channels.fetch(activeChannelId);
      if (channel && "guild" in channel && channel.guild) {
        await ensureLogsChannel(channel.guild);
      }
    }
  } catch (err) {
    logger.error("startup_ensure_logs_channel_failed", "Failed ensuring logs channel on startup.", {
      error: err.message,
    });
  }

  logger.info("startup_bot_ready", "Bot started. Polling for Google Form responses.");
  await pollOnce().catch((err) => {
    logger.error("startup_initial_poll_failed", "Initial poll failed.", {
      error: err.message,
    });
  });
  await maybeSendPendingReminders().catch((err) => {
    logger.error("startup_initial_reminder_failed", "Initial reminder pass failed.", {
      error: err.message,
    });
  });
  await maybeSendDailyDigest().catch((err) => {
    logger.error("startup_initial_digest_failed", "Initial digest pass failed.", {
      error: err.message,
    });
  });

  setInterval(async () => {
    try {
      await pollOnce();
      await maybeSendPendingReminders();
      await maybeSendDailyDigest();
    } catch (err) {
      logger.error("poll_cycle_failed", "Poll cycle failed.", {
        error: err.message,
      });
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

      logger.error(
        "startup_retryable_failure",
        `Startup failed (${err.code || err.name || "error"}: ${err.message}). Retrying in ${Math.ceil(
          waitMs / 1000
        )}s...`,
        {
          code: err.code || null,
          name: err.name || null,
          error: err.message,
          retryAfterMs: waitMs,
        }
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
      logger.error("uncaught_exception_crashlog_written", "Uncaught exception crash log written.", {
        crashPath,
      });
    } catch (logErr) {
      logger.error(
        "uncaught_exception_crashlog_failed",
        "Failed writing uncaught exception crash log.",
        {
          error: logErr.message,
        }
      );
    }
    logger.error("uncaught_exception", "Uncaught exception.", {
      error: serializeError(err),
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      const crashPath = writeCrashLog("unhandledRejection", reason);
      logger.error("unhandled_rejection_crashlog_written", "Unhandled rejection crash log written.", {
        crashPath,
      });
    } catch (logErr) {
      logger.error(
        "unhandled_rejection_crashlog_failed",
        "Failed writing unhandled rejection crash log.",
        {
          error: logErr.message,
        }
      );
    }
    logger.error("unhandled_rejection", "Unhandled rejection.", {
      reason: serializeError(reason),
    });
    process.exit(1);
  });
}

installCrashHandlers();

bootWithRetry().catch((err) => {
  try {
    const crashPath = writeCrashLog("fatalStartup", err);
    logger.error("fatal_startup_crashlog_written", "Fatal startup crash log written.", {
      crashPath,
    });
  } catch (logErr) {
    logger.error("fatal_startup_crashlog_failed", "Failed writing fatal startup crash log.", {
      error: logErr.message,
    });
  }
  logger.error("fatal_startup_error", "Fatal startup error.", {
    error: serializeError(err),
  });
  process.exit(1);
});
