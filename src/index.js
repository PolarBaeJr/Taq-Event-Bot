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
  logsChannelName: process.env.DISCORD_LOGS_CHANNEL_NAME || "application-logs",
  logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID,
  threadArchiveMinutes: Number(
    process.env.DISCORD_THREAD_AUTO_ARCHIVE_MINUTES || 10080
  ),
};

const STATUS_PENDING = "pending";
const STATUS_ACCEPTED = "accepted";
const STATUS_DENIED = "denied";

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
const ignoredWebhookUrls = new Set();

function defaultState() {
  return {
    lastRow: 1,
    applications: {},
    threads: {},
    controlActions: [],
    settings: {
      channelId: null,
      webhookUrl: null,
      logChannelId: null,
    },
  };
}

function readState() {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
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
      settings:
        parsed.settings && typeof parsed.settings === "object"
          ? {
              channelId: parsed.settings.channelId || null,
              webhookUrl: parsed.settings.webhookUrl || null,
              logChannelId: parsed.settings.logChannelId || null,
            }
          : { channelId: null, webhookUrl: null, logChannelId: null },
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

function requiredVotesCount(eligibleCount) {
  return Math.ceil((eligibleCount * 2) / 3);
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

async function sendWebhookMessage(content) {
  const webhookUrl = getActiveWebhookUrl();
  if (!webhookUrl) {
    throw new Error("No webhook URL configured.");
  }

  const res = await fetch(`${webhookUrl}?wait=true`, {
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

    const log = [
      "📚 **Application Closed (History Log)**",
      `**Decision:** ${decisionLabel}`,
      `**Applicant:** ${application.applicantName || "Unknown"}`,
      `**Row:** ${application.rowIndex || "Unknown"}`,
      `**Created At:** ${application.createdAt || "Unknown"}`,
      `**Decided At:** ${application.decidedAt || "Unknown"}`,
      `**Decision Source:** ${application.decisionSource || "Unknown"}`,
      `**Decided By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
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
  writeState(state);

  await postDecisionUpdate(
    application,
    decision,
    sourceLabel === "vote"
      ? "Decision reached with 2/3 channel supermajority."
      : `Forced by <@${actorId}> using slash command.`
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
      .setName("debug")
      .setDescription("Run bot integration diagnostics"),
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

  const existingNames = new Set(existing.map((cmd) => cmd.name));
  const desiredNames = new Set(commands.map((cmd) => cmd.name));

  if (existingNames.size !== desiredNames.size) {
    return false;
  }
  for (const item of desiredNames) {
    if (!existingNames.has(item)) {
      return false;
    }
  }
  return true;
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

  lines.push(`Bot User ID: ${client.user?.id || "unknown"}`);
  lines.push(`Configured Client ID: ${config.clientId || "missing"}`);
  lines.push(
    `Client ID matches bot user ID: ${client.user?.id === config.clientId ? "yes" : "no"}`
  );
  lines.push(`Interaction Guild ID: ${interaction.guildId || "none"}`);
  lines.push(`Active Channel ID: ${activeChannelId || "none"}`);
  lines.push(`Active Webhook Set: ${activeWebhook ? "yes" : "no"}`);

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

async function handleNewRow(state, headers, row, rowIndex) {
  const configuredChannelId = getActiveChannelId();
  if (!configuredChannelId) {
    throw new Error("No target channel configured. Use /setchannel.");
  }

  const applicantName = inferApplicantName(headers, row);
  const content = [
    `📥 **New Application** (Row ${rowIndex})`,
    "",
    makeApplicationContent(headers, row),
  ].join("\n");

  const msg = await sendWebhookMessage(content);
  const postedChannelId = msg.channel_id || configuredChannelId;
  if (postedChannelId !== configuredChannelId) {
    throw new Error(
      `Webhook posts to channel ${postedChannelId}, but configured channel is ${configuredChannelId}. Run /setchannel again.`
    );
  }

  await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
  await addReaction(postedChannelId, msg.id, DENY_EMOJI);
  const thread = await createThread(postedChannelId, msg.id, `Application - ${applicantName}`);

  state.applications[msg.id] = {
    messageId: msg.id,
    channelId: postedChannelId,
    threadId: thread.id,
    status: STATUS_PENDING,
    rowIndex,
    applicantName,
    createdAt: new Date().toISOString(),
    submittedFields: headers.map((header, i) => {
      const key = (header || `Field ${i + 1}`).trim();
      const value = row[i] || "(empty)";
      return `**${key}:** ${String(value)}`;
    }),
  };
  state.threads[thread.id] = msg.id;
}

async function pollOnce() {
  if (!getActiveChannelId()) {
    if (!loggedNoChannelWarning) {
      console.log("Polling paused: no active channel configured. Use /setchannel.");
      loggedNoChannelWarning = true;
    }
    return;
  }

  loggedNoChannelWarning = false;
  if (!getActiveWebhookUrl()) {
    if (!loggedNoWebhookWarning) {
      console.log("Polling paused: no webhook configured. Use /setchannel to auto-create one.");
      loggedNoWebhookWarning = true;
    }
    return;
  }
  loggedNoWebhookWarning = false;
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

  for (
    let sheetRowNumber = startDataRow;
    sheetRowNumber <= endDataRow;
    sheetRowNumber += 1
  ) {
    const row = values[sheetRowNumber - 1] || [];
    if (row.every((cell) => !cell)) {
      state.lastRow = sheetRowNumber;
      writeState(state);
      continue;
    }

    await handleNewRow(state, headers, row, sheetRowNumber);
    state.lastRow = sheetRowNumber;
    writeState(state);
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
    const isDebug = interaction.commandName === "debug";
    const isStop = interaction.commandName === "stop";
    const isRestart = interaction.commandName === "restart";
    if (
      !isAccept &&
      !isDeny &&
      !isSetChannel &&
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

      const report = await buildDebugReport(interaction);
      await interaction.reply({
        content: `Debug report:\n\`\`\`\n${report}\n\`\`\``,
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

      const webhookUrl = await resolveWebhookForPostChannel(postChannel);
      setActiveWebhookUrl(webhookUrl);
      setActiveChannel(postChannel.id);
      setActiveLogsChannel(logChannelCandidate.id);

      let auditResult = "Permission audit passed.";
      try {
        await auditBotPermissions();
      } catch (err) {
        auditResult = `Permission audit failed: ${err.message}`;
      }

      await interaction.reply({
        content: `Application post channel set to <#${postChannel.id}>.\nApplication log channel set to <#${logChannelCandidate.id}>.\nWebhook auto-configured from post channel.\n${auditResult}`,
        ephemeral: true,
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
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Failed to process command.",
        ephemeral: true,
      });
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
