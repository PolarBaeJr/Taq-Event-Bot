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
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  botToken: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  channelId: process.env.DISCORD_CHANNEL_ID,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 30000),
  stateFile: process.env.STATE_FILE || ".bot-state.json",
  controlLogFile: process.env.CONTROL_LOG_FILE || "control-actions.log",
  logsChannelName: process.env.DISCORD_LOGS_CHANNEL_NAME || "application-logs",
  logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID,
  approvedRoleId: process.env.DISCORD_APPROVED_ROLE_ID,
  threadArchiveMinutes: Number(
    process.env.DISCORD_THREAD_AUTO_ARCHIVE_MINUTES || 10080
  ),
};

const STATUS_PENDING = "pending";
const STATUS_ACCEPTED = "accepted";
const STATUS_DENIED = "denied";
const DEBUG_MODE_REPORT = "report";
const DEBUG_MODE_POST_TEST = "post_test";

const ACCEPT_EMOJI = "✅";
const DENY_EMOJI = "❌";
const REQUIRED_CHANNEL_PERMISSIONS = [
  ["ViewChannel", PermissionsBitField.Flags.ViewChannel],
  ["ReadMessageHistory", PermissionsBitField.Flags.ReadMessageHistory],
  ["AddReactions", PermissionsBitField.Flags.AddReactions],
  ["CreatePublicThreads", PermissionsBitField.Flags.CreatePublicThreads],
  ["SendMessagesInThreads", PermissionsBitField.Flags.SendMessagesInThreads],
];
const REQUIRED_GUILD_PERMISSIONS = [
  ["ManageChannels", PermissionsBitField.Flags.ManageChannels],
];
let loggedNoChannelWarning = false;
let loggedNoWebhookWarning = false;
const WEBHOOK_URL_PATTERN = /^https:\/\/discord\.com\/api\/webhooks\/(\d+)\/([^/?\s]+)$/i;
const JOB_ID_PATTERN = /^job-(\d+)$/i;
const JOB_TYPE_POST_APPLICATION = "post_application";
const ignoredWebhookUrls = new Set();
let isProcessingPostJobs = false;

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

function defaultState() {
  return {
    lastRow: 1,
    applications: {},
    threads: {},
    controlActions: [],
    nextJobId: 1,
    postJobs: [],
    settings: {
      channelId: null,
      webhookUrl: null,
      logChannelId: null,
      approvedRoleId: null,
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

      postJobs.push({
        jobId: normalizedJobId,
        type: JOB_TYPE_POST_APPLICATION,
        rowIndex,
        headers: Array.isArray(rawJob.headers)
          ? rawJob.headers.map(normalizeCell)
          : [],
        row: Array.isArray(rawJob.row) ? rawJob.row.map(normalizeCell) : [],
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
      settings:
        parsed.settings && typeof parsed.settings === "object"
          ? {
              channelId: parsed.settings.channelId || null,
              webhookUrl: parsed.settings.webhookUrl || null,
              logChannelId: parsed.settings.logChannelId || null,
              approvedRoleId: parsed.settings.approvedRoleId || null,
            }
          : {
              channelId: null,
              webhookUrl: null,
              logChannelId: null,
              approvedRoleId: null,
            },
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function getActiveChannelId() {
  const state = readState();
  if (isSnowflake(state.settings.channelId)) {
    return state.settings.channelId;
  }
  if (isSnowflake(config.channelId)) {
    return config.channelId;
  }
  return null;
}

function getActiveWebhookUrl() {
  const state = readState();
  const candidate = state.settings.webhookUrl || config.webhookUrl || null;
  if (!candidate) {
    return null;
  }
  if (ignoredWebhookUrls.has(candidate)) {
    return null;
  }
  return candidate;
}

function setActiveChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid channel id.");
  }
  const state = readState();
  state.settings.channelId = channelId;
  writeState(state);
}

function setActiveWebhookUrl(webhookUrl) {
  const state = readState();
  state.settings.webhookUrl = webhookUrl;
  writeState(state);
  ignoredWebhookUrls.delete(webhookUrl);
}

function clearStoredWebhookUrlIfMatches(url) {
  const state = readState();
  if (state.settings.webhookUrl && state.settings.webhookUrl === url) {
    state.settings.webhookUrl = null;
    writeState(state);
    return true;
  }
  return false;
}

function parseWebhookUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  const match = WEBHOOK_URL_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  return { id: match[1], token: match[2], normalized: trimmed };
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

function getActiveApprovedRoleId() {
  const state = readState();
  if (isSnowflake(state.settings.approvedRoleId)) {
    return state.settings.approvedRoleId;
  }
  if (isSnowflake(config.approvedRoleId)) {
    return config.approvedRoleId;
  }
  return null;
}

function setActiveApprovedRole(roleId) {
  if (!isSnowflake(roleId)) {
    throw new Error("Invalid approved role id.");
  }
  const state = readState();
  state.settings.approvedRoleId = roleId;
  writeState(state);
}

function sanitizeThreadName(name) {
  return (
    name.replace(/[^\p{L}\p{N}\s\-_]/gu, "").trim().slice(0, 90) ||
    "Application Discussion"
  );
}

function makeApplicationContent(headers, row) {
  const lines = [];
  for (let i = 0; i < headers.length; i += 1) {
    const key = (headers[i] || `Field ${i + 1}`).trim();
    const value = row[i] || "(empty)";
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.join("\n");
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
  rowIndex,
  applicationId,
  applicantMention,
  applicantRawValue,
  headers,
  row,
}) {
  const lines = [`📥 **New Application** (Row ${rowIndex})`];
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

function createPostJob(state, headers, row, rowIndex) {
  return {
    jobId: allocateNextJobId(state),
    type: JOB_TYPE_POST_APPLICATION,
    rowIndex,
    headers: (Array.isArray(headers) ? headers : []).map(normalizeCell),
    row: (Array.isArray(row) ? row : []).map(normalizeCell),
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

async function sendWebhookMessage(content, allowedMentions = { parse: [] }) {
  const webhookUrl = getActiveWebhookUrl();
  if (!webhookUrl) {
    throw new Error("No webhook URL configured.");
  }

  const res = await fetch(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      allowed_mentions: allowedMentions,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook send failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function editWebhookMessage(messageId, content, allowedMentions = { parse: [] }) {
  const webhookUrl = getActiveWebhookUrl();
  if (!webhookUrl) {
    throw new Error("No webhook URL configured.");
  }
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) {
    throw new Error("Invalid webhook URL configured.");
  }

  const url = `https://discord.com/api/v10/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      allowed_mentions: allowedMentions,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook edit failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function fetchWebhookInfoByUrl(webhookUrl) {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) {
    return { ok: false, status: 0, reason: "invalid_format" };
  }

  const url = `https://discord.com/api/v10/webhooks/${parsed.id}/${parsed.token}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    return { ok: false, status: res.status, reason: "not_found_or_forbidden" };
  }

  const data = await res.json();
  return { ok: true, status: res.status, data, parsed };
}

async function verifyStartupWebhook() {
  const seen = new Set();

  while (true) {
    const candidate = getActiveWebhookUrl();
    if (!candidate) {
      console.log("No webhook configured yet. Use /setchannel to auto-create one.");
      return false;
    }

    if (seen.has(candidate)) {
      console.log("Webhook verification loop detected; stopping verification.");
      return false;
    }
    seen.add(candidate);

    const result = await fetchWebhookInfoByUrl(candidate);
    if (result.ok) {
      const webhookChannelId = result.data.channel_id || "unknown";
      console.log(`Webhook verified for channel ${webhookChannelId}.`);
      return true;
    }

    console.warn(`Configured webhook invalid (${result.reason}, status ${result.status}).`);
    ignoredWebhookUrls.add(candidate);
    const cleared = clearStoredWebhookUrlIfMatches(candidate);
    if (cleared) {
      console.log("Removed invalid stored webhook; checking fallback configuration...");
      continue;
    }

    return false;
  }
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

  return res.json();
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
    const submittedLines = Array.isArray(application.submittedFields)
      ? application.submittedFields.join("\n")
      : "_No stored field history_";
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

    const log = [
      "📚 **Application Closed (History Log)**",
      `**Decision:** ${decisionLabel}`,
      `**Applicant:** ${application.applicantName || "Unknown"}`,
      `**Row:** ${application.rowIndex || "Unknown"}`,
      `**Application ID:** ${application.applicationId || application.messageId || "Unknown"}`,
      `**Created At:** ${application.createdAt || "Unknown"}`,
      `**Decided At:** ${application.decidedAt || "Unknown"}`,
      `**Decision Source:** ${application.decisionSource || "Unknown"}`,
      `**Decided By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
      `**Approved Role Action:** ${approvedRoleNote}`,
      `**Application Message:** ${messageLink}`,
      `**Discussion Thread:** ${threadLink}`,
      "",
      "**Submitted Fields:**",
      submittedLines,
    ].join("\n");

    await logsChannel.send({ content: log, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("Failed posting closure log:", err.message);
  }
}

async function grantApprovedRoleOnAcceptance(application) {
  const approvedRoleId = getActiveApprovedRoleId();
  if (!approvedRoleId) {
    return {
      status: "skipped_no_role_configured",
      message: "No approved role configured.",
      roleId: null,
      userId: application.applicantUserId || null,
    };
  }

  if (!application.applicantUserId) {
    return {
      status: "skipped_no_user",
      message: "No applicant Discord user could be resolved from the form data.",
      roleId: approvedRoleId,
      userId: null,
    };
  }

  try {
    const channel = await client.channels.fetch(application.channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return {
        status: "failed_no_guild",
        message: "Could not resolve guild for role assignment.",
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    const guild = channel.guild;
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return {
        status: "failed_missing_permission",
        message: "Bot is missing Manage Roles permission.",
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    const role = await guild.roles.fetch(approvedRoleId);
    if (!role) {
      return {
        status: "failed_role_not_found",
        message: `Configured role ${approvedRoleId} was not found in this guild.`,
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    if (role.managed) {
      return {
        status: "failed_managed_role",
        message: `Role <@&${approvedRoleId}> is managed by an integration and cannot be assigned.`,
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    if (me.roles.highest.comparePositionTo(role) <= 0) {
      return {
        status: "failed_role_hierarchy",
        message: `Bot role is not high enough to assign <@&${approvedRoleId}>.`,
        roleId: approvedRoleId,
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
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    if (member.roles.cache.has(approvedRoleId)) {
      return {
        status: "already_has_role",
        message: `Applicant already has role <@&${approvedRoleId}>.`,
        roleId: approvedRoleId,
        userId: application.applicantUserId,
      };
    }

    await member.roles.add(
      approvedRoleId,
      `Application accepted (${application.applicationId || application.messageId})`
    );
    return {
      status: "granted",
      message: `Granted role <@&${approvedRoleId}> to <@${member.id}>.`,
      roleId: approvedRoleId,
      userId: member.id,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Role assignment failed: ${err.message}`,
      roleId: approvedRoleId,
      userId: application.applicantUserId,
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
  }

  writeState(state);

  await postDecisionUpdate(
    application,
    decision,
    decisionReason
  );
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

  if (interaction.channel && interaction.channel.type === ChannelType.PublicThread) {
    const state = readState();
    return state.threads[interaction.channel.id] || null;
  }

  return null;
}

async function createManagedWebhookForChannel(channel) {
  const hooks = await channel.fetchWebhooks();
  const reusable = hooks.find(
    (hook) => hook.owner?.id === client.user.id && typeof hook.token === "string" && hook.token.length > 0
  );
  if (reusable && reusable.token) {
    return `https://discord.com/api/webhooks/${reusable.id}/${reusable.token}`;
  }

  const created = await channel.createWebhook({
    name: "TAQ Application Bot",
    reason: "Application posting webhook",
  });

  if (!created.token) {
    throw new Error("Created webhook did not return a token.");
  }

  return `https://discord.com/api/webhooks/${created.id}/${created.token}`;
}

async function resolveWebhookForPostChannel(channel) {
  const activeWebhook = getActiveWebhookUrl();
  if (activeWebhook) {
    const info = await fetchWebhookInfoByUrl(activeWebhook);
    if (info.ok && info.data.channel_id === channel.id) {
      return activeWebhook;
    }
  }

  return createManagedWebhookForChannel(channel);
}

function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("accept")
      .setDescription("Force-accept an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID (optional inside application thread)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("deny")
      .setDescription("Force-deny an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID (optional inside application thread)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set application post and log channels")
      .addChannelOption((option) =>
        option
          .setName("application_post")
          .setDescription("Application post channel (defaults to current channel)")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("application_log")
          .setDescription("Application log channel (defaults to post channel)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setapprole")
      .setDescription("Set the role granted when an application is accepted")
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role to grant on acceptance")
          .setRequired(true)
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
            { name: "post_test", value: DEBUG_MODE_POST_TEST }
          )
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

  const activeChannelId = getActiveChannelId();
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
  const channelId = getActiveChannelId();
  if (!channelId) {
    console.log("Permission audit skipped: no active channel set. Use /setchannel.");
    return;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !("guild" in channel) || !channel.guild) {
    throw new Error("Active channel is not a guild text channel.");
  }

  const guild = channel.guild;
  const me = await guild.members.fetchMe();

  const missingGuildPerms = REQUIRED_GUILD_PERMISSIONS.filter(([, perm]) => !me.permissions.has(perm));
  const channelPerms = channel.permissionsFor(me);
  const missingChannelPerms = REQUIRED_CHANNEL_PERMISSIONS.filter(
    ([, perm]) => !channelPerms || !channelPerms.has(perm)
  );

  if (missingGuildPerms.length === 0 && missingChannelPerms.length === 0) {
    console.log("Permission audit passed.");
    return;
  }

  const guildNames = missingGuildPerms.map(([name]) => name).join(", ");
  const channelNames = missingChannelPerms.map(([name]) => name).join(", ");

  if (missingGuildPerms.length > 0) {
    console.error(`Missing guild permissions: ${guildNames}`);
  }
  if (missingChannelPerms.length > 0) {
    console.error(`Missing channel permissions: ${channelNames}`);
  }

  throw new Error(
    "Permission audit failed. Grant missing permissions and check role/channel overrides."
  );
}

async function buildDebugReport(interaction) {
  const lines = [];
  const activeChannelId = getActiveChannelId();
  const activeWebhook = getActiveWebhookUrl();
  const activeApprovedRoleId = getActiveApprovedRoleId();

  lines.push(`Bot User ID: ${client.user?.id || "unknown"}`);
  lines.push(`Configured Client ID: ${config.clientId || "missing"}`);
  lines.push(
    `Client ID matches bot user ID: ${client.user?.id === config.clientId ? "yes" : "no"}`
  );
  lines.push(`Interaction Guild ID: ${interaction.guildId || "none"}`);
  lines.push(`Active Channel ID: ${activeChannelId || "none"}`);
  lines.push(`Active Webhook Set: ${activeWebhook ? "yes" : "no"}`);
  lines.push(`Active Approved Role ID: ${activeApprovedRoleId || "none"}`);
  const state = readState();
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

  if (activeChannelId) {
    try {
      const channel = await client.channels.fetch(activeChannelId);
      if (channel && "guild" in channel && channel.guild) {
        const me = await channel.guild.members.fetchMe();
        const channelPerms = channel.permissionsFor(me);
        const missing = REQUIRED_CHANNEL_PERMISSIONS.filter(
          ([, perm]) => !channelPerms || !channelPerms.has(perm)
        ).map(([name]) => name);
        lines.push(
          `Missing Channel Perms: ${missing.length > 0 ? missing.join(", ") : "none"}`
        );
      } else {
        lines.push("Active Channel Check: not a guild text channel");
      }
    } catch (err) {
      lines.push(`Active Channel Check: error (${err.message})`);
    }
  }

  return lines.join("\n");
}

async function runDebugPostTest(interaction) {
  const configuredChannelId = getActiveChannelId();
  if (!configuredChannelId) {
    throw new Error("No active channel configured. Run /setchannel first.");
  }

  const activeWebhook = getActiveWebhookUrl();
  if (!activeWebhook) {
    throw new Error("No active webhook configured. Run /setchannel first.");
  }

  const triggeredAt = new Date().toISOString();
  const content = [
    "🧪 **Debug Application Post Test**",
    "This is a live test post from `/debug mode:post_test`.",
    `**Triggered By:** <@${interaction.user.id}>`,
    `**Triggered At:** ${triggeredAt}`,
    "",
    "**Example Fields:**",
    "**Name:** Debug Applicant",
    "**Discord Name:** debug-user",
    "**Reason:** Validate webhook post flow end-to-end",
  ].join("\n");

  const msg = await sendWebhookMessage(content);
  const postedChannelId = msg.channel_id || configuredChannelId;
  if (postedChannelId !== configuredChannelId) {
    throw new Error(
      `Webhook posted to channel ${postedChannelId}, expected ${configuredChannelId}. Run /setchannel again.`
    );
  }

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

async function postApplicationForJob(state, job) {
  const configuredChannelId = getActiveChannelId();
  if (!configuredChannelId) {
    throw new Error("No target channel configured. Use /setchannel.");
  }

  const headers = Array.isArray(job.headers) ? job.headers : [];
  const row = Array.isArray(job.row) ? job.row : [];
  const rowIndex = Number.isInteger(job.rowIndex) ? job.rowIndex : "unknown";
  const applicantName = inferApplicantName(headers, row);
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

  const initialContent = makeApplicationPostContent({
    rowIndex,
    applicationId: null,
    applicantMention,
    applicantRawValue: applicantDiscord.rawValue,
    headers,
    row,
  });

  const msg = await sendWebhookMessage(initialContent, allowedMentions);
  const postedChannelId = msg.channel_id || configuredChannelId;
  if (postedChannelId !== configuredChannelId) {
    throw new Error(
      `Webhook posts to channel ${postedChannelId}, but configured channel is ${configuredChannelId}. Run /setchannel again.`
    );
  }

  const applicationId = msg.id;
  const finalContent = makeApplicationPostContent({
    rowIndex,
    applicationId,
    applicantMention,
    applicantRawValue: applicantDiscord.rawValue,
    headers,
    row,
  });
  if (finalContent !== initialContent) {
    try {
      await editWebhookMessage(msg.id, finalContent, allowedMentions);
    } catch (err) {
      console.error(`[JOB ${job.jobId}] Failed updating application ID text:`, err.message);
    }
  }

  try {
    await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
    await addReaction(postedChannelId, msg.id, DENY_EMOJI);
  } catch (err) {
    console.error(`[JOB ${job.jobId}] Failed adding reactions:`, err.message);
  }

  let thread = null;
  try {
    thread = await createThread(postedChannelId, msg.id, `Application - ${applicantName}`);
  } catch (err) {
    console.error(`[JOB ${job.jobId}] Failed creating thread:`, err.message);
  }

  state.applications[msg.id] = {
    messageId: msg.id,
    applicationId: msg.id,
    channelId: postedChannelId,
    threadId: thread?.id || null,
    status: STATUS_PENDING,
    rowIndex: typeof rowIndex === "number" ? rowIndex : null,
    jobId: job.jobId,
    applicantName,
    applicantUserId: applicantDiscord.userId || null,
    createdAt: new Date().toISOString(),
    submittedFields: headers.map((header, i) => {
      const key = (header || `Field ${i + 1}`).trim();
      const value = row[i] || "(empty)";
      return `**${key}:** ${String(value)}`;
    }),
  };

  if (thread?.id) {
    state.threads[thread.id] = msg.id;
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

  if (!getActiveChannelId() || !getActiveWebhookUrl()) {
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
      job.attempts = (Number.isInteger(job.attempts) ? job.attempts : 0) + 1;
      job.lastAttemptAt = new Date().toISOString();

      try {
        await postApplicationForJob(state, job);
        state.postJobs.shift();
        posted += 1;
        writeState(state);
        console.log(`[JOB ${job.jobId}] Posted application for row ${job.rowIndex}.`);
      } catch (err) {
        job.lastError = err.message;
        failed += 1;
        failedJobId = job.jobId;
        failedError = err.message;
        writeState(state);
        console.error(`[JOB ${job.jobId}] Failed posting row ${job.rowIndex}:`, err.message);
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
    const startDataRow = Math.max(2, state.lastRow + 1);
    const endDataRow = rows.length + 1;
    const trackedRows = buildTrackedRowSet(state);
    let stateChanged = false;

    if (startDataRow <= endDataRow) {
      for (
        let sheetRowNumber = startDataRow;
        sheetRowNumber <= endDataRow;
        sheetRowNumber += 1
      ) {
        const row = values[sheetRowNumber - 1] || [];
        if (state.lastRow !== sheetRowNumber) {
          state.lastRow = sheetRowNumber;
          stateChanged = true;
        }

        if (row.every((cell) => !cell)) {
          continue;
        }

        if (trackedRows.has(sheetRowNumber)) {
          continue;
        }

        const job = createPostJob(state, headers, row, sheetRowNumber);
        state.postJobs.push(job);
        trackedRows.add(sheetRowNumber);
        stateChanged = true;
        console.log(`[JOB ${job.jobId}] Queued application post for row ${sheetRowNumber}.`);
      }
    }

    if (stateChanged) {
      sortPostJobsInPlace(state.postJobs);
      writeState(state);
    }
  }

  if (!getActiveChannelId()) {
    if (!loggedNoChannelWarning) {
      console.log("Posting paused: no active channel configured. Use /setchannel.");
      loggedNoChannelWarning = true;
    }
    return;
  }
  loggedNoChannelWarning = false;

  if (!getActiveWebhookUrl()) {
    if (!loggedNoWebhookWarning) {
      console.log("Posting paused: no webhook configured. Use /setchannel to auto-create one.");
      loggedNoWebhookWarning = true;
    }
    return;
  }
  loggedNoWebhookWarning = false;

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
    const isDebug = interaction.commandName === "debug";
    const isStop = interaction.commandName === "stop";
    const isRestart = interaction.commandName === "restart";
    if (
      !isAccept &&
      !isDeny &&
      !isSetChannel &&
      !isSetAppRole &&
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
          lines.push("Webhook post, reactions, and thread creation all succeeded.");
        }
        dmText = lines.join("\n");
        confirmText = "Debug post test ran. Results sent to your DMs.";
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

      const role = interaction.options.getRole("role", true);
      if (!role) {
        await interaction.reply({
          content: "Role not found.",
          ephemeral: true,
        });
        return;
      }

      setActiveApprovedRole(role.id);

      let warning = "";
      try {
        const me = await interaction.guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          warning = "\nWarning: I do not currently have Manage Roles permission.";
        } else {
          const fullRole = await interaction.guild.roles.fetch(role.id);
          if (fullRole && me.roles.highest.comparePositionTo(fullRole) <= 0) {
            warning = "\nWarning: My top role must be above this role to assign it.";
          }
          if (fullRole?.managed) {
            warning = "\nWarning: This is a managed/integration role and may not be assignable.";
          }
        }
      } catch (err) {
        warning = `\nWarning: Could not fully validate role assignability (${err.message}).`;
      }

      await interaction.reply({
        content: `Approved application role set to <@&${role.id}>.${warning}`,
        ephemeral: true,
      });
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

      const postChannel =
        interaction.options.getChannel("application_post") || interaction.channel;
      const logChannelCandidate =
        interaction.options.getChannel("application_log") || postChannel;

      if (!postChannel || postChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Please choose a guild text channel for `application_post`.",
          ephemeral: true,
        });
        return;
      }

      if (!logChannelCandidate || logChannelCandidate.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Please choose a guild text channel for `application_log`.",
          ephemeral: true,
        });
        return;
      }

      const me = await interaction.guild.members.fetchMe();
      const postPerms = postChannel.permissionsFor(me);
      if (!postPerms || !postPerms.has(PermissionsBitField.Flags.ManageWebhooks)) {
        await interaction.reply({
          content:
            "I need Manage Webhooks permission in the application post channel to auto-create webhook.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const webhookUrl = await resolveWebhookForPostChannel(postChannel);
      setActiveWebhookUrl(webhookUrl);
      setActiveChannel(postChannel.id);
      setActiveLogsChannel(logChannelCandidate.id);

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
        content: `Application post channel set to <#${postChannel.id}>.\nApplication log channel set to <#${logChannelCandidate.id}>.\nWebhook auto-configured from post channel.\n${replayLine}\n${auditResult}`,
      });
      return;
    }

    const canForceDecision =
      memberPerms.has(PermissionsBitField.Flags.Administrator) ||
      (memberPerms.has(PermissionsBitField.Flags.ManageGuild) &&
        memberPerms.has(PermissionsBitField.Flags.ManageRoles));
    if (!canForceDecision) {
      await interaction.reply({
        content:
          "You need both Manage Server and Manage Roles permissions (or Administrator) to use /accept or /deny.",
        ephemeral: true,
      });
      return;
    }

    const messageId = resolveMessageIdForCommand(interaction);
    if (!messageId) {
      await interaction.reply({
        content:
          "Message ID not found. Use this command inside an application thread or pass `message_id`.",
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
        content: "This message ID is not a tracked application.",
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
  await verifyStartupWebhook();

  try {
    const activeChannelId = getActiveChannelId();
    if (!activeChannelId) {
      console.log("No active channel configured yet. Use /setchannel.");
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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
