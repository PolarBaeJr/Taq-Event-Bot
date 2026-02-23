/*
  Core module for interaction command handler.
*/

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

// Custom ID prefixes used to route button/select/modal interactions back to the right handler.
const REACTION_ROLE_GUI_PREFIX = "rrgui";
const REACTION_ROLE_GUI_ACTION_ADD = "add";
const REACTION_ROLE_GUI_ACTION_REMOVE = "remove";
const REACTION_ROLE_GUI_ACTION_MODAL_ADD = "modal_add";
const REACTION_ROLE_GUI_ACTION_MODAL_REMOVE = "modal_remove";
const REACTION_ROLE_BUTTON_PREFIX = "rrbtn";
const APPROLE_GUI_PREFIX = "approlegui";
const APPROLE_GUI_ACTION_TRACK = "track";
const APPROLE_GUI_ACTION_ROLES = "roles";
const ACCEPT_RESOLVE_MODAL_PREFIX = "acceptresolve";
const ACCEPT_RESOLVE_MODAL_FIELD_APPLICANT = "applicant_hint";
const ACCEPT_RESOLVE_PROMPT_TTL_MS = 10 * 60 * 1000;
const COMMAND_OPTION_TYPE_SUBCOMMAND = 1;
const COMMAND_OPTION_TYPE_SUBCOMMAND_GROUP = 2;
const COMMAND_OPTION_TYPE_STRING = 3;
const COMMAND_OPTION_TYPE_ROLE = 8;
const REACTION_ROLE_BUTTON_MESSAGE_TYPE_TEXT = "text";
const REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED = "embed";
const REACTION_ROLE_BUTTON_COLOR_CHOICES = Object.freeze({
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
});

// Main interaction router. All runtime dependencies are injected from index.js.
function createInteractionCommandHandler(options = {}) {
  const PermissionsBitField = options.PermissionsBitField;
  const ChannelType = options.ChannelType;
  const relayFeedbackCommand = options.relayFeedbackCommand;
  const getActiveBugChannelId = options.getActiveBugChannelId;
  const getActiveSuggestionsChannelId = options.getActiveSuggestionsChannelId;
  const getApplicationTracks = options.getApplicationTracks;
  const getCustomTracksSnapshot = options.getCustomTracksSnapshot;
  const upsertCustomTrack = options.upsertCustomTrack;
  const editCustomTrack = options.editCustomTrack;
  const removeCustomTrack = options.removeCustomTrack;
  const getTrackCustomQuestions = typeof options.getTrackCustomQuestions === "function"
    ? options.getTrackCustomQuestions
    : () => [];
  const addTrackCustomQuestion = typeof options.addTrackCustomQuestion === "function"
    ? options.addTrackCustomQuestion
    : () => { throw new Error("addTrackCustomQuestion not configured."); };
  const removeTrackCustomQuestion = typeof options.removeTrackCustomQuestion === "function"
    ? options.removeTrackCustomQuestion
    : () => { throw new Error("removeTrackCustomQuestion not configured."); };
  const resetTrackCustomQuestions = typeof options.resetTrackCustomQuestions === "function"
    ? options.resetTrackCustomQuestions
    : () => { throw new Error("resetTrackCustomQuestions not configured."); };
  const postConfigurationLog = options.postConfigurationLog;
  const userDisplayName = options.userDisplayName;
  const debugModeReport = options.debugModeReport;
  const debugModePostTest = options.debugModePostTest;
  const debugModeAcceptTest = options.debugModeAcceptTest;
  const debugModeDenyTest = options.debugModeDenyTest;
  const buildDebugReport = options.buildDebugReport;
  const runDebugPostTest = options.runDebugPostTest;
  const runDebugDecisionTest = options.runDebugDecisionTest;
  const sendDebugDm = options.sendDebugDm;
  const formatDecisionLabel = options.formatDecisionLabel;
  const statusAccepted = options.statusAccepted;
  const statusDenied = options.statusDenied;
  const setActiveDenyDmTemplate = options.setActiveDenyDmTemplate;
  const setActiveAcceptAnnounceChannel = options.setActiveAcceptAnnounceChannel;
  const setActiveAcceptAnnounceTemplate = options.setActiveAcceptAnnounceTemplate;
  const getActiveAcceptAnnounceChannelId = options.getActiveAcceptAnnounceChannelId;
  const sendChannelMessage = options.sendChannelMessage;
  const parseRoleIdList =
    typeof options.parseRoleIdList === "function"
      ? options.parseRoleIdList
      : (value) => {
          const source = Array.isArray(value)
            ? value
            : typeof value === "string"
              ? value.split(/[,\s]+/)
              : [value];
          const out = [];
          const seen = new Set();
          for (const item of source) {
            const roleId = String(item || "").trim();
            if (!/^\d{17,20}$/.test(roleId) || seen.has(roleId)) {
              continue;
            }
            seen.add(roleId);
            out.push(roleId);
          }
          return out;
        };
  const setActiveApprovedRoles = options.setActiveApprovedRoles;
  const getActiveApprovedRoleIds =
    typeof options.getActiveApprovedRoleIds === "function"
      ? options.getActiveApprovedRoleIds
      : () => [];
  const normalizeTrackKey = options.normalizeTrackKey;
  const getTrackLabel = options.getTrackLabel;
  const baseSetChannelTrackOptions = options.baseSetChannelTrackOptions;
  const getActiveChannelMap = options.getActiveChannelMap;
  const isSnowflake = options.isSnowflake;
  const defaultTrackKey = options.defaultTrackKey;
  const getActiveLogsChannelId = options.getActiveLogsChannelId;
  const getActiveBotLogsChannelId =
    typeof options.getActiveBotLogsChannelId === "function"
      ? options.getActiveBotLogsChannelId
      : () => getActiveLogsChannelId();
  const getActiveBugChannelIdForSetChannel = options.getActiveBugChannelIdForSetChannel;
  const getActiveSuggestionsChannelIdForSetChannel =
    options.getActiveSuggestionsChannelIdForSetChannel;
  const getApplicationTrackKeys = options.getApplicationTrackKeys;
  const setActiveChannel = options.setActiveChannel;
  const setActiveLogsChannel = options.setActiveLogsChannel;
  const setActiveBotLogsChannel =
    typeof options.setActiveBotLogsChannel === "function"
      ? options.setActiveBotLogsChannel
      : () => {};
  const setActiveBugChannel = options.setActiveBugChannel;
  const setActiveSuggestionsChannel = options.setActiveSuggestionsChannel;
  const readState = options.readState;
  const processQueuedPostJobs = options.processQueuedPostJobs;
  const auditBotPermissions = options.auditBotPermissions;
  const logControlCommand = options.logControlCommand;
  const resolveMessageIdForCommand = options.resolveMessageIdForCommand;
  const finalizeApplication = options.finalizeApplication;
  const reopenApplication = options.reopenApplication;
  const closeApplication = typeof options.closeApplication === "function"
    ? options.closeApplication
    : async () => { throw new Error("closeApplication unavailable"); };
  const repostTrackedApplications = typeof options.repostTrackedApplications === "function"
    ? options.repostTrackedApplications
    : async () => {
        throw new Error("Repost applications operation is unavailable.");
      };
  const buildDashboardMessage = options.buildDashboardMessage;
  const buildUptimeMessage = typeof options.buildUptimeMessage === "function"
    ? options.buildUptimeMessage
    : () => "⏱️ Uptime is unavailable.";
  const buildUnassignedRoleMessage =
    typeof options.buildUnassignedRoleMessage === "function"
      ? options.buildUnassignedRoleMessage
      : () => "⚠️ Unassigned-role report is unavailable.";
  const buildSettingsMessage = options.buildSettingsMessage;
  const setTrackVoteRule = options.setTrackVoteRule;
  const setReminderConfiguration = options.setReminderConfiguration;
  const setDailyDigestConfiguration = options.setDailyDigestConfiguration;
  const setSheetSourceConfiguration = typeof options.setSheetSourceConfiguration === "function"
    ? options.setSheetSourceConfiguration
    : () => {
        throw new Error("Sheet source configuration is unavailable.");
      };
  const setApplicantMissingDiscordThreadNoticeMessage =
    typeof options.setApplicantMissingDiscordThreadNoticeMessage === "function"
      ? options.setApplicantMissingDiscordThreadNoticeMessage
      : () => {
          throw new Error("Missing-user thread notice configuration is unavailable.");
        };
  const setTrackReviewerMentions = options.setTrackReviewerMentions;
  const setTrackVoterRoles = typeof options.setTrackVoterRoles === "function"
    ? options.setTrackVoterRoles
    : () => {
        throw new Error("Voter role configuration is unavailable.");
      };
  const upsertReactionRoleBinding = options.upsertReactionRoleBinding;
  const removeReactionRoleBinding = options.removeReactionRoleBinding;
  const listReactionRoleBindings = options.listReactionRoleBindings;
  const exportAdminConfig = options.exportAdminConfig;
  const importAdminConfig = options.importAdminConfig;
  const formatVoteRule = options.formatVoteRule;
  const addReaction = options.addReaction;
  const reactionRoleListMaxLines = Number.isInteger(options.reactionRoleListMaxLines)
    ? options.reactionRoleListMaxLines
    : 40;
  const getTrackKeyForChannelId = options.getTrackKeyForChannelId;
  const getActiveChannelId = options.getActiveChannelId;
  const getApplicationDisplayId =
    typeof options.getApplicationDisplayId === "function"
      ? options.getApplicationDisplayId
      : (app) => app?.applicationId || app?.jobId || app?.messageId || "unknown";
  const logger =
    options.logger &&
    typeof options.logger.error === "function" &&
    typeof options.logger.info === "function"
      ? options.logger
      : null;
  const refreshSlashCommandsForGuild =
    typeof options.refreshSlashCommandsForGuild === "function"
      ? options.refreshSlashCommandsForGuild
      : null;
  const pendingAcceptResolvePrompts = new Map();
  let acceptResolvePromptCounter = 0;

  // "Manage roles config" is intentionally stricter than plain ManageGuild to avoid accidental role edits.
  function hasManageRolesConfigPermission(memberPerms) {
    if (!memberPerms) {
      return false;
    }
    return (
      memberPerms.has(PermissionsBitField.Flags.Administrator) ||
      (memberPerms.has(PermissionsBitField.Flags.ManageGuild) &&
        memberPerms.has(PermissionsBitField.Flags.ManageRoles))
    );
  }

  // buildReactionRoleGuiCustomId: handles build reaction role gui custom id.
  function buildReactionRoleGuiCustomId(action, userId) {
    return `${REACTION_ROLE_GUI_PREFIX}:${action}:${String(userId || "")}`;
  }

  // parseReactionRoleGuiCustomId: handles parse reaction role gui custom id.
  function parseReactionRoleGuiCustomId(customId) {
    const raw = String(customId || "").trim();
    if (!raw.startsWith(`${REACTION_ROLE_GUI_PREFIX}:`)) {
      return null;
    }
    const parts = raw.split(":");
    if (parts.length < 3) {
      return null;
    }
    return {
      action: parts[1],
      userId: parts[2],
    };
  }

  // buildReactionRoleGuiComponents: handles build reaction role gui components.
  function buildReactionRoleGuiComponents(userId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildReactionRoleGuiCustomId(REACTION_ROLE_GUI_ACTION_ADD, userId))
          .setLabel("Add/Update Mapping")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(buildReactionRoleGuiCustomId(REACTION_ROLE_GUI_ACTION_REMOVE, userId))
          .setLabel("Remove Mapping")
          .setStyle(ButtonStyle.Danger)
      ),
    ];
  }

  // buildReactionRoleButtonCustomId: handles build reaction role button custom id.
  function buildReactionRoleButtonCustomId(guildId, roleId) {
    return `${REACTION_ROLE_BUTTON_PREFIX}:${String(guildId || "")}:${String(roleId || "")}`;
  }

  // parseReactionRoleButtonCustomId: handles parse reaction role button custom id.
  function parseReactionRoleButtonCustomId(customId) {
    const raw = String(customId || "").trim();
    if (!raw.startsWith(`${REACTION_ROLE_BUTTON_PREFIX}:`)) {
      return null;
    }
    const parts = raw.split(":");
    if (parts.length !== 3) {
      return null;
    }
    const guildId = String(parts[1] || "").trim();
    const roleId = String(parts[2] || "").trim();
    if (!isSnowflake(guildId) || !isSnowflake(roleId)) {
      return null;
    }
    return {
      guildId,
      roleId,
    };
  }

  // Build one or more ActionRows (max 5 buttons per row, 25 total) for button-role panels.
  function buildReactionRoleButtonPanelComponents(guildId, buttonEntries, buttonStyle) {
    const entries = Array.isArray(buttonEntries)
      ? buttonEntries
          .map((entry) => {
            const roleId = String(entry?.roleId || "").trim();
            if (!isSnowflake(roleId)) {
              return null;
            }
            const labelSource = String(entry?.label || "").trim();
            const label = labelSource ? labelSource.slice(0, 80) : `Role ${roleId.slice(-4)}`;
            return {
              roleId,
              label,
            };
          })
          .filter(Boolean)
      : [];
    const unique = new Map();
    for (const entry of entries) {
      if (!unique.has(entry.roleId)) {
        unique.set(entry.roleId, entry);
      }
    }
    const usableEntries = [...unique.values()].slice(0, 25);
    const rows = [];
    const style = Number.isInteger(buttonStyle) ? buttonStyle : ButtonStyle.Secondary;
    for (let i = 0; i < usableEntries.length; i += 5) {
      const rowEntries = usableEntries.slice(i, i + 5);
      const row = new ActionRowBuilder();
      for (const entry of rowEntries) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(buildReactionRoleButtonCustomId(guildId, entry.roleId))
            .setLabel(entry.label)
            .setStyle(style)
        );
      }
      rows.push(row);
    }
    return rows;
  }

  // parseReactionRoleButtonStyle: handles parse reaction role button style.
  function parseReactionRoleButtonStyle(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase();
    if (!normalized) {
      return ButtonStyle.Secondary;
    }
    return REACTION_ROLE_BUTTON_COLOR_CHOICES[normalized] || null;
  }

  // formatReactionRoleButtonStyle: handles format reaction role button style.
  function formatReactionRoleButtonStyle(style) {
    switch (style) {
      case ButtonStyle.Primary:
        return "blue";
      case ButtonStyle.Success:
        return "green";
      case ButtonStyle.Danger:
        return "red";
      case ButtonStyle.Secondary:
      default:
        return "gray";
    }
  }

  // parseReactionRoleButtonMessageType: handles parse reaction role button message type.
  function parseReactionRoleButtonMessageType(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase();
    if (!normalized || normalized === REACTION_ROLE_BUTTON_MESSAGE_TYPE_TEXT) {
      return REACTION_ROLE_BUTTON_MESSAGE_TYPE_TEXT;
    }
    if (normalized === REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED) {
      return REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED;
    }
    return null;
  }

  // Convert numeric embed color to a Discord-friendly hex preview (for logs/replies).
  function formatEmbedColorHex(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
      return null;
    }
    return `#${value.toString(16).toUpperCase().padStart(6, "0")}`;
  }

  // Read current button-role panel components to infer existing style/count during edits.
  function summarizeExistingReactionRoleButtons(rows, guildId) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    let count = 0;
    let style = null;

    for (const row of sourceRows) {
      const rowJson =
        row && typeof row.toJSON === "function" ? row.toJSON() : { ...(row || {}) };
      const components = Array.isArray(rowJson?.components) ? rowJson.components : [];
      for (const component of components) {
        if (component?.type !== ComponentType.Button) {
          continue;
        }
        const customId = String(component?.custom_id || "").trim();
        if (!customId) {
          continue;
        }
        const buttonContext = parseReactionRoleButtonCustomId(customId);
        if (!buttonContext || buttonContext.guildId !== guildId) {
          continue;
        }
        count += 1;
        if (style === null && Number.isInteger(component?.style)) {
          style = component.style;
        }
      }
    }

    return {
      count,
      style: Number.isInteger(style) ? style : ButtonStyle.Secondary,
    };
  }

  // buildAppRoleGuiCustomId: handles build app role gui custom id.
  function buildAppRoleGuiCustomId(action, userId, trackKey = "") {
    const keyPart = String(trackKey || "").trim();
    return `${APPROLE_GUI_PREFIX}:${action}:${String(userId || "")}${keyPart ? `:${keyPart}` : ""}`;
  }

  // parseAppRoleGuiCustomId: handles parse app role gui custom id.
  function parseAppRoleGuiCustomId(customId) {
    const raw = String(customId || "").trim();
    if (!raw.startsWith(`${APPROLE_GUI_PREFIX}:`)) {
      return null;
    }
    const parts = raw.split(":");
    if (parts.length < 3) {
      return null;
    }
    return {
      action: parts[1],
      userId: parts[2],
      trackKey: parts.slice(3).join(":") || null,
    };
  }

  // buildAcceptResolveModalCustomId: handles build accept resolve modal custom id.
  function buildAcceptResolveModalCustomId(promptId) {
    return `${ACCEPT_RESOLVE_MODAL_PREFIX}:${String(promptId || "")}`;
  }

  // parseAcceptResolveModalCustomId: handles parse accept resolve modal custom id.
  function parseAcceptResolveModalCustomId(customId) {
    const raw = String(customId || "").trim();
    if (!raw.startsWith(`${ACCEPT_RESOLVE_MODAL_PREFIX}:`)) {
      return null;
    }
    const parts = raw.split(":");
    if (parts.length < 2) {
      return null;
    }
    const promptId = String(parts[1] || "").trim();
    if (!promptId) {
      return null;
    }
    return { promptId };
  }

  // nextAcceptResolvePromptId: handles next accept resolve prompt id.
  function nextAcceptResolvePromptId() {
    acceptResolvePromptCounter = (acceptResolvePromptCounter + 1) % 1679616;
    return `${Date.now().toString(36)}${acceptResolvePromptCounter.toString(36)}`;
  }

  // pruneExpiredAcceptResolvePrompts: handles prune expired accept resolve prompts.
  function pruneExpiredAcceptResolvePrompts() {
    const now = Date.now();
    for (const [key, value] of pendingAcceptResolvePrompts.entries()) {
      const createdAt = Number(value?.createdAt) || 0;
      if (now - createdAt > ACCEPT_RESOLVE_PROMPT_TTL_MS) {
        pendingAcceptResolvePrompts.delete(key);
      }
    }
  }

  // buildAcceptResolveModal: handles build accept resolve modal.
  function buildAcceptResolveModal(promptId) {
    const modal = new ModalBuilder()
      .setCustomId(buildAcceptResolveModalCustomId(promptId))
      .setTitle("Resolve Applicant User");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(ACCEPT_RESOLVE_MODAL_FIELD_APPLICANT)
          .setLabel("Applicant username / @mention / ID")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. @polarbaejr or 123456789012345678")
          .setRequired(true)
          .setMaxLength(120)
      )
    );

    return modal;
  }

  // buildAppRoleTrackSelectOptions: handles build app role track select options.
  function buildAppRoleTrackSelectOptions(selectedTrackKey = null) {
    const selected = String(selectedTrackKey || "").trim();
    return getApplicationTracks()
      .map((track) => {
        const key = String(track?.key || "").trim();
        const label = String(track?.label || key).trim() || key;
        if (!key) {
          return null;
        }
        return {
          label: `${label} (${key})`.slice(0, 100),
          value: key.slice(0, 100),
          default: selected && key === selected,
        };
      })
      .filter(Boolean)
      .slice(0, 25);
  }

  // buildAppRoleGuiComponents: handles build app role gui components.
  function buildAppRoleGuiComponents(userId, selectedTrackKey = null) {
    const trackOptions = buildAppRoleTrackSelectOptions(selectedTrackKey);
    if (trackOptions.length === 0) {
      return [];
    }

    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(buildAppRoleGuiCustomId(APPROLE_GUI_ACTION_TRACK, userId))
          .setPlaceholder("Select a track")
          .addOptions(trackOptions)
      ),
    ];

    if (selectedTrackKey) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(
              buildAppRoleGuiCustomId(APPROLE_GUI_ACTION_ROLES, userId, selectedTrackKey)
            )
            .setPlaceholder("Select up to 5 accepted roles")
            .setMinValues(0)
            .setMaxValues(5)
        )
      );
    }

    return rows;
  }

  // buildReactionRoleAddModal: handles build reaction role add modal.
  function buildReactionRoleAddModal(userId) {
    const modal = new ModalBuilder()
      .setCustomId(buildReactionRoleGuiCustomId(REACTION_ROLE_GUI_ACTION_MODAL_ADD, userId))
      .setTitle("Add/Update Reaction Role");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("message_id")
          .setLabel("Message ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("✅ or <:name:id>")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("role_id")
          .setLabel("Role ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("channel_id")
          .setLabel("Channel ID (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );

    return modal;
  }

  // buildReactionRoleRemoveModal: handles build reaction role remove modal.
  function buildReactionRoleRemoveModal(userId) {
    const modal = new ModalBuilder()
      .setCustomId(buildReactionRoleGuiCustomId(REACTION_ROLE_GUI_ACTION_MODAL_REMOVE, userId))
      .setTitle("Remove Reaction Role");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("message_id")
          .setLabel("Message ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("✅ or <:name:id>")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("channel_id")
          .setLabel("Channel ID (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );

    return modal;
  }

  // resolveReactionRoleTargetChannel: handles resolve reaction role target channel.
  async function resolveReactionRoleTargetChannel(interaction, rawChannelId) {
    const requestedChannelId = String(rawChannelId || "").trim();
    if (!requestedChannelId) {
      return interaction.channel;
    }
    if (!isSnowflake(requestedChannelId) || !interaction.guild) {
      return null;
    }
    return interaction.guild.channels.fetch(requestedChannelId).catch(() => null);
  }

  // isValidReactionRoleTargetChannel: handles is valid reaction role target channel.
  function isValidReactionRoleTargetChannel(channel, guildId) {
    return Boolean(
      channel &&
        channel.isTextBased() &&
        typeof channel.messages?.fetch === "function" &&
        channel.guildId === guildId
    );
  }

  // Keep dynamic /set channel option names within Discord's 32-char option name limit.
  function toSetChannelTrackOptionName(trackKey) {
    const raw = String(trackKey || "").trim().toLowerCase();
    if (!raw) {
      return null;
    }
    const cleaned = raw.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!cleaned) {
      return null;
    }
    const suffix = "_post";
    const maxBaseLength = Math.max(1, 32 - suffix.length);
    return `${cleaned.slice(0, maxBaseLength)}${suffix}`;
  }

  // buildDynamicSetChannelTrackOptions: handles build dynamic set channel track options.
  function buildDynamicSetChannelTrackOptions() {
    const staticTrackKeys = new Set(
      (Array.isArray(baseSetChannelTrackOptions) ? baseSetChannelTrackOptions : [])
        .map((optionDef) => String(optionDef?.trackKey || "").trim())
        .filter(Boolean)
    );
    const usedOptionNames = new Set(
      (Array.isArray(baseSetChannelTrackOptions) ? baseSetChannelTrackOptions : [])
        .flatMap((optionDef) => [optionDef?.optionName, optionDef?.legacyOptionName])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    );
    usedOptionNames.add("track");
    usedOptionNames.add("post_channel");
    usedOptionNames.add("log");
    usedOptionNames.add("application_log");
    usedOptionNames.add("bot_log");
    usedOptionNames.add("accept_message");
    usedOptionNames.add("bug");
    usedOptionNames.add("suggestions");

    const candidates = [];
    for (const trackKey of getApplicationTrackKeys()) {
      const normalizedTrackKey = String(trackKey || "").trim();
      if (!normalizedTrackKey || staticTrackKeys.has(normalizedTrackKey)) {
        continue;
      }
      const optionName = toSetChannelTrackOptionName(normalizedTrackKey);
      if (!optionName || usedOptionNames.has(optionName)) {
        continue;
      }
      usedOptionNames.add(optionName);
      candidates.push({
        trackKey: normalizedTrackKey,
        optionName,
      });
    }

    return candidates.sort((a, b) =>
      getTrackLabel(a.trackKey).localeCompare(getTrackLabel(b.trackKey))
    );
  }

  // parseEmbedColor: handles parse embed color.
  function parseEmbedColor(rawValue) {
    const raw = String(rawValue || "").trim().toLowerCase();
    if (!raw) {
      return null;
    }
    let normalized = raw;
    if (normalized.startsWith("0x")) {
      normalized = normalized.slice(2);
    }
    if (normalized.startsWith("#")) {
      normalized = normalized.slice(1);
    }
    if (!/^[0-9a-f]{6}$/.test(normalized)) {
      return null;
    }
    const value = Number.parseInt(normalized, 16);
    return Number.isInteger(value) ? value : null;
  }

  // Flatten nested slash command option trees (subcommand groups -> subcommands -> options).
  function flattenCommandOptions(optionsData) {
    const out = [];
    const queue = Array.isArray(optionsData) ? [...optionsData] : [];

    while (queue.length > 0) {
      const option = queue.shift();
      if (!option || typeof option !== "object") {
        continue;
      }

      const nested = Array.isArray(option.options) ? option.options : [];
      if (
        (option.type === COMMAND_OPTION_TYPE_SUBCOMMAND ||
          option.type === COMMAND_OPTION_TYPE_SUBCOMMAND_GROUP) &&
        nested.length > 0
      ) {
        queue.push(...nested);
        continue;
      }

      if (nested.length > 0 && option.value === undefined) {
        queue.push(...nested);
        continue;
      }

      out.push(option);
    }

    return out;
  }

  // safeGetStringOptionFromInteraction: handles safe get string option from interaction.
  function safeGetStringOptionFromInteraction(interaction, optionName) {
    if (!interaction?.options || typeof interaction.options.getString !== "function") {
      return null;
    }
    try {
      return interaction.options.getString(optionName, false);
    } catch {
      return null;
    }
  }

  // safeGetRoleOptionIdFromInteraction: handles safe get role option id from interaction.
  function safeGetRoleOptionIdFromInteraction(interaction, optionName) {
    if (!interaction?.options || typeof interaction.options.getRole !== "function") {
      return null;
    }
    try {
      const role = interaction.options.getRole(optionName, false);
      return role?.id || null;
    } catch {
      return null;
    }
  }

  // safeGetSubcommand: handles safe get subcommand.
  function safeGetSubcommand(interaction) {
    if (!interaction?.options || typeof interaction.options.getSubcommand !== "function") {
      return null;
    }
    try {
      return interaction.options.getSubcommand(false);
    } catch {
      return null;
    }
  }

  // safeGetSubcommandGroup: handles safe get subcommand group.
  function safeGetSubcommandGroup(interaction) {
    if (!interaction?.options || typeof interaction.options.getSubcommandGroup !== "function") {
      return null;
    }
    try {
      return interaction.options.getSubcommandGroup(false);
    } catch {
      return null;
    }
  }

  // extractTrackOptionInput: handles extract track option input.
  function extractTrackOptionInput(interaction) {
    const namedCandidates = ["track", "track_key", "application_track", "team"];
    for (const optionName of namedCandidates) {
      const value = safeGetStringOptionFromInteraction(interaction, optionName);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const flattenedOptions = flattenCommandOptions(interaction?.options?.data);
    const stringOptions = flattenedOptions.filter(
      (option) =>
        option?.type === COMMAND_OPTION_TYPE_STRING && typeof option?.value === "string"
    );
    if (stringOptions.length === 0) {
      return "";
    }

    const preferred = stringOptions.find((option) =>
      /(track|team)/i.test(String(option?.name || ""))
    );
    const source = preferred || stringOptions[0];
    return String(source?.value || "").trim();
  }

  // extractRoleIdsFromInteractionOptions: handles extract role ids from interaction options.
  function extractRoleIdsFromInteractionOptions(interaction) {
    const namedRoleOptionIds = [
      "role",
      "role_1",
      "role_2",
      "role_3",
      "role_4",
      "role_5",
      "accepted_role",
      "approved_role",
    ]
      .map((optionName) => safeGetRoleOptionIdFromInteraction(interaction, optionName))
      .filter(Boolean);

    const flattenedOptions = flattenCommandOptions(interaction?.options?.data);
    const discoveredRoleIds = flattenedOptions
      .filter((option) => option?.type === COMMAND_OPTION_TYPE_ROLE)
      .map((option) => String(option?.value || "").trim())
      .filter(Boolean);

    return parseRoleIdList([...namedRoleOptionIds, ...discoveredRoleIds]);
  }

  // Debug helpers keep interaction failure logs compact while still actionable.
  function summarizeDebugString(value, maxLength = 120) {
    const raw = String(value ?? "");
    if (raw.length <= maxLength) {
      return raw;
    }
    return `${raw.slice(0, maxLength)}...(${raw.length})`;
  }

  // summarizeCommandOptionValue: handles summarize command option value.
  function summarizeCommandOptionValue(optionName, value) {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      const isLargeText =
        /(json|message|description|line_|footer|title|mentions)/i.test(
          String(optionName || "")
        ) && trimmed.length > 40;
      if (isLargeText) {
        return `${summarizeDebugString(trimmed, 40)} [len=${trimmed.length}]`;
      }
      return summarizeDebugString(trimmed, 120);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "object") {
      return summarizeDebugString(JSON.stringify(value), 120);
    }
    return summarizeDebugString(String(value), 120);
  }

  // summarizeCommandOptionsForDebug: handles summarize command options for debug.
  function summarizeCommandOptionsForDebug(interaction) {
    const options = flattenCommandOptions(interaction?.options?.data);
    if (!Array.isArray(options) || options.length === 0) {
      return [];
    }
    return options.slice(0, 25).map((option) => ({
      name: String(option?.name || ""),
      type: Number(option?.type) || null,
      value: summarizeCommandOptionValue(option?.name, option?.value),
    }));
  }

  // summarizeModalFieldsForDebug: handles summarize modal fields for debug.
  function summarizeModalFieldsForDebug(interaction) {
    const fields = interaction?.fields?.fields;
    if (!fields || typeof fields.values !== "function") {
      return [];
    }
    return Array.from(fields.values())
      .slice(0, 25)
      .map((field) => {
        const value = String(field?.value || "");
        return {
          id: String(field?.customId || ""),
          length: value.length,
          preview: summarizeDebugString(value.trim(), 40),
        };
      });
  }

  // buildInteractionDebugContext: handles build interaction debug context.
  function buildInteractionDebugContext(interaction, extra = {}) {
    const type =
      interaction && interaction.type !== undefined && interaction.type !== null
        ? Number(interaction.type)
        : null;
    const subcommandGroup = safeGetSubcommandGroup(interaction);
    const subcommand = safeGetSubcommand(interaction);
    return {
      interactionId: interaction?.id || null,
      interactionType: Number.isFinite(type) ? type : null,
      commandName: interaction?.commandName || null,
      subcommandGroup: subcommandGroup || null,
      subcommand: subcommand || null,
      customId: interaction?.customId || null,
      userId: interaction?.user?.id || null,
      guildId: interaction?.guildId || null,
      channelId: interaction?.channelId || null,
      deferred: Boolean(interaction?.deferred),
      replied: Boolean(interaction?.replied),
      ...extra,
    };
  }

  // logInteractionDebug: handles log interaction debug.
  function logInteractionDebug(event, message, interaction, extra = {}) {
    if (!logger || typeof logger.info !== "function") {
      return;
    }
    logger.info(event, message, buildInteractionDebugContext(interaction, extra));
  }

  // logInteractionFailure: handles log interaction failure.
  function logInteractionFailure(event, message, interaction, err, extra = {}) {
    const payload = buildInteractionDebugContext(interaction, {
      ...extra,
      error: err?.message || String(err || ""),
      stack: typeof err?.stack === "string" ? summarizeDebugString(err.stack, 4000) : null,
      options: summarizeCommandOptionsForDebug(interaction),
      values: Array.isArray(interaction?.values)
        ? interaction.values.slice(0, 10).map((value) => summarizeDebugString(value, 120))
        : [],
      modalFields: summarizeModalFieldsForDebug(interaction),
    });
    if (logger && typeof logger.error === "function") {
      logger.error(event, message, payload);
      return;
    }
    console.error(message, payload);
  }

  // Single entrypoint for all Discord interactions (slash commands, buttons, select menus, modals).
  return async function onInteractionCreate(interaction) {
    try {
      // refreshCommandsIfNeeded: handles refresh commands if needed.
      const refreshCommandsIfNeeded = () => {
        if (!refreshSlashCommandsForGuild || !interaction.guildId) {
          return;
        }
        refreshSlashCommandsForGuild(interaction.guildId).catch((err) => {
          if (logger) {
            logger.error(
              "slash_command_refresh_failed",
              "Failed refreshing slash commands after track/config update.",
              {
                guildId: interaction.guildId,
                error: err.message,
              }
            );
            return;
          }
          console.error("Failed refreshing slash commands:", err.message);
        });
      };

      // GUI flow: track picker for accepted-role assignment.
      if (interaction.isStringSelectMenu()) {
        const guiContext = parseAppRoleGuiCustomId(interaction.customId);
        if (!guiContext || guiContext.action !== APPROLE_GUI_ACTION_TRACK) {
          return;
        }

        logInteractionDebug(
          "accepted_roles_gui_track_select_received",
          "Received accepted-roles track select interaction.",
          interaction,
          {
            values: Array.isArray(interaction.values)
              ? interaction.values.slice(0, 5)
              : [],
          }
        );

        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "Accepted-roles GUI can only be used in a server.",
            ephemeral: true,
          });
          return;
        }

        if (guiContext.userId && guiContext.userId !== interaction.user.id) {
          await interaction.reply({
            content: "This accepted-roles panel was opened by another user.",
            ephemeral: true,
          });
          return;
        }

        if (!hasManageRolesConfigPermission(interaction.memberPermissions)) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles (or Administrator) to manage accepted roles.",
            ephemeral: true,
          });
          return;
        }

        const selectedTrack = normalizeTrackKey(interaction.values?.[0]);
        if (!selectedTrack) {
          await interaction.update({
            content:
              "Unknown track selected. Use `/track list` to view tracks or `/track add` to create one.",
            components: buildAppRoleGuiComponents(interaction.user.id),
          });
          return;
        }

        const currentRoleIds = getActiveApprovedRoleIds(selectedTrack);
        const currentRoleMentions =
          currentRoleIds.length > 0
            ? currentRoleIds.map((id) => `<@&${id}>`).join(", ")
            : "none";
        await interaction.update({
          content: [
            "🎛️ **Accepted Roles GUI**",
            `Track: **${getTrackLabel(selectedTrack)}**`,
            `Current accepted roles: ${currentRoleMentions}`,
            "Use the role selector below to replace this track's accepted roles (up to 5).",
          ].join("\n"),
          components: buildAppRoleGuiComponents(interaction.user.id, selectedTrack),
        });
        logInteractionDebug(
          "accepted_roles_gui_track_select_applied",
          "Accepted-roles GUI track selected.",
          interaction,
          {
            trackKey: selectedTrack,
            currentRoleCount: currentRoleIds.length,
          }
        );
        return;
      }

      // GUI flow: role picker updates accepted roles for the selected track.
      if (interaction.isRoleSelectMenu()) {
        const guiContext = parseAppRoleGuiCustomId(interaction.customId);
        if (!guiContext || guiContext.action !== APPROLE_GUI_ACTION_ROLES) {
          return;
        }

        logInteractionDebug(
          "accepted_roles_gui_role_select_received",
          "Received accepted-roles role select interaction.",
          interaction,
          {
            values: Array.isArray(interaction.values)
              ? interaction.values.slice(0, 5)
              : [],
            trackKey: guiContext.trackKey || null,
          }
        );

        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "Accepted-roles GUI can only be used in a server.",
            ephemeral: true,
          });
          return;
        }

        if (guiContext.userId && guiContext.userId !== interaction.user.id) {
          await interaction.reply({
            content: "This accepted-roles panel was opened by another user.",
            ephemeral: true,
          });
          return;
        }

        if (!hasManageRolesConfigPermission(interaction.memberPermissions)) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles (or Administrator) to manage accepted roles.",
            ephemeral: true,
          });
          return;
        }

        const selectedTrack = normalizeTrackKey(guiContext.trackKey);
        if (!selectedTrack) {
          await interaction.update({
            content: "Track context expired or invalid. Re-open `/set approlegui`.",
            components: buildAppRoleGuiComponents(interaction.user.id),
          });
          return;
        }

        const selectedRoleIds = parseRoleIdList(interaction.values || []);
        let roleUpdate;
        try {
          roleUpdate = setActiveApprovedRoles(selectedTrack, selectedRoleIds);
        } catch (err) {
          logInteractionFailure(
            "accepted_roles_gui_role_update_failed",
            "Failed updating accepted roles from GUI selector.",
            interaction,
            err,
            {
              trackKey: selectedTrack,
              selectedRoleIds,
            }
          );
          await interaction.reply({
            content: err?.message || "Failed updating accepted roles.",
            ephemeral: true,
          });
          return;
        }
        const currentRoleMentions =
          roleUpdate.roleIds.length > 0
            ? roleUpdate.roleIds.map((id) => `<@&${id}>`).join(", ")
            : "none";

        await interaction.update({
          content: [
            "✅ **Accepted Roles Updated**",
            `Track: **${getTrackLabel(selectedTrack)}**`,
            `Roles (${roleUpdate.roleIds.length}): ${currentRoleMentions}`,
            "Change track or role selection any time using the menus below.",
          ].join("\n"),
          components: buildAppRoleGuiComponents(interaction.user.id, selectedTrack),
        });

        await postConfigurationLog(interaction, "Accepted Roles Updated", [
          `**Track:** ${getTrackLabel(selectedTrack)}`,
          `**Roles (${roleUpdate.roleIds.length}):** ${currentRoleMentions}`,
          "**Source:** GUI panel",
        ]);
        logInteractionDebug(
          "accepted_roles_gui_role_update_applied",
          "Accepted roles updated from GUI selector.",
          interaction,
          {
            trackKey: selectedTrack,
            roleCount: roleUpdate.roleIds.length,
            roleIds: roleUpdate.roleIds,
          }
        );
        return;
      }

      // Button interactions include:
      // 1) reaction-role admin GUI controls
      // 2) public button-role toggles for members.
      if (interaction.isButton()) {
        const guiContext = parseReactionRoleGuiCustomId(interaction.customId);
        if (guiContext) {
          logInteractionDebug(
            "reaction_role_gui_button_received",
            "Received reaction-role GUI button interaction.",
            interaction,
            {
              action: guiContext.action || null,
            }
          );

          if (!interaction.inGuild()) {
            await interaction.reply({
              content: "Reaction role GUI can only be used in a server.",
              ephemeral: true,
            });
            return;
          }

          if (guiContext.userId && guiContext.userId !== interaction.user.id) {
            await interaction.reply({
              content: "This reaction role panel was opened by another user.",
              ephemeral: true,
            });
            return;
          }

          if (!hasManageRolesConfigPermission(interaction.memberPermissions)) {
            await interaction.reply({
              content:
                "You need both Manage Server and Manage Roles (or Administrator) to manage reaction roles.",
              ephemeral: true,
            });
            return;
          }

          if (guiContext.action === REACTION_ROLE_GUI_ACTION_ADD) {
            await interaction.showModal(buildReactionRoleAddModal(interaction.user.id));
            return;
          }

          if (guiContext.action === REACTION_ROLE_GUI_ACTION_REMOVE) {
            await interaction.showModal(buildReactionRoleRemoveModal(interaction.user.id));
            return;
          }

          return;
        }

        const reactionRoleButtonContext = parseReactionRoleButtonCustomId(interaction.customId);
        if (!reactionRoleButtonContext) {
          return;
        }

        logInteractionDebug(
          "reaction_role_button_toggle_received",
          "Received reaction-role panel button interaction.",
          interaction,
          {
            roleId: reactionRoleButtonContext.roleId,
            buttonGuildId: reactionRoleButtonContext.guildId,
          }
        );

        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button role panel can only be used in a server.",
            ephemeral: true,
          });
          return;
        }

        if (reactionRoleButtonContext.guildId !== interaction.guildId) {
          await interaction.reply({
            content: "This button role panel belongs to another server.",
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const roleId = reactionRoleButtonContext.roleId;
        const [me, member, role] = await Promise.all([
          guild.members.fetchMe().catch(() => null),
          guild.members.fetch(interaction.user.id).catch(() => null),
          guild.roles.fetch(roleId).catch(() => null),
        ]);

        if (!member) {
          await interaction.editReply("Could not resolve your member record in this server.");
          return;
        }
        if (!role) {
          await interaction.editReply("This role no longer exists.");
          return;
        }
        if (!me) {
          await interaction.editReply("I could not resolve my own member record.");
          return;
        }
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          await interaction.editReply("I need Manage Roles permission to change roles.");
          return;
        }
        if (role.managed || me.roles.highest.comparePositionTo(role) <= 0) {
          await interaction.editReply(
            `I cannot manage <@&${role.id}>. Move my top role above it and try again.`
          );
          return;
        }

        const hasRole = member.roles.cache.has(role.id);
        const action = hasRole ? "remove" : "add";
        const reason = `Reaction-role button ${action} on message ${interaction.message?.id || "unknown"}`;

        try {
          if (hasRole) {
            await member.roles.remove(role.id, reason);
          } else {
            await member.roles.add(role.id, reason);
          }
        } catch (err) {
          logInteractionFailure(
            "reaction_role_button_toggle_failed",
            "Failed applying reaction-role button toggle.",
            interaction,
            err,
            {
              roleId: role.id,
              action,
            }
          );
          await interaction.editReply(
            err?.message || "Failed toggling role. Check role hierarchy and permissions."
          );
          return;
        }

        await interaction.editReply(
          hasRole
            ? `Removed role <@&${role.id}>.`
            : `Added role <@&${role.id}>.`
        );
        logInteractionDebug(
          "reaction_role_button_toggle_applied",
          "Applied reaction-role panel button toggle.",
          interaction,
          {
            roleId: role.id,
            action,
          }
        );
        return;
      }

      // Modal submissions include applicant resolve modal + reaction-role GUI modals.
      if (interaction.isModalSubmit()) {
        const acceptResolveContext = parseAcceptResolveModalCustomId(interaction.customId);
        if (acceptResolveContext) {
          pruneExpiredAcceptResolvePrompts();
          const prompt = pendingAcceptResolvePrompts.get(acceptResolveContext.promptId);
          if (!prompt) {
            await interaction.reply({
              content:
                "This applicant-resolution prompt expired. Run `/accept` again to reopen the GUI prompt.",
              ephemeral: true,
            });
            return;
          }

          if (prompt.userId !== interaction.user.id) {
            await interaction.reply({
              content: "This applicant-resolution prompt was opened by another user.",
              ephemeral: true,
            });
            return;
          }

          if (!hasManageRolesConfigPermission(interaction.memberPermissions)) {
            await interaction.reply({
              content:
                "You need both Manage Server and Manage Roles (or Administrator) to use /accept or /deny.",
              ephemeral: true,
            });
            return;
          }

          const applicantHint = String(
            interaction.fields.getTextInputValue(ACCEPT_RESOLVE_MODAL_FIELD_APPLICANT) || ""
          ).trim();
          if (!applicantHint) {
            await interaction.reply({
              content: "Please provide an applicant username, @mention, or ID.",
              ephemeral: true,
            });
            return;
          }

          pendingAcceptResolvePrompts.delete(acceptResolveContext.promptId);

          const modalResult = await finalizeApplication(
            prompt.messageId,
            statusAccepted,
            "force_command",
            interaction.user.id,
            {
              reason: prompt.reason || "",
              allowMissingMemberAccept: prompt.acceptMode === "force",
              applicantResolverHints: [applicantHint],
            }
          );

          if (!modalResult.ok && modalResult.reason === "unknown_application") {
            await interaction.reply({
              content: "That application is no longer tracked.",
              ephemeral: true,
            });
            return;
          }

          if (!modalResult.ok && modalResult.reason === "already_decided") {
            await interaction.reply({
              content: `Already decided as **${modalResult.status}**.`,
              ephemeral: true,
            });
            return;
          }

          if (!modalResult.ok && modalResult.reason === "missing_member_not_in_guild") {
            await interaction.reply({
              content:
                "That user is not in this server. If you still want to accept, run `/accept` again and choose **mode:force**.",
              ephemeral: true,
            });
            return;
          }

          if (!modalResult.ok && modalResult.reason === "unresolved_applicant_user") {
            await interaction.reply({
              content:
                "Still could not resolve that applicant. Paste their numeric Discord user ID (right-click → Copy User ID with Developer Mode on).",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content:
              prompt.reason
                ? `Application accepted after GUI username resolve (mode: ${prompt.acceptMode}). Reason saved: ${prompt.reason}`
                : `Application accepted after GUI username resolve (mode: ${prompt.acceptMode}).`,
            ephemeral: true,
          });
          logInteractionDebug(
            "decision_command_modal_resolve_completed",
            "Application decision applied after applicant-resolution modal.",
            interaction,
            {
              decision: statusAccepted,
              messageId: prompt.messageId,
              acceptMode: prompt.acceptMode,
            }
          );
          return;
        }

        const guiContext = parseReactionRoleGuiCustomId(interaction.customId);
        if (!guiContext) {
          return;
        }

        logInteractionDebug(
          "reaction_role_gui_modal_received",
          "Received reaction-role GUI modal interaction.",
          interaction,
          {
            action: guiContext.action || null,
            modalFields: summarizeModalFieldsForDebug(interaction),
          }
        );

        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "Reaction role GUI can only be used in a server.",
            ephemeral: true,
          });
          return;
        }

        if (guiContext.userId && guiContext.userId !== interaction.user.id) {
          await interaction.reply({
            content: "This reaction role modal was opened by another user.",
            ephemeral: true,
          });
          return;
        }

        if (!hasManageRolesConfigPermission(interaction.memberPermissions)) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles (or Administrator) to manage reaction roles.",
            ephemeral: true,
          });
          return;
        }

        if (
          guiContext.action !== REACTION_ROLE_GUI_ACTION_MODAL_ADD &&
          guiContext.action !== REACTION_ROLE_GUI_ACTION_MODAL_REMOVE
        ) {
          return;
        }

        const messageId = String(interaction.fields.getTextInputValue("message_id") || "").trim();
        const emoji = String(interaction.fields.getTextInputValue("emoji") || "").trim();
        const channelIdInput = String(interaction.fields.getTextInputValue("channel_id") || "").trim();
        const targetChannel = await resolveReactionRoleTargetChannel(interaction, channelIdInput);

        if (!isSnowflake(messageId)) {
          await interaction.reply({
            content: "Please provide a valid message ID.",
            ephemeral: true,
          });
          return;
        }

        if (!isValidReactionRoleTargetChannel(targetChannel, interaction.guildId)) {
          await interaction.reply({
            content: "Please provide a valid text channel in this server.",
            ephemeral: true,
          });
          return;
        }

        if (guiContext.action === REACTION_ROLE_GUI_ACTION_MODAL_ADD) {
          const roleId = String(interaction.fields.getTextInputValue("role_id") || "").trim();
          if (!isSnowflake(roleId)) {
            await interaction.reply({
              content: "Please provide a valid role ID.",
              ephemeral: true,
            });
            return;
          }

          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            await interaction.reply({
              content: "Role not found in this server.",
              ephemeral: true,
            });
            return;
          }

          const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
          if (!targetMessage) {
            await interaction.reply({
              content: "Message not found in that channel.",
              ephemeral: true,
            });
            return;
          }

          let result;
          try {
            result = upsertReactionRoleBinding({
              guildId: interaction.guildId,
              channelId: targetChannel.id,
              messageId,
              roleId: role.id,
              emojiInput: emoji,
              actorId: interaction.user.id,
            });
          } catch (err) {
            logInteractionFailure(
              "reaction_role_modal_create_failed",
              "Failed creating reaction-role mapping from modal.",
              interaction,
              err,
              {
                action: guiContext.action,
                messageId,
                channelId: targetChannel.id,
                roleId: role.id,
                emoji,
              }
            );
            await interaction.reply({
              content: err.message || "Failed saving reaction role mapping.",
              ephemeral: true,
            });
            return;
          }

          const warningLines = [];
          try {
            const me = await interaction.guild.members.fetchMe();
            if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
              warningLines.push("I do not currently have Manage Roles permission.");
            } else {
              const fullRole = await interaction.guild.roles.fetch(role.id);
              if (fullRole && me.roles.highest.comparePositionTo(fullRole) <= 0) {
                warningLines.push(`My top role must be above <@&${role.id}> to assign it.`);
              }
              if (fullRole?.managed) {
                warningLines.push(`<@&${role.id}> is managed/integration and may not be assignable.`);
              }
            }
          } catch (err) {
            warningLines.push(`Could not fully validate role assignability (${err.message}).`);
          }

          if (typeof addReaction === "function") {
            try {
              await addReaction(
                targetChannel.id,
                messageId,
                result.emoji.reactionIdentifier
              );
            } catch (err) {
              warningLines.push(
                `Could not add reaction to message automatically (${err.message}).`
              );
            }
          }

          const statusLabel = result.created ? "created" : "updated";
          const lines = [
            `Reaction role ${statusLabel}: ${result.binding.emojiDisplay} -> <@&${role.id}>`,
            `Channel: <#${targetChannel.id}>`,
            `Message ID: \`${messageId}\``,
          ];
          if (warningLines.length > 0) {
            lines.push(`Warnings: ${warningLines.join(" ")}`);
          }

          await interaction.reply({
            content: lines.join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });

          await postConfigurationLog(interaction, "Reaction Role Updated", [
            `**Action:** ${statusLabel}`,
            `**Emoji:** ${result.binding.emojiDisplay}`,
            `**Role:** <@&${role.id}>`,
            `**Channel:** <#${targetChannel.id}>`,
            `**Message ID:** \`${messageId}\``,
          ]);
          logInteractionDebug(
            "reaction_role_modal_create_applied",
            "Reaction-role mapping created/updated from modal.",
            interaction,
            {
              action: guiContext.action,
              created: Boolean(result.created),
              channelId: targetChannel.id,
              messageId,
              roleId: role.id,
              emoji: result.binding.emojiDisplay,
            }
          );
          return;
        }

        let removal;
        try {
          removal = removeReactionRoleBinding({
            guildId: interaction.guildId,
            channelId: targetChannel.id,
            messageId,
            emojiInput: emoji,
          });
        } catch (err) {
          logInteractionFailure(
            "reaction_role_modal_remove_failed",
            "Failed removing reaction-role mapping from modal.",
            interaction,
            err,
            {
              action: guiContext.action,
              messageId,
              channelId: targetChannel.id,
              emoji,
            }
          );
          await interaction.reply({
            content: err.message || "Failed removing reaction role mapping.",
            ephemeral: true,
          });
          return;
        }

        if (!removal.removed) {
          await interaction.reply({
            content: "No matching reaction role mapping was found for that message and emoji.",
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });
          return;
        }

        await interaction.reply({
          content: [
            `Reaction role removed: ${removal.binding.emojiDisplay} -> <@&${removal.binding.roleId}>`,
            `Channel: <#${targetChannel.id}>`,
            `Message ID: \`${messageId}\``,
          ].join("\n"),
          ephemeral: true,
          components: buildReactionRoleGuiComponents(interaction.user.id),
        });

        await postConfigurationLog(interaction, "Reaction Role Removed", [
          `**Emoji:** ${removal.binding.emojiDisplay}`,
          `**Role:** <@&${removal.binding.roleId}>`,
          `**Channel:** <#${targetChannel.id}>`,
          `**Message ID:** \`${messageId}\``,
        ]);
        logInteractionDebug(
          "reaction_role_modal_remove_applied",
          "Reaction-role mapping removed from modal.",
          interaction,
          {
            action: guiContext.action,
            channelId: targetChannel.id,
            messageId,
            roleId: removal.binding.roleId,
            emoji: removal.binding.emojiDisplay,
          }
        );
        return;
      }

      if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused(true);
        const supportsTrackAutocomplete =
          focused?.name === "track" &&
          (interaction.commandName === "setapprole" ||
            interaction.commandName === "set" ||
            interaction.commandName === "useapprole" ||
            interaction.commandName === "setchannel" ||
            interaction.commandName === "debug" ||
            interaction.commandName === "track" ||
            interaction.commandName === "settings" ||
            interaction.commandName === "repostapps" ||
            interaction.commandName === "lookup");

        if (!supportsTrackAutocomplete) {
          await interaction.respond([]);
          return;
        }

        const query = String(focused.value || "").trim().toLowerCase();
        const tracks = getApplicationTracks()
          .map((track) => {
            const key = String(track?.key || "").trim();
            const label = String(track?.label || key).trim() || key;
            const aliases = Array.isArray(track?.aliases)
              ? track.aliases
                  .map((alias) => String(alias || "").trim().toLowerCase())
                  .filter(Boolean)
              : [];

            if (!key) {
              return null;
            }

            const keyLower = key.toLowerCase();
            const labelLower = label.toLowerCase();
            let score = 4;

            if (!query) {
              score = 0;
            } else if (keyLower === query || labelLower === query || aliases.includes(query)) {
              score = 0;
            } else if (
              keyLower.startsWith(query) ||
              labelLower.startsWith(query) ||
              aliases.some((alias) => alias.startsWith(query))
            ) {
              score = 1;
            } else if (
              keyLower.includes(query) ||
              labelLower.includes(query) ||
              aliases.some((alias) => alias.includes(query))
            ) {
              score = 2;
            }

            return {
              key,
              label,
              score,
            };
          })
          .filter(Boolean);

        const suggestions = tracks
          .filter((track) => track.score < 4)
          .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
          .slice(0, 25)
          .map((track) => ({
            name: `${track.label} (${track.key})`.slice(0, 100),
            value: track.key.slice(0, 100),
          }));

        if (suggestions.length > 0) {
          await interaction.respond(suggestions);
          return;
        }

        const fallback = tracks
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(0, 25)
          .map((track) => ({
            name: `${track.label} (${track.key})`.slice(0, 100),
            value: track.key.slice(0, 100),
          }));
        await interaction.respond(fallback);
        return;
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      const isAccept = interaction.commandName === "accept";
      const isDeny = interaction.commandName === "deny";
      const isReopen = interaction.commandName === "reopen";
      const isClose = interaction.commandName === "close";
      const isSetUnified = interaction.commandName === "set";
      const setSubcommandGroup = isSetUnified ? safeGetSubcommandGroup(interaction) : null;
      const setSubcommand = isSetUnified ? safeGetSubcommand(interaction) : null;
      const setCommandMode = isSetUnified
        ? String(
            (setSubcommandGroup === "channel" ? "channel" : setSubcommand) ||
              safeGetStringOptionFromInteraction(interaction, "mode") ||
              ""
          )
            .trim()
            .toLowerCase()
        : "";
      const setChannelMode =
        isSetUnified && setSubcommandGroup === "channel"
          ? String(setSubcommand || "")
              .trim()
              .toLowerCase()
          : "";
      const isSetDefault = isSetUnified && setCommandMode === "default";
      const isSetChannel =
        interaction.commandName === "setchannel" ||
        (isSetUnified && (setCommandMode === "channel" || Boolean(setChannelMode)));
      const isRepostApps = interaction.commandName === "repostapps";
      const isUseAppRole = interaction.commandName === "useapprole";
      const useAppRoleSubcommand = isUseAppRole ? safeGetSubcommand(interaction) : null;
      const isSetAppRole =
        interaction.commandName === "setapprole" ||
        (isSetUnified && setCommandMode === "approle") ||
        (isUseAppRole &&
          (useAppRoleSubcommand === "manage" || useAppRoleSubcommand === null));
      const isSetAppRoleGui =
        interaction.commandName === "setapprolegui" ||
        (isSetUnified && setCommandMode === "approlegui") ||
        (isUseAppRole && useAppRoleSubcommand === "gui");
      const isReactionRole =
        interaction.commandName === "reactionrole" || interaction.commandName === "rr";
      const isTrackCommand = interaction.commandName === "track";
      const isDashboard = interaction.commandName === "dashboard";
      const isUptime = interaction.commandName === "uptime";
      const isUnassignedRole = interaction.commandName === "unassignedrole";
      const isSettings = interaction.commandName === "settings";
      const isConfig = interaction.commandName === "config";
      const isMessageUnified =
        interaction.commandName === "message" || interaction.commandName === "msg";
      const messageSubcommand = isMessageUnified ? safeGetSubcommand(interaction) : null;
      const messageCommandMode = isMessageUnified
        ? String(
            messageSubcommand || safeGetStringOptionFromInteraction(interaction, "mode") || ""
          )
            .trim()
            .toLowerCase()
        : "";
      const isSetDenyMsg =
        interaction.commandName === "setdenymsg" ||
        (isSetUnified && setCommandMode === "denymsg");
      const isSetAcceptMsg =
        interaction.commandName === "setacceptmsg" ||
        interaction.commandName === "setaccept" ||
        (isSetUnified && setCommandMode === "acceptmsg");
      const isStructuredMsg = isMessageUnified && messageCommandMode === "structured";
      const isEmbedMsg = isMessageUnified && messageCommandMode === "embed";
      const isEmbedEdit = isMessageUnified && messageCommandMode === "edit";
      const isBug = interaction.commandName === "bug";
      const isSuggestions =
        interaction.commandName === "suggestions" ||
        interaction.commandName === "suggestion";
      const isDebug = interaction.commandName === "debug";
      const isStop = interaction.commandName === "stop";
      const isRestart = interaction.commandName === "restart";
      const isLookup = interaction.commandName === "lookup";
      if (
        !isAccept &&
        !isDeny &&
        !isReopen &&
        !isClose &&
        !isSetUnified &&
        !isSetChannel &&
        !isRepostApps &&
        !isSetAppRole &&
        !isSetAppRoleGui &&
        !isReactionRole &&
        !isTrackCommand &&
        !isDashboard &&
        !isUptime &&
        !isUnassignedRole &&
        !isSettings &&
        !isConfig &&
        !isMessageUnified &&
        !isSetDenyMsg &&
        !isSetAcceptMsg &&
        !isStructuredMsg &&
        !isEmbedMsg &&
        !isEmbedEdit &&
        !isBug &&
        !isSuggestions &&
        !isDebug &&
        !isStop &&
        !isRestart &&
        !isLookup
      ) {
        return;
      }

      logInteractionDebug(
        "interaction_command_received",
        "Received slash command interaction.",
        interaction,
        {
          options: summarizeCommandOptionsForDebug(interaction),
        }
      );

      if (isUptime) {
        await interaction.reply({
          content: buildUptimeMessage(),
          ephemeral: true,
        });
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
      const canManageRolesConfig = hasManageRolesConfigPermission(memberPerms);
      const validSetModes = new Set([
        "channel",
        "default",
        "approle",
        "approlegui",
        "denymsg",
        "acceptmsg",
      ]);
      const validMessageModes = new Set(["structured", "embed", "edit"]);

      if (isSetUnified && !validSetModes.has(setCommandMode)) {
        await interaction.reply({
          content:
            "Unknown `/set` action. Use one of: `channel`, `default`, `approle`, `approlegui`, `denymsg`, `acceptmsg`.",
          ephemeral: true,
        });
        return;
      }
      if (isMessageUnified && !validMessageModes.has(messageCommandMode)) {
        await interaction.reply({
          content: "Unknown `/message`/`/msg` action. Use one of: `structured`, `embed`, `edit`.",
          ephemeral: true,
        });
        return;
      }

      if (isUnassignedRole) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /unassignedrole.",
            ephemeral: true,
          });
          return;
        }

        const limitInput = interaction.options.getInteger("limit");
        await interaction.reply({
          content: buildUnassignedRoleMessage({
            limit: limitInput === null ? undefined : limitInput,
          }),
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }

      if (isBug) {
        await relayFeedbackCommand({
          interaction,
          commandLabel: "Bug Report",
          heading: "🐞 **Bug Report**",
          channelId: getActiveBugChannelId(),
          emptyChannelMessage:
            "Bug channel is not configured. Run `/set channel bug channel:#channel` first.",
        });
        return;
      }

      if (isSuggestions) {
        await relayFeedbackCommand({
          interaction,
          commandLabel: "Suggestion",
          heading: "💡 **Suggestion**",
          channelId: getActiveSuggestionsChannelId(),
          emptyChannelMessage:
            "Suggestions channel is not configured. Run `/set channel suggestions channel:#channel` first.",
        });
        return;
      }

      if (isDashboard) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /dashboard.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: buildDashboardMessage(),
          ephemeral: true,
        });
        return;
      }

      if (isRepostApps) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /repostapps.",
            ephemeral: true,
          });
          return;
        }

        const trackInput = interaction.options.getString("track");
        const limitInput = interaction.options.getInteger("limit");
        await interaction.deferReply({ ephemeral: true });

        let result;
        try {
          result = await repostTrackedApplications({
            trackKey: trackInput === null ? undefined : trackInput,
            limit: limitInput === null ? undefined : limitInput,
          });
        } catch (err) {
          await interaction.editReply({
            content: err?.message || "Failed reposting tracked applications.",
          });
          return;
        }

        const summaryLines = [
          "♻️ Repost run completed.",
          `Matched: ${result.matched}`,
          `Attempted: ${result.attempted}`,
          `Reposted: ${result.reposted}`,
          `Failed: ${result.failed}`,
        ];
        if (result.trackLabel) {
          summaryLines.push(`Track filter: ${result.trackLabel}`);
        }
        if (Number.isInteger(result.limit) && result.limit > 0) {
          summaryLines.push(`Limit: ${result.limit}`);
        }
        if (Array.isArray(result.missingRows) && result.missingRows.length > 0) {
          summaryLines.push(`Missing sheet rows: ${result.missingRows.slice(0, 10).join(", ")}`);
        }
        if (result.firstError) {
          summaryLines.push(`First error: ${result.firstError}`);
        }

        await interaction.editReply({
          content: summaryLines.join("\n"),
        });
        await postConfigurationLog(interaction, "Applications Reposted", [
          `**Matched:** ${result.matched}`,
          `**Attempted:** ${result.attempted}`,
          `**Reposted:** ${result.reposted}`,
          `**Failed:** ${result.failed}`,
          `**Track Filter:** ${result.trackLabel || "none"}`,
          `**Limit:** ${Number.isInteger(result.limit) && result.limit > 0 ? result.limit : "none"}`,
          `**Missing Rows:** ${
            Array.isArray(result.missingRows) && result.missingRows.length > 0
              ? result.missingRows.slice(0, 20).join(", ")
              : "none"
          }`,
        ]);
        logInteractionDebug(
          "repostapps_command_completed",
          "Reposted tracked applications in row order.",
          interaction,
          {
            matched: result.matched,
            attempted: result.attempted,
            reposted: result.reposted,
            failed: result.failed,
            limit: result.limit || null,
            trackLabel: result.trackLabel || null,
          }
        );
        return;
      }

      if (isSettings) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /settings.",
            ephemeral: true,
          });
          return;
        }

        const settingsAction = String(
          safeGetSubcommand(interaction) ||
            safeGetStringOptionFromInteraction(interaction, "action") ||
            ""
        )
          .trim()
          .toLowerCase();
        logInteractionDebug(
          "settings_command_received",
          "Processing settings command.",
          interaction,
          {
            action: settingsAction,
          }
        );
        if (settingsAction === "show") {
          await interaction.reply({
            content: buildSettingsMessage(),
            ephemeral: true,
          });
          logInteractionDebug(
            "settings_show_completed",
            "Returned settings summary.",
            interaction,
            {
              action: settingsAction,
            }
          );
          return;
        }

        if (settingsAction === "vote") {
          const track = interaction.options.getString("track");
          const numerator = interaction.options.getInteger("numerator");
          const denominator = interaction.options.getInteger("denominator");
          const minimumVotes = interaction.options.getInteger("minimum_votes");
          const rawDeadlineHours = interaction.options.getInteger("deadline_hours");
          if (track === null || numerator === null || denominator === null) {
            await interaction.reply({
              content: "For `/settings vote`, provide `track`, `numerator`, and `denominator`.",
              ephemeral: true,
            });
            return;
          }

          // Build update object — only include deadlineHours if the option was explicitly provided.
          // rawDeadlineHours === null means option was not provided (keep existing).
          // rawDeadlineHours === 0 means disable.
          const voteRuleUpdate = { numerator, denominator, minimumVotes };
          if (rawDeadlineHours !== null) {
            voteRuleUpdate.deadlineHours = rawDeadlineHours === 0 ? null : rawDeadlineHours;
          }

          let update;
          try {
            update = setTrackVoteRule(track, voteRuleUpdate);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed updating vote settings.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: `${update.trackLabel} vote rule set to ${formatVoteRule(update.voteRule)}.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Vote Rule Updated", [
            `**Track:** ${update.trackLabel}`,
            `**Rule:** ${formatVoteRule(update.voteRule)}`,
          ]);
          logInteractionDebug(
            "settings_vote_updated",
            "Updated settings vote rule.",
            interaction,
            {
              action: settingsAction,
              trackLabel: update.trackLabel,
            }
          );
          return;
        }

        if (settingsAction === "reminders") {
          const enabled = interaction.options.getBoolean("enabled");
          const thresholdHours = interaction.options.getNumber("threshold_hours");
          const repeatHours = interaction.options.getNumber("repeat_hours");
          if (
            enabled === null &&
            thresholdHours === null &&
            repeatHours === null
          ) {
            await interaction.reply({
              content: "Provide at least one option (`enabled`, `threshold_hours`, or `repeat_hours`).",
              ephemeral: true,
            });
            return;
          }

          const next = setReminderConfiguration({
            enabled: enabled === null ? undefined : enabled,
            thresholdHours: thresholdHours === null ? undefined : thresholdHours,
            repeatHours: repeatHours === null ? undefined : repeatHours,
          });
          await interaction.reply({
            content: `Reminders ${next.enabled ? "enabled" : "disabled"} (threshold=${next.thresholdHours}h, repeat=${next.repeatHours}h).`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Reminder Settings Updated", [
            `**Enabled:** ${next.enabled ? "yes" : "no"}`,
            `**Threshold:** ${next.thresholdHours}h`,
            `**Repeat:** ${next.repeatHours}h`,
          ]);
          logInteractionDebug(
            "settings_reminders_updated",
            "Updated reminder settings.",
            interaction,
            {
              action: settingsAction,
              enabled: next.enabled,
              thresholdHours: next.thresholdHours,
              repeatHours: next.repeatHours,
            }
          );
          return;
        }

        if (settingsAction === "reviewers") {
          const track = interaction.options.getString("track");
          const mentions = interaction.options.getString("mentions");
          if (track === null || mentions === null) {
            await interaction.reply({
              content: "For `/settings reviewers`, provide `track` and `mentions`.",
              ephemeral: true,
            });
            return;
          }
          let config;
          let normalizedTrack = null;
          try {
            normalizedTrack = normalizeTrackKey(track);
            config = setTrackReviewerMentions(track, mentions);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed updating reviewers.",
              ephemeral: true,
            });
            return;
          }

          const trackLabel = getTrackLabel(normalizedTrack);
          const userMentions = (config.userIds || []).map((id) => `<@${id}>`);
          const roleMentions = (config.roleIds || []).map((id) => `<@&${id}>`);
          const summary = [...userMentions, ...roleMentions];
          await interaction.reply({
            content: `${trackLabel} reviewers set to: ${summary.length > 0 ? summary.join(", ") : "none"}.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Reviewer Rotation Updated", [
            `**Track:** ${trackLabel}`,
            `**Reviewers:** ${summary.length > 0 ? summary.join(", ") : "none"}`,
          ]);
          logInteractionDebug(
            "settings_reviewers_updated",
            "Updated reviewer rotation settings.",
            interaction,
            {
              action: settingsAction,
              trackLabel,
              reviewerCount: summary.length,
            }
          );
          return;
        }

        if (settingsAction === "voters") {
          const track = interaction.options.getString("track");
          const roles = interaction.options.getString("roles");
          if (track === null || roles === null) {
            await interaction.reply({
              content: "For `/settings voters`, provide `track` and `roles`.",
              ephemeral: true,
            });
            return;
          }
          let update;
          try {
            update = setTrackVoterRoles(track, roles);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed updating voter roles.",
              ephemeral: true,
            });
            return;
          }

          const summary = Array.isArray(update.roleIds)
            ? update.roleIds.map((id) => `<@&${id}>`)
            : [];
          await interaction.reply({
            content: `${update.trackLabel} vote-eligible roles set to: ${summary.length > 0 ? summary.join(", ") : "any channel member"}.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Vote Voter Roles Updated", [
            `**Track:** ${update.trackLabel}`,
            `**Vote-Eligible Roles:** ${
              summary.length > 0 ? summary.join(", ") : "any channel member"
            }`,
          ]);
          logInteractionDebug(
            "settings_voters_updated",
            "Updated vote-eligible role filter.",
            interaction,
            {
              action: settingsAction,
              trackLabel: update.trackLabel,
              roleCount: summary.length,
            }
          );
          return;
        }

        if (settingsAction === "digest") {
          const enabled = interaction.options.getBoolean("enabled");
          const hourUtc = interaction.options.getInteger("hour_utc");
          if (enabled === null && hourUtc === null) {
            await interaction.reply({
              content: "Provide `enabled`, `hour_utc`, or both.",
              ephemeral: true,
            });
            return;
          }
          const next = setDailyDigestConfiguration({
            enabled: enabled === null ? undefined : enabled,
            hourUtc: hourUtc === null ? undefined : hourUtc,
          });
          await interaction.reply({
            content: `Daily digest ${next.enabled ? "enabled" : "disabled"} at ${next.hourUtc}:00 UTC.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Daily Digest Updated", [
            `**Enabled:** ${next.enabled ? "yes" : "no"}`,
            `**Hour (UTC):** ${next.hourUtc}`,
          ]);
          logInteractionDebug(
            "settings_digest_updated",
            "Updated daily digest settings.",
            interaction,
            {
              action: settingsAction,
              enabled: next.enabled,
              hourUtc: next.hourUtc,
            }
          );
          return;
        }

        if (settingsAction === "sheets") {
          const spreadsheetId = interaction.options.getString("spreadsheet_id");
          const sheetName = interaction.options.getString("sheet_name");
          const reset = interaction.options.getBoolean("reset") === true;
          if (!reset && spreadsheetId === null && sheetName === null) {
            await interaction.reply({
              content: "Provide `spreadsheet_id`, `sheet_name`, or `reset:true`.",
              ephemeral: true,
            });
            return;
          }
          let update;
          try {
            update = setSheetSourceConfiguration({
              spreadsheetId: spreadsheetId === null ? undefined : spreadsheetId,
              sheetName: sheetName === null ? undefined : sheetName,
              reset,
            });
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed updating sheet source settings.",
              ephemeral: true,
            });
            return;
          }

          const effective = update.effective;
          await interaction.reply({
            content: `Sheet source set to spreadsheet_id=${effective.spreadsheetId} (${effective.spreadsheetIdSource}), sheet_name=${effective.sheetName} (${effective.sheetNameSource}).`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Sheet Source Updated", [
            `**Spreadsheet ID:** ${effective.spreadsheetId} (${effective.spreadsheetIdSource})`,
            `**Sheet Name:** ${effective.sheetName} (${effective.sheetNameSource})`,
          ]);
          logInteractionDebug(
            "settings_sheets_updated",
            "Updated sheet source settings.",
            interaction,
            {
              action: settingsAction,
              spreadsheetIdSource: effective.spreadsheetIdSource,
              sheetNameSource: effective.sheetNameSource,
            }
          );
          return;
        }

        if (settingsAction === "missingusermsg") {
          const message = interaction.options.getString("message");
          if (message === null) {
            await interaction.reply({
              content: "For `/settings missingusermsg`, provide `message`.",
              ephemeral: true,
            });
            return;
          }
          let updatedMessage;
          try {
            updatedMessage = setApplicantMissingDiscordThreadNoticeMessage(message);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed updating missing-user thread notice message.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: `Missing-user thread notice message updated.\nMessage: ${updatedMessage}`,
            ephemeral: true,
            allowedMentions: { parse: [] },
          });
          await postConfigurationLog(interaction, "Missing-User Thread Notice Updated", [
            `**Message:** \`${updatedMessage}\``,
          ]);
          logInteractionDebug(
            "settings_missing_user_notice_updated",
            "Updated missing-user thread notice message.",
            interaction,
            {
              action: settingsAction,
              length: updatedMessage.length,
            }
          );
          return;
        }

        if (settingsAction === "export") {
          const payload = exportAdminConfig();
          try {
            await sendDebugDm(interaction.user, payload);
          } catch {
            await interaction.reply({
              content: "Could not DM you the config export. Enable DMs and try again.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: "Config export sent to your DMs as JSON.",
            ephemeral: true,
          });
          logInteractionDebug(
            "settings_export_completed",
            "Exported configuration via /settings.",
            interaction,
            {
              action: settingsAction,
              payloadLength: typeof payload === "string" ? payload.length : null,
            }
          );
          return;
        }

        if (settingsAction === "import") {
          const rawJson = interaction.options.getString("json");
          if (rawJson === null) {
            await interaction.reply({
              content: "For `/settings import`, provide `json`.",
              ephemeral: true,
            });
            return;
          }
          let result;
          try {
            result = importAdminConfig(rawJson);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed importing config.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: `Config imported. Tracks: ${result.trackCount}, custom tracks: ${result.customTrackCount}.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Config Imported", [
            `**Tracks:** ${result.trackCount}`,
            `**Custom Tracks:** ${result.customTrackCount}`,
            "**Source:** /settings import",
          ]);
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "settings_import_completed",
            "Imported configuration JSON via /settings.",
            interaction,
            {
              action: settingsAction,
              trackCount: result.trackCount,
              customTrackCount: result.customTrackCount,
            }
          );
          return;
        }

        await interaction.reply({
          content:
            "Unknown `/settings` action. Use one of: `show`, `vote`, `reminders`, `reviewers`, `voters`, `digest`, `sheets`, `missingusermsg`, `export`, `import`.",
          ephemeral: true,
        });
        return;
      }

      if (isConfig) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /config.",
            ephemeral: true,
          });
          return;
        }

        const subcommand = interaction.options.getSubcommand(true);
        logInteractionDebug(
          "config_command_received",
          "Processing config command.",
          interaction,
          {
            subcommand,
          }
        );
        if (subcommand === "export") {
          const payload = exportAdminConfig();
          try {
            await sendDebugDm(interaction.user, payload);
          } catch {
            await interaction.reply({
              content: "Could not DM you the config export. Enable DMs and try again.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: "Config export sent to your DMs as JSON.",
            ephemeral: true,
          });
          logInteractionDebug(
            "config_export_completed",
            "Exported configuration via DM.",
            interaction,
            {
              subcommand,
              payloadLength: typeof payload === "string" ? payload.length : null,
            }
          );
          return;
        }

        if (subcommand === "import") {
          const rawJson = interaction.options.getString("json", true);
          let result;
          try {
            result = importAdminConfig(rawJson);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed importing config.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: `Config imported. Tracks: ${result.trackCount}, custom tracks: ${result.customTrackCount}.`,
            ephemeral: true,
          });
          await postConfigurationLog(interaction, "Config Imported", [
            `**Tracks:** ${result.trackCount}`,
            `**Custom Tracks:** ${result.customTrackCount}`,
          ]);
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "config_import_completed",
            "Imported configuration JSON.",
            interaction,
            {
              subcommand,
              trackCount: result.trackCount,
              customTrackCount: result.customTrackCount,
            }
          );
          return;
        }

        await interaction.reply({
          content: `Unknown config action: ${subcommand}`,
          ephemeral: true,
        });
        return;
      }

      if (isTrackCommand) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to manage tracks.",
            ephemeral: true,
          });
          return;
        }

        // Handle /track questions subcommand group
        const trackSubGroup = safeGetSubcommandGroup(interaction);
        if (trackSubGroup === "questions") {
          const qAction = safeGetSubcommand(interaction);
          const trackKey = interaction.options.getString("track", true);
          const normalizedTrackForQ = normalizeTrackKey(trackKey) || trackKey;

          if (qAction === "list") {
            const questions = getTrackCustomQuestions(normalizedTrackForQ);
            if (questions.length === 0) {
              await interaction.reply({
                content: `No custom questions for track \`${normalizedTrackForQ}\`.`,
                ephemeral: true,
              });
              return;
            }
            const lines = questions.map((q, i) =>
              `${i + 1}. \`${q.id}\` — ${q.label} [${q.type}${q.required ? ", required" : ""}]`
            );
            await interaction.reply({
              content: `**Custom questions for \`${normalizedTrackForQ}\`:**\n${lines.join("\n")}`,
              ephemeral: true,
            });
            return;
          }

          if (qAction === "add") {
            const label = interaction.options.getString("label", true);
            const type = interaction.options.getString("type") || "text";
            const required = interaction.options.getBoolean("required") ?? false;
            const optionsRaw = interaction.options.getString("options") || "";
            const placeholder = interaction.options.getString("placeholder") || "";

            // Generate id from label
            const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "question";
            const optArr = optionsRaw
              ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
              : [];

            try {
              addTrackCustomQuestion(normalizedTrackForQ, {
                id,
                label,
                sheetHeader: label,
                type: ["textarea", "select"].includes(type) ? type : "text",
                required,
                options: optArr,
                placeholder,
              });
              await interaction.reply({
                content: `Question added to \`${normalizedTrackForQ}\`: **${label}** (id: \`${id}\`, type: ${type})`,
                ephemeral: true,
              });
            } catch (err) {
              await interaction.reply({ content: err.message || "Failed adding question.", ephemeral: true });
            }
            return;
          }

          if (qAction === "remove") {
            const questionId = interaction.options.getString("id", true);
            try {
              removeTrackCustomQuestion(normalizedTrackForQ, questionId);
              await interaction.reply({
                content: `Question \`${questionId}\` removed from \`${normalizedTrackForQ}\`.`,
                ephemeral: true,
              });
            } catch (err) {
              await interaction.reply({ content: err.message || "Failed removing question.", ephemeral: true });
            }
            return;
          }

          if (qAction === "reset") {
            resetTrackCustomQuestions(normalizedTrackForQ);
            await interaction.reply({
              content: `All custom questions cleared for \`${normalizedTrackForQ}\`.`,
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({ content: `Unknown questions action: ${qAction}`, ephemeral: true });
          return;
        }

        const action = String(
          safeGetSubcommand(interaction) || interaction.options.getString("mode") || ""
        )
          .trim()
          .toLowerCase();
        logInteractionDebug(
          "track_command_received",
          "Processing track command.",
          interaction,
          {
            action,
          }
        );
        if (action === "list") {
          const tracks = getApplicationTracks();
          const customTrackKeys = new Set(getCustomTracksSnapshot().map((track) => track.key));
          const lines = tracks.map((track) => {
            const aliases = Array.isArray(track.aliases) ? track.aliases.filter(Boolean) : [];
            const scope = customTrackKeys.has(track.key) ? "custom" : "built-in";
            return `- \`${track.key}\` (${track.label}) [${scope}] aliases: ${
              aliases.length > 0 ? aliases.join(", ") : "none"
            }`;
          });
          await interaction.reply({
            content: lines.length > 0 ? lines.join("\n") : "No tracks configured.",
            ephemeral: true,
          });
          logInteractionDebug(
            "track_list_completed",
            "Returned track list.",
            interaction,
            {
              trackCount: tracks.length,
            }
          );
          return;
        }

        if (action === "add") {
          const name = interaction.options.getString("name", true);
          const key = interaction.options.getString("key");
          const aliases = interaction.options.getString("aliases");
          let result;
          try {
            result = upsertCustomTrack({ name, key, aliases });
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed creating track.",
              ephemeral: true,
            });
            return;
          }

          const aliasText =
            result.track.aliases.length > 0 ? result.track.aliases.join(", ") : "none";
          const statusLabel = result.created ? "created" : "updated";
          await interaction.reply({
            content: `Track ${statusLabel}: \`${result.track.key}\` (${result.track.label}). Aliases: ${aliasText}`,
            ephemeral: true,
          });

          await postConfigurationLog(interaction, "Track Updated", [
            `**Track:** ${result.track.label} (\`${result.track.key}\`)`,
            `**Status:** ${statusLabel}`,
            `**Aliases:** ${aliasText}`,
          ]);
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "track_add_completed",
            "Created/updated track.",
            interaction,
            {
              action,
              trackKey: result.track.key,
              created: Boolean(result.created),
            }
          );
          return;
        }

        if (action === "edit") {
          const track = interaction.options.getString("track", true);
          const name = interaction.options.getString("name");
          const aliases = interaction.options.getString("aliases");
          if (!name && !aliases) {
            await interaction.reply({
              content: "Provide `name`, `aliases`, or both.",
              ephemeral: true,
            });
            return;
          }

          let result;
          try {
            result = editCustomTrack({ track, name, aliases });
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed editing track.",
              ephemeral: true,
            });
            return;
          }

          const aliasText =
            result.track.aliases.length > 0 ? result.track.aliases.join(", ") : "none";
          await interaction.reply({
            content: `Track updated: \`${result.track.key}\` (${result.track.label}). Aliases: ${aliasText}`,
            ephemeral: true,
          });

          await postConfigurationLog(interaction, "Track Updated", [
            `**Track:** ${result.track.label} (\`${result.track.key}\`)`,
            "**Status:** edited",
            `**Aliases:** ${aliasText}`,
          ]);
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "track_edit_completed",
            "Edited track.",
            interaction,
            {
              action,
              trackKey: result.track.key,
            }
          );
          return;
        }

        if (action === "remove") {
          const track = interaction.options.getString("track", true);
          let removed;
          try {
            removed = removeCustomTrack(track);
          } catch (err) {
            await interaction.reply({
              content: err.message || "Failed removing track.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: `Track removed: \`${removed.key}\` (${removed.label}).`,
            ephemeral: true,
          });

          await postConfigurationLog(interaction, "Track Removed", [
            `**Track:** ${removed.label} (\`${removed.key}\`)`,
          ]);
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "track_remove_completed",
            "Removed track.",
            interaction,
            {
              action,
              trackKey: removed.key,
            }
          );
          return;
        }

        await interaction.reply({
          content: `Unknown track action: ${action}`,
          ephemeral: true,
        });
        return;
      }

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
          interaction.options.getString("mode", true) || debugModeReport;

        let dmText = "";
        let confirmText = "Debug result sent to your DMs.";

        if (mode === debugModeReport) {
          const report = await buildDebugReport(interaction);
          dmText = [`🧪 Debug Report`, `Requested by: ${userDisplayName(interaction.user)}`, "", report].join(
            "\n"
          );
        } else if (mode === debugModePostTest) {
          let result;
          try {
            result = await runDebugPostTest(interaction);
          } catch (err) {
            await interaction.editReply({
              content: err?.message || "Debug post test failed.",
            });
            return;
          }
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
          mode === debugModeAcceptTest ||
          mode === debugModeDenyTest
        ) {
          if (!canForceDecision) {
            await interaction.editReply({
              content:
                "Debug accept/deny tests require both Manage Server and Manage Roles permissions (or Administrator).",
            });
            return;
          }

          const decision =
            mode === debugModeAcceptTest ? statusAccepted : statusDenied;
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
        } catch {
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
        logInteractionDebug(
          "setdenymsg_completed",
          "Updated deny DM template.",
          interaction,
          {
            templateLength: message.length,
          }
        );
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
              "Provide `channel`, `message`, or both. Example: `/set acceptmsg message:Welcome to {track} team...`",
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
            "Accepted announcement template updated. Placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{role_result}`, `{reason}`, `{decided_at}`."
          );
        }

        await interaction.reply({
          content: lines.join("\n"),
          ephemeral: true,
        });
        logInteractionDebug(
          "setacceptmsg_completed",
          "Updated accepted announcement settings.",
          interaction,
          {
            hasChannelUpdate: Boolean(channel),
            hasTemplateUpdate: Boolean(trimmedMessage),
            activeChannelId: activeChannelId || null,
          }
        );
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

        const channelInput = interaction.options.getChannel("channel");
        const targetChannel = channelInput || interaction.channel;
        if (
          !targetChannel ||
          !targetChannel.isTextBased() ||
          typeof targetChannel.send !== "function"
        ) {
          await interaction.reply({
            content: "Run this command in a text channel.",
            ephemeral: true,
          });
          return;
        }
        if (interaction.guildId && targetChannel.guildId !== interaction.guildId) {
          await interaction.reply({
            content: "The selected channel must be in this server.",
            ephemeral: true,
          });
          return;
        }

        const titleRaw = interaction.options.getString("title");
        const line1Raw = interaction.options.getString("line_1");
        const title = String(titleRaw || "").trim();
        if (!title || !String(line1Raw || "").trim()) {
          await interaction.reply({
            content: isMessageUnified
              ? "For `/message structured`, provide at least `title` and `line_1`."
              : "Please provide both `title` and `line_1`.",
            ephemeral: true,
          });
          return;
        }
        const rawLines = [
          line1Raw,
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
              ...lines,
            ];
        const content = contentLines.join("\n");

        await sendChannelMessage(targetChannel.id, content, { parse: [] });
        await interaction.reply({
          content: `Structured message posted in <#${targetChannel.id}>.`,
          ephemeral: true,
        });
        logInteractionDebug(
          "structured_message_posted",
          "Posted structured message.",
          interaction,
          {
            channelId: targetChannel.id,
            lineCount: lines.length,
            usedCodeBlock: useCodeBlock,
          }
        );
        return;
      }

      if (isEmbedMsg) {
        if (!canManageServer) {
          await interaction.reply({
            content:
              "You need Manage Server permission (or Administrator) to run this command.",
            ephemeral: true,
          });
          return;
        }

        const channelInput = interaction.options.getChannel("channel");
        const targetChannel = channelInput || interaction.channel;
        if (
          !targetChannel ||
          !targetChannel.isTextBased() ||
          typeof targetChannel.send !== "function"
        ) {
          await interaction.reply({
            content: "Please choose a valid text channel.",
            ephemeral: true,
          });
          return;
        }
        if (interaction.guildId && targetChannel.guildId !== interaction.guildId) {
          await interaction.reply({
            content: "The selected channel must be in this server.",
            ephemeral: true,
          });
          return;
        }

        const title = String(interaction.options.getString("title") || "").trim();
        const description = String(interaction.options.getString("description") || "").trim();
        if (!title || !description) {
          await interaction.reply({
            content: isMessageUnified
              ? "For `/message embed`, provide both `title` and `description`."
              : "Please provide both title and description.",
            ephemeral: true,
          });
          return;
        }

        const colorInput = interaction.options.getString("color");
        const color = colorInput ? parseEmbedColor(colorInput) : null;
        if (colorInput && color === null) {
          await interaction.reply({
            content: "Invalid `color`. Use 6-digit hex like `#57F287`.",
            ephemeral: true,
          });
          return;
        }

        const footerText = String(interaction.options.getString("footer") || "").trim();
        const includeTimestamp = Boolean(interaction.options.getBoolean("timestamp"));

        const embed = {
          title: title.slice(0, 256),
          description: description.slice(0, 4096),
        };
        if (color !== null) {
          embed.color = color;
        }
        if (footerText) {
          embed.footer = {
            text: footerText.slice(0, 2048),
          };
        }
        if (includeTimestamp) {
          embed.timestamp = new Date().toISOString();
        }

        await sendChannelMessage(targetChannel.id, {
          embeds: [embed],
          allowedMentions: { parse: [] },
        });

        await interaction.reply({
          content: `Embedded message posted in <#${targetChannel.id}>.`,
          ephemeral: true,
        });
        logInteractionDebug(
          "embed_message_posted",
          "Posted embedded message.",
          interaction,
          {
            channelId: targetChannel.id,
            includeTimestamp,
            hasFooter: Boolean(footerText),
            hasColor: color !== null,
          }
        );
        return;
      }

      if (isEmbedEdit) {
        if (!canManageServer) {
          await interaction.reply({
            content:
              "You need Manage Server permission (or Administrator) to run this command.",
            ephemeral: true,
          });
          return;
        }

        const channelInput = interaction.options.getChannel("channel");
        const targetChannel = channelInput || interaction.channel;
        if (
          !targetChannel ||
          !targetChannel.isTextBased() ||
          typeof targetChannel.messages?.fetch !== "function"
        ) {
          await interaction.reply({
            content: "Please choose a valid text channel.",
            ephemeral: true,
          });
          return;
        }
        if (interaction.guildId && targetChannel.guildId !== interaction.guildId) {
          await interaction.reply({
            content: "The selected channel must be in this server.",
            ephemeral: true,
          });
          return;
        }

        const messageId = String(interaction.options.getString("message_id") || "").trim();
        if (!isSnowflake(messageId)) {
          await interaction.reply({
            content: isMessageUnified
              ? "For `/message edit`, provide a valid `message_id`."
              : "Please provide a valid `message_id`.",
            ephemeral: true,
          });
          return;
        }

        const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
        if (!targetMessage) {
          await interaction.reply({
            content: "Message not found in that channel.",
            ephemeral: true,
          });
          return;
        }

        if (!targetMessage.author || targetMessage.author.id !== interaction.client.user?.id) {
          await interaction.reply({
            content: "I can only edit embeds on messages posted by this bot.",
            ephemeral: true,
          });
          return;
        }

        const titleInput = interaction.options.getString("title");
        const descriptionInput = interaction.options.getString("description");
        const colorInput = interaction.options.getString("color");
        const footerInput = interaction.options.getString("footer");
        const timestampInput = interaction.options.getBoolean("timestamp");

        const hasAnyUpdate =
          titleInput !== null ||
          descriptionInput !== null ||
          colorInput !== null ||
          footerInput !== null ||
          timestampInput !== null;
        if (!hasAnyUpdate) {
          await interaction.reply({
            content:
              "Provide at least one field to update (`title`, `description`, `color`, `footer`, or `timestamp`).",
            ephemeral: true,
          });
          return;
        }

        const existingEmbeds = Array.isArray(targetMessage.embeds)
          ? targetMessage.embeds.map((embed) =>
              embed && typeof embed.toJSON === "function" ? embed.toJSON() : { ...(embed || {}) }
            )
          : [];
        const firstEmbed = existingEmbeds.length > 0 ? existingEmbeds[0] : {};
        const nextEmbed = { ...firstEmbed };

        if (titleInput !== null) {
          const nextTitle = String(titleInput || "").trim();
          if (nextTitle) {
            nextEmbed.title = nextTitle.slice(0, 256);
          } else {
            delete nextEmbed.title;
          }
        }

        if (descriptionInput !== null) {
          const nextDescription = String(descriptionInput || "").trim();
          if (nextDescription) {
            nextEmbed.description = nextDescription.slice(0, 4096);
          } else {
            delete nextEmbed.description;
          }
        }

        if (colorInput !== null) {
          const rawColor = String(colorInput || "").trim().toLowerCase();
          if (rawColor === "clear" || rawColor === "none") {
            delete nextEmbed.color;
          } else {
            const color = parseEmbedColor(colorInput);
            if (color === null) {
              await interaction.reply({
                content: "Invalid `color`. Use 6-digit hex like `#57F287`, or `clear`.",
                ephemeral: true,
              });
              return;
            }
            nextEmbed.color = color;
          }
        }

        if (footerInput !== null) {
          const nextFooter = String(footerInput || "").trim();
          if (!nextFooter || /^(clear|none)$/i.test(nextFooter)) {
            delete nextEmbed.footer;
          } else {
            nextEmbed.footer = {
              text: nextFooter.slice(0, 2048),
            };
          }
        }

        if (timestampInput !== null) {
          if (timestampInput) {
            nextEmbed.timestamp = new Date().toISOString();
          } else {
            delete nextEmbed.timestamp;
          }
        }

        const hasRenderableContent =
          Boolean(String(nextEmbed.title || "").trim()) ||
          Boolean(String(nextEmbed.description || "").trim()) ||
          (Array.isArray(nextEmbed.fields) && nextEmbed.fields.length > 0) ||
          Boolean(nextEmbed.image?.url) ||
          Boolean(nextEmbed.thumbnail?.url) ||
          Boolean(nextEmbed.author?.name) ||
          Boolean(nextEmbed.footer?.text);
        if (!hasRenderableContent) {
          await interaction.reply({
            content:
              "Resulting embed would be empty. Keep at least one of title/description/fields/image/footer.",
            ephemeral: true,
          });
          return;
        }

        const updatedEmbeds = existingEmbeds.length > 0
          ? [nextEmbed, ...existingEmbeds.slice(1)]
          : [nextEmbed];
        await targetMessage.edit({
          embeds: updatedEmbeds,
        });

        await interaction.reply({
          content: `Embedded message updated in <#${targetChannel.id}>.`,
          ephemeral: true,
        });
        logInteractionDebug(
          "embed_message_updated",
          "Updated embedded message.",
          interaction,
          {
            channelId: targetChannel.id,
            messageId,
            updatedFields: {
              title: titleInput !== null,
              description: descriptionInput !== null,
              color: colorInput !== null,
              footer: footerInput !== null,
              timestamp: timestampInput !== null,
            },
          }
        );
        return;
      }

      if (isSetAppRoleGui) {
        if (!canManageRolesConfig) {
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

        const components = buildAppRoleGuiComponents(interaction.user.id);
        if (components.length === 0) {
          await interaction.reply({
            content: "No tracks available yet. Create one with `/track add`.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: [
            "🎛️ **Accepted Roles GUI**",
            "1) Pick a track",
            "2) Pick up to 5 accepted roles for that track",
            "",
            "This replaces the existing accepted-role list for the selected track.",
          ].join("\n"),
          ephemeral: true,
          components,
        });
        logInteractionDebug(
          "accepted_roles_gui_opened",
          "Opened accepted-roles GUI.",
          interaction
        );
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

        const rawTrackInput = extractTrackOptionInput(interaction);
        const selectedTrack = normalizeTrackKey(rawTrackInput);
        if (!selectedTrack) {
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "accepted_roles_command_invalid_track",
            "Accepted-roles command received an invalid track.",
            interaction,
            {
              rawTrackInput,
            }
          );
          await interaction.reply({
            content: rawTrackInput
              ? `Unknown track \`${rawTrackInput}\`. Use \`/track list\` to view available tracks.`
              : "Missing `track` option. Use `/set approle track:<track> role:@Role`.",
            ephemeral: true,
          });
          return;
        }
        const trackLabel = getTrackLabel(selectedTrack);
        const selectedRoleIds = extractRoleIdsFromInteractionOptions(interaction).slice(0, 5);
        if (selectedRoleIds.length === 0) {
          refreshCommandsIfNeeded();
          logInteractionDebug(
            "accepted_roles_command_missing_roles",
            "Accepted-roles command received no roles.",
            interaction,
            {
              trackKey: selectedTrack,
            }
          );
          await interaction.reply({
            content:
              "Missing `role` option. Use `/set approle track:<track> role:@Role` (up to `role_5`). If this keeps failing, restart the bot to refresh slash commands.",
            ephemeral: true,
          });
          return;
        }
        let roleUpdate;
        try {
          roleUpdate = setActiveApprovedRoles(selectedTrack, selectedRoleIds);
        } catch (err) {
          logInteractionFailure(
            "accepted_roles_command_update_failed",
            "Failed updating accepted roles from command.",
            interaction,
            err,
            {
              trackKey: selectedTrack,
              selectedRoleIds,
              sourceCommand: interaction.commandName,
            }
          );
          await interaction.reply({
            content: err?.message || "Failed updating accepted roles.",
            ephemeral: true,
          });
          return;
        }

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
        logInteractionDebug(
          "accepted_roles_command_updated",
          "Accepted roles updated from command.",
          interaction,
          {
            trackKey: selectedTrack,
            roleCount: roleUpdate.roleIds.length,
            roleIds: roleUpdate.roleIds,
            sourceCommand: interaction.commandName,
          }
        );
        return;
      }

      if (isReactionRole) {
        if (!canManageRolesConfig) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles (or Administrator) to manage reaction roles.",
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

        const action = interaction.options.getSubcommand(true);
        logInteractionDebug(
          "reaction_role_command_received",
          "Processing reaction-role command.",
          interaction,
          {
            action,
          }
        );
        if (action === "gui") {
          await interaction.reply({
            content: [
              "🎛️ **Reaction Role GUI**",
              "Use the buttons below to add/update or remove mappings with modals.",
              "Fields accepted:",
              "- `emoji`: unicode (`✅`) or custom (`<:name:id>`)",
              "- `role_id`: target role ID",
              "- `channel_id`: optional (defaults to current channel)",
            ].join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });
          logInteractionDebug(
            "reaction_role_gui_opened",
            "Opened reaction-role GUI.",
            interaction,
            {
              action,
            }
          );
          return;
        }

        if (action === "button") {
          const requestedColor = String(interaction.options.getString("color") || "").trim();
          const buttonStyle = parseReactionRoleButtonStyle(requestedColor);
          if (!buttonStyle) {
            await interaction.reply({
              content: "Invalid color. Use one of: gray, blue, green, red.",
              ephemeral: true,
            });
            return;
          }
          const messageTypeInput = String(
            interaction.options.getString("message_type") || ""
          ).trim();
          const panelMessageType = parseReactionRoleButtonMessageType(messageTypeInput);
          if (!panelMessageType) {
            await interaction.reply({
              content: "Invalid message type. Use `text` or `embed`.",
              ephemeral: true,
            });
            return;
          }
          const embedColorInput = String(
            interaction.options.getString("embed_color") || ""
          ).trim();
          const hasEmbedColorInput = embedColorInput.length > 0;
          const embedColor = hasEmbedColorInput ? parseEmbedColor(embedColorInput) : null;
          if (hasEmbedColorInput && panelMessageType !== REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED) {
            await interaction.reply({
              content: "`embed_color` can only be used when `message_type:embed`.",
              ephemeral: true,
            });
            return;
          }
          if (hasEmbedColorInput && embedColor === null) {
            await interaction.reply({
              content: "Invalid `embed_color`. Use 6-digit hex like `#57F287`.",
              ephemeral: true,
            });
            return;
          }
          const selectedRoleIds = extractRoleIdsFromInteractionOptions(interaction).slice(0, 25);
          if (selectedRoleIds.length === 0) {
            await interaction.reply({
              content: "Please provide at least one role (`role`, up to `role_5`).",
              ephemeral: true,
            });
            return;
          }

          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;
          if (!targetChannel || !targetChannel.isTextBased() || typeof targetChannel.send !== "function") {
            await interaction.reply({
              content: "Please select a valid text channel.",
              ephemeral: true,
            });
            return;
          }
          if (targetChannel.guildId !== interaction.guildId) {
            await interaction.reply({
              content: "The selected channel must be in this server.",
              ephemeral: true,
            });
            return;
          }

          const panelMessageInput = String(interaction.options.getString("message") || "").trim();
          if (panelMessageInput.length > 2000) {
            await interaction.reply({
              content: "Panel message cannot exceed 2000 characters.",
              ephemeral: true,
            });
            return;
          }
          const panelTitleInput = String(interaction.options.getString("title") || "").trim();
          if (panelTitleInput.length > 256) {
            await interaction.reply({
              content: "Embed title cannot exceed 256 characters.",
              ephemeral: true,
            });
            return;
          }
          const panelMessageText =
            panelMessageInput || "Click a button below to add or remove the matching role.";

          const resolvedRoles = [];
          const missingRoleIds = [];
          for (const roleId of selectedRoleIds) {
            const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
              missingRoleIds.push(roleId);
              continue;
            }
            resolvedRoles.push(role);
          }

          if (resolvedRoles.length === 0) {
            await interaction.reply({
              content: "None of the provided roles were found in this server.",
              ephemeral: true,
            });
            return;
          }

          const panelComponents = buildReactionRoleButtonPanelComponents(
            interaction.guildId,
            resolvedRoles.map((role) => ({
              roleId: role.id,
              label: role.name,
            })),
            buttonStyle
          );

          const warningLines = [];
          if (missingRoleIds.length > 0) {
            warningLines.push(
              `Skipped missing roles: ${missingRoleIds.map((id) => `\`${id}\``).join(", ")}.`
            );
          }
          try {
            const me = await interaction.guild.members.fetchMe();
            if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
              warningLines.push("I do not currently have Manage Roles permission.");
            } else {
              for (const role of resolvedRoles) {
                if (me.roles.highest.comparePositionTo(role) <= 0) {
                  warningLines.push(`My top role must be above <@&${role.id}> to assign it.`);
                }
                if (role.managed) {
                  warningLines.push(
                    `<@&${role.id}> is a managed/integration role and may not be assignable.`
                  );
                }
              }
            }
          } catch (err) {
            warningLines.push(`Could not fully validate role assignability (${err.message}).`);
          }

          let panelMessage;
          try {
            const payload = {
              components: panelComponents,
              allowedMentions: {
                parse: [],
              },
            };
            if (panelMessageType === REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED) {
              const panelEmbed = new EmbedBuilder()
                .setTitle(panelTitleInput || "Choose Roles")
                .setDescription(panelMessageText);
              if (Number.isInteger(embedColor)) {
                panelEmbed.setColor(embedColor);
              }
              payload.embeds = [panelEmbed];
            } else {
              payload.content = panelMessageText;
            }
            panelMessage = await targetChannel.send(payload);
          } catch (err) {
            logInteractionFailure(
              "reaction_role_button_panel_send_failed",
              "Failed posting reaction-role button panel.",
              interaction,
              err,
              {
                action,
                channelId: targetChannel.id,
                roleCount: resolvedRoles.length,
                roleIds: resolvedRoles.map((role) => role.id),
              }
            );
            await interaction.reply({
              content:
                err?.message || "Failed posting button role panel. Check my channel permissions.",
              ephemeral: true,
            });
            return;
          }

          const roleMentions = resolvedRoles.map((role) => `<@&${role.id}>`).join(", ");
          const replyLines = [
            `Button role panel posted in <#${targetChannel.id}>.`,
            `Message: ${panelMessage.url}`,
            `Type: ${panelMessageType}`,
            `Color: ${formatReactionRoleButtonStyle(buttonStyle)}`,
            `Roles (${resolvedRoles.length}): ${roleMentions}`,
          ];
          if (panelMessageType === REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED && Number.isInteger(embedColor)) {
            replyLines.push(`Embed Sidebar: ${formatEmbedColorHex(embedColor)}`);
          }
          if (warningLines.length > 0) {
            replyLines.push(`Warnings: ${warningLines.join(" ")}`);
          }
          await interaction.reply({
            content: replyLines.join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });

          await postConfigurationLog(interaction, "Reaction Role Button Panel Posted", [
            `**Channel:** <#${targetChannel.id}>`,
            `**Message ID:** \`${panelMessage.id}\``,
            `**Type:** ${panelMessageType}`,
            `**Color:** ${formatReactionRoleButtonStyle(buttonStyle)}`,
            `**Roles (${resolvedRoles.length}):** ${roleMentions}`,
            ...(panelMessageType === REACTION_ROLE_BUTTON_MESSAGE_TYPE_EMBED &&
            Number.isInteger(embedColor)
              ? [`**Embed Sidebar:** ${formatEmbedColorHex(embedColor)}`]
              : []),
          ]);
          logInteractionDebug(
            "reaction_role_button_panel_posted",
            "Posted reaction-role button panel.",
            interaction,
            {
              action,
              channelId: targetChannel.id,
              messageId: panelMessage.id,
              messageType: panelMessageType,
              color: formatReactionRoleButtonStyle(buttonStyle),
              embedColor: Number.isInteger(embedColor) ? formatEmbedColorHex(embedColor) : null,
              roleCount: resolvedRoles.length,
              roleIds: resolvedRoles.map((role) => role.id),
            }
          );
          return;
        }

        if (action === "button_edit") {
          const messageId = String(interaction.options.getString("message_id") || "").trim();
          if (!isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
              ephemeral: true,
            });
            return;
          }

          // button_edit supports three independent updates:
          // - replace buttons/roles
          // - recolor buttons
          // - recolor embed sidebar / clear top text
          const requestedColor = String(interaction.options.getString("color") || "").trim();
          const hasColorUpdate = requestedColor.length > 0;
          const requestedEmbedColor = String(
            interaction.options.getString("embed_color") || ""
          ).trim();
          const hasEmbedColorUpdate = requestedEmbedColor.length > 0;
          const isClearEmbedColor = /^(clear|none)$/i.test(requestedEmbedColor);
          const parsedEmbedColor = hasEmbedColorUpdate && !isClearEmbedColor
            ? parseEmbedColor(requestedEmbedColor)
            : null;
          const replacementRoleIds = extractRoleIdsFromInteractionOptions(interaction).slice(0, 5);
          const hasRoleUpdate = replacementRoleIds.length > 0;
          const removeTopText = Boolean(interaction.options.getBoolean("remove_top_text"));
          const buttonStyle = hasColorUpdate
            ? parseReactionRoleButtonStyle(requestedColor)
            : null;
          if (hasColorUpdate && !buttonStyle) {
            await interaction.reply({
              content: "Invalid color. Use one of: gray, blue, green, red.",
              ephemeral: true,
            });
            return;
          }
          if (hasEmbedColorUpdate && !isClearEmbedColor && parsedEmbedColor === null) {
            await interaction.reply({
              content: "Invalid `embed_color`. Use 6-digit hex like `#57F287`, or `clear`.",
              ephemeral: true,
            });
            return;
          }
          if (!hasColorUpdate && !removeTopText && !hasRoleUpdate && !hasEmbedColorUpdate) {
            await interaction.reply({
              content:
                "Provide at least one update: `role` (up to `role_5`), `color`, `embed_color`, or `remove_top_text:true`.",
              ephemeral: true,
            });
            return;
          }

          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;
          if (
            !targetChannel ||
            !targetChannel.isTextBased() ||
            typeof targetChannel.messages?.fetch !== "function"
          ) {
            await interaction.reply({
              content: "Please select a valid text channel containing the panel message.",
              ephemeral: true,
            });
            return;
          }
          if (targetChannel.guildId !== interaction.guildId) {
            await interaction.reply({
              content: "The selected channel must be in this server.",
              ephemeral: true,
            });
            return;
          }

          const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
          if (!targetMessage) {
            await interaction.reply({
              content: "Message not found in that channel.",
              ephemeral: true,
            });
            return;
          }

          if (targetMessage.author?.id !== interaction.client?.user?.id) {
            await interaction.reply({
              content: "I can only edit button panels posted by this bot.",
              ephemeral: true,
            });
            return;
          }

          const existingRows = Array.isArray(targetMessage.components)
            ? targetMessage.components
            : [];
          if (existingRows.length === 0) {
            await interaction.reply({
              content: "That message has no components/buttons to update.",
              ephemeral: true,
            });
            return;
          }

          const existingSummary = summarizeExistingReactionRoleButtons(
            existingRows,
            interaction.guildId
          );
          if (existingSummary.count === 0) {
            await interaction.reply({
              content:
                "No button-role components were found on that message. Use `/rr button` to create one first.",
              ephemeral: true,
            });
            return;
          }

          const existingEmbeds = Array.isArray(targetMessage.embeds)
            ? targetMessage.embeds.map((embed) =>
                embed && typeof embed.toJSON === "function" ? embed.toJSON() : { ...(embed || {}) }
              )
            : [];
          if (hasEmbedColorUpdate && existingEmbeds.length === 0) {
            await interaction.reply({
              content: "That message has no embed to recolor.",
              ephemeral: true,
            });
            return;
          }
          const embedColorLabel = hasEmbedColorUpdate
            ? isClearEmbedColor
              ? "clear"
              : formatEmbedColorHex(parsedEmbedColor)
            : null;

          let roleUpdateMentions = "none";
          let roleUpdateWarning = "";
          let roleAssignabilityWarning = "";
          let updatedButtonCount = 0;
          let updatedComponents = null;
          if (hasRoleUpdate) {
            // Rebuild the panel button rows from scratch when a new role set is provided.
            const resolvedRoles = [];
            const missingRoleIds = [];
            for (const roleId of replacementRoleIds) {
              const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
              if (!role) {
                missingRoleIds.push(roleId);
                continue;
              }
              resolvedRoles.push(role);
            }

            if (resolvedRoles.length === 0) {
              await interaction.reply({
                content: "None of the provided roles were found in this server.",
                ephemeral: true,
              });
              return;
            }

            const styleToUse = hasColorUpdate ? buttonStyle : existingSummary.style;
            updatedComponents = buildReactionRoleButtonPanelComponents(
              interaction.guildId,
              resolvedRoles.map((role) => ({
                roleId: role.id,
                label: role.name,
              })),
              styleToUse
            );
            updatedButtonCount = resolvedRoles.length;
            roleUpdateMentions = resolvedRoles.map((role) => `<@&${role.id}>`).join(", ");
            if (missingRoleIds.length > 0) {
              roleUpdateWarning = `Skipped missing roles: ${missingRoleIds
                .map((id) => `\`${id}\``)
                .join(", ")}.`;
            }
            try {
              const me = await interaction.guild.members.fetchMe();
              if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                roleAssignabilityWarning = "I do not currently have Manage Roles permission.";
              } else {
                const warnings = [];
                for (const role of resolvedRoles) {
                  if (me.roles.highest.comparePositionTo(role) <= 0) {
                    warnings.push(`My top role must be above <@&${role.id}> to assign it.`);
                  }
                  if (role.managed) {
                    warnings.push(
                      `<@&${role.id}> is a managed/integration role and may not be assignable.`
                    );
                  }
                }
                if (warnings.length > 0) {
                  roleAssignabilityWarning = warnings.join(" ");
                }
              }
            } catch (err) {
              roleAssignabilityWarning = `Could not fully validate role assignability (${err.message}).`;
            }
          } else {
            // No role replacement: preserve existing button layout and only mutate styles if requested.
            updatedComponents = existingRows.map((row) => {
              const rowJson = row.toJSON();
              if (!Array.isArray(rowJson.components)) {
                return rowJson;
              }

              rowJson.components = rowJson.components.map((component) => {
                if (component?.type !== ComponentType.Button) {
                  return component;
                }
                const customId = String(component?.custom_id || "").trim();
                if (!customId) {
                  return component;
                }
                const buttonContext = parseReactionRoleButtonCustomId(customId);
                if (!buttonContext || buttonContext.guildId !== interaction.guildId) {
                  return component;
                }
                if (!hasColorUpdate) {
                  return component;
                }
                updatedButtonCount += 1;
                return { ...component, style: buttonStyle };
              });

              return rowJson;
            });
          }

          try {
            const editPayload = { components: updatedComponents };
            if (removeTopText) {
              editPayload.content = null;
            }
            if (hasEmbedColorUpdate) {
              const updatedEmbeds = [...existingEmbeds];
              const firstEmbed = { ...(updatedEmbeds[0] || {}) };
              if (isClearEmbedColor) {
                delete firstEmbed.color;
              } else {
                firstEmbed.color = parsedEmbedColor;
              }
              updatedEmbeds[0] = firstEmbed;
              editPayload.embeds = updatedEmbeds;
            }
            await targetMessage.edit(editPayload);
          } catch (err) {
            logInteractionFailure(
              "reaction_role_button_panel_edit_failed",
              "Failed updating reaction-role button panel.",
              interaction,
              err,
              {
                action,
                channelId: targetChannel.id,
                messageId,
                hasRoleUpdate,
                roleIds: hasRoleUpdate ? replacementRoleIds : [],
                hasColorUpdate,
                color: hasColorUpdate ? formatReactionRoleButtonStyle(buttonStyle) : null,
                hasEmbedColorUpdate,
                embedColor: embedColorLabel,
                removeTopText,
              }
            );
            await interaction.reply({
              content: err?.message || "Failed updating button panel.",
              ephemeral: true,
            });
            return;
          }

          const replyLines = [
            `Updated button panel in <#${targetChannel.id}>.`,
            `Message ID: \`${messageId}\``,
          ];
          if (hasRoleUpdate) {
            replyLines.push(`Roles (${updatedButtonCount}): ${roleUpdateMentions}`);
          }
          if (hasColorUpdate) {
            replyLines.push(`Color: ${formatReactionRoleButtonStyle(buttonStyle)}`);
            replyLines.push(`Buttons updated: ${updatedButtonCount}`);
          }
          if (hasEmbedColorUpdate) {
            replyLines.push(`Embed Sidebar: ${embedColorLabel}`);
          }
          if (removeTopText) {
            replyLines.push("Top message text removed.");
          }
          if (roleUpdateWarning) {
            replyLines.push(`Warning: ${roleUpdateWarning}`);
          }
          if (roleAssignabilityWarning) {
            replyLines.push(`Warning: ${roleAssignabilityWarning}`);
          }
          await interaction.reply({
            content: replyLines.join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });

          const logLines = [
            `**Channel:** <#${targetChannel.id}>`,
            `**Message ID:** \`${messageId}\``,
          ];
          if (hasRoleUpdate) {
            logLines.push(`**Roles (${updatedButtonCount}):** ${roleUpdateMentions}`);
          }
          if (hasColorUpdate) {
            logLines.push(`**Color:** ${formatReactionRoleButtonStyle(buttonStyle)}`);
            logLines.push(`**Buttons Updated:** ${updatedButtonCount}`);
          }
          if (hasEmbedColorUpdate) {
            logLines.push(`**Embed Sidebar:** ${embedColorLabel}`);
          }
          if (removeTopText) {
            logLines.push("**Top Text Removed:** yes");
          }
          if (roleUpdateWarning) {
            logLines.push(`**Role Warning:** ${roleUpdateWarning}`);
          }
          if (roleAssignabilityWarning) {
            logLines.push(`**Assignability Warning:** ${roleAssignabilityWarning}`);
          }
          await postConfigurationLog(interaction, "Reaction Role Button Panel Updated", logLines);

          logInteractionDebug(
            "reaction_role_button_panel_updated",
            "Updated reaction-role button panel.",
            interaction,
            {
              action,
              channelId: targetChannel.id,
              messageId,
              hasRoleUpdate,
              roleIds: hasRoleUpdate ? replacementRoleIds : [],
              hasColorUpdate,
              color: hasColorUpdate ? formatReactionRoleButtonStyle(buttonStyle) : null,
              hasEmbedColorUpdate,
              embedColor: embedColorLabel,
              removeTopText,
              buttonCount: updatedButtonCount,
            }
          );
          return;
        }

        if (action === "create") {
          const messageId = String(interaction.options.getString("message_id") || "").trim();
          const emoji = String(interaction.options.getString("emoji") || "").trim();
          const role = interaction.options.getRole("role");
          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;

          if (!isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
              ephemeral: true,
            });
            return;
          }
          if (!emoji) {
            await interaction.reply({
              content: "Please provide an emoji.",
              ephemeral: true,
            });
            return;
          }
          if (!role?.id) {
            await interaction.reply({
              content: "Please provide a role.",
              ephemeral: true,
            });
            return;
          }
          if (!targetChannel || !targetChannel.isTextBased() || typeof targetChannel.messages?.fetch !== "function") {
            await interaction.reply({
              content: "Please select a valid text channel containing the target message.",
              ephemeral: true,
            });
            return;
          }
          if (targetChannel.guildId !== interaction.guildId) {
            await interaction.reply({
              content: "The selected channel must be in this server.",
              ephemeral: true,
            });
            return;
          }

          let targetMessage = null;
          try {
            targetMessage = await targetChannel.messages.fetch(messageId);
          } catch {
            targetMessage = null;
          }
          if (!targetMessage) {
            await interaction.reply({
              content: "Message not found in that channel.",
              ephemeral: true,
            });
            return;
          }

          let result;
          try {
            result = upsertReactionRoleBinding({
              guildId: interaction.guildId,
              channelId: targetChannel.id,
              messageId,
              roleId: role.id,
              emojiInput: emoji,
              actorId: interaction.user.id,
            });
          } catch (err) {
            logInteractionFailure(
              "reaction_role_create_failed",
              "Failed creating reaction-role mapping.",
              interaction,
              err,
              {
                action,
                channelId: targetChannel.id,
                messageId,
                roleId: role.id,
                emoji,
              }
            );
            await interaction.reply({
              content: err.message || "Failed saving reaction role mapping.",
              ephemeral: true,
            });
            return;
          }

          const warningLines = [];
          try {
            const me = await interaction.guild.members.fetchMe();
            if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
              warningLines.push("I do not currently have Manage Roles permission.");
            } else {
              const fullRole = await interaction.guild.roles.fetch(role.id);
              if (fullRole && me.roles.highest.comparePositionTo(fullRole) <= 0) {
                warningLines.push(`My top role must be above <@&${role.id}> to assign it.`);
              }
              if (fullRole?.managed) {
                warningLines.push(`<@&${role.id}> is managed/integration and may not be assignable.`);
              }
            }
          } catch (err) {
            warningLines.push(`Could not fully validate role assignability (${err.message}).`);
          }

          if (typeof addReaction === "function") {
            try {
              await addReaction(
                targetChannel.id,
                messageId,
                result.emoji.reactionIdentifier
              );
            } catch (err) {
              warningLines.push(`Could not add reaction to message automatically (${err.message}).`);
            }
          }

          const statusLabel = result.created ? "created" : "updated";
          const replyLines = [
            `Reaction role ${statusLabel}: ${result.binding.emojiDisplay} -> <@&${role.id}>`,
            `Channel: <#${targetChannel.id}>`,
            `Message ID: \`${messageId}\``,
          ];
          if (warningLines.length > 0) {
            replyLines.push(`Warnings: ${warningLines.join(" ")}`);
          }
          await interaction.reply({
            content: replyLines.join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });

          await postConfigurationLog(interaction, "Reaction Role Updated", [
            `**Action:** ${statusLabel}`,
            `**Emoji:** ${result.binding.emojiDisplay}`,
            `**Role:** <@&${role.id}>`,
            `**Channel:** <#${targetChannel.id}>`,
            `**Message ID:** \`${messageId}\``,
          ]);
          logInteractionDebug(
            "reaction_role_create_completed",
            "Created/updated reaction-role mapping.",
            interaction,
            {
              action,
              created: Boolean(result.created),
              channelId: targetChannel.id,
              messageId,
              roleId: role.id,
              emoji: result.binding.emojiDisplay,
            }
          );
          return;
        }

        if (action === "remove") {
          const messageId = String(interaction.options.getString("message_id") || "").trim();
          const emoji = String(interaction.options.getString("emoji") || "").trim();
          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;

          if (!isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
              ephemeral: true,
            });
            return;
          }
          if (!emoji) {
            await interaction.reply({
              content: "Please provide an emoji.",
              ephemeral: true,
            });
            return;
          }
          if (!targetChannel || !targetChannel.isTextBased()) {
            await interaction.reply({
              content: "Please select a valid text channel containing the target message.",
              ephemeral: true,
            });
            return;
          }
          if (targetChannel.guildId !== interaction.guildId) {
            await interaction.reply({
              content: "The selected channel must be in this server.",
              ephemeral: true,
            });
            return;
          }

          let removal;
          try {
            removal = removeReactionRoleBinding({
              guildId: interaction.guildId,
              channelId: targetChannel.id,
              messageId,
              emojiInput: emoji,
            });
          } catch (err) {
            logInteractionFailure(
              "reaction_role_remove_failed",
              "Failed removing reaction-role mapping.",
              interaction,
              err,
              {
                action,
                channelId: targetChannel.id,
                messageId,
                emoji,
              }
            );
            await interaction.reply({
              content: err.message || "Failed removing reaction role mapping.",
              ephemeral: true,
            });
            return;
          }

          if (!removal.removed) {
            await interaction.reply({
              content: "No matching reaction role mapping was found for that message and emoji.",
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: [
              `Reaction role removed: ${removal.binding.emojiDisplay} -> <@&${removal.binding.roleId}>`,
              `Channel: <#${targetChannel.id}>`,
              `Message ID: \`${messageId}\``,
            ].join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });

          await postConfigurationLog(interaction, "Reaction Role Removed", [
            `**Emoji:** ${removal.binding.emojiDisplay}`,
            `**Role:** <@&${removal.binding.roleId}>`,
            `**Channel:** <#${targetChannel.id}>`,
            `**Message ID:** \`${messageId}\``,
          ]);
          logInteractionDebug(
            "reaction_role_remove_completed",
            "Removed reaction-role mapping.",
            interaction,
            {
              action,
              channelId: targetChannel.id,
              messageId,
              roleId: removal.binding.roleId,
              emoji: removal.binding.emojiDisplay,
            }
          );
          return;
        }

        if (action === "list") {
          const messageIdRaw = interaction.options.getString("message_id");
          const messageId = messageIdRaw ? String(messageIdRaw).trim() : "";
          const channelInput = interaction.options.getChannel("channel");
          if (messageId && !isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
              ephemeral: true,
            });
            return;
          }
          if (channelInput && channelInput.guildId !== interaction.guildId) {
            await interaction.reply({
              content: "The selected channel must be in this server.",
              ephemeral: true,
            });
            return;
          }

          const bindings = listReactionRoleBindings({
            guildId: interaction.guildId,
            channelId: channelInput?.id || null,
            messageId: messageId || null,
          });
          if (bindings.length === 0) {
            await interaction.reply({
              content:
                "No reaction role mappings found for the selected filters.\nUse the buttons below to create one.",
              ephemeral: true,
              components: buildReactionRoleGuiComponents(interaction.user.id),
            });
            return;
          }

          const maxLines = Math.max(1, reactionRoleListMaxLines);
          const visible = bindings.slice(0, maxLines);
          const lines = [
            "🎭 **Reaction Role Mappings**",
            ...visible.map(
              (binding) =>
                `- ${binding.emojiDisplay} -> <@&${binding.roleId}> | <#${binding.channelId}> | \`${binding.messageId}\``
            ),
          ];
          if (bindings.length > visible.length) {
            lines.push(`...and ${bindings.length - visible.length} more.`);
          }

          await interaction.reply({
            content: lines.join("\n"),
            ephemeral: true,
            components: buildReactionRoleGuiComponents(interaction.user.id),
          });
          logInteractionDebug(
            "reaction_role_list_completed",
            "Listed reaction-role mappings.",
            interaction,
            {
              action,
              resultCount: bindings.length,
              filteredChannelId: channelInput?.id || null,
              filteredMessageId: messageId || null,
            }
          );
          return;
        }

        await interaction.reply({
          content: `Unknown reaction-role action: ${action}`,
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

      if (isLookup) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /lookup.",
            ephemeral: true,
          });
          return;
        }

        const targetUser = interaction.options.getUser("user");
        if (!targetUser) {
          await interaction.reply({ content: "Please provide a user.", ephemeral: true });
          return;
        }
        const trackFilter = interaction.options.getString("track");
        const normalizedTrackFilter = trackFilter ? normalizeTrackKey(trackFilter) : null;
        const state = readState();
        let apps = Object.values(state.applications || {}).filter(
          (app) => app?.applicantUserId === targetUser.id
        );
        if (!apps.length) {
          // Fallback: match by username (case-insensitive)
          const usernameLower = (targetUser.username || "").toLowerCase();
          apps = Object.values(state.applications || {}).filter(
            (app) =>
              app?.applicantName &&
              String(app.applicantName).toLowerCase().includes(usernameLower)
          );
        }
        if (normalizedTrackFilter) {
          apps = apps.filter((app) => normalizeTrackKey(app?.trackKey) === normalizedTrackFilter);
        }
        apps.sort((a, b) => {
          const aMs = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bMs = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bMs - aMs;
        });

        if (apps.length === 0) {
          await interaction.reply({
            content: `No applications found for **${targetUser.tag}**${normalizedTrackFilter ? ` in ${getTrackLabel(normalizedTrackFilter)}` : ""}.`,
            ephemeral: true,
          });
          return;
        }

        const statusIcon = (status) => {
          if (status === "accepted") return "✅";
          if (status === "denied") return "❌";
          return "⏳";
        };

        const fields = apps.slice(0, 25).map((app) => {
          const appId = getApplicationDisplayId(app) || app.messageId || "unknown";
          const track = getTrackLabel(app.trackKey);
          const status = app.status || "pending";
          const submitted = app.createdAt ? `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:d>` : "unknown";
          const decided = app.decidedAt ? `<t:${Math.floor(new Date(app.decidedAt).getTime() / 1000)}:d>` : "—";
          return {
            name: `${track} — ${appId}`,
            value: `${statusIcon(status)} **${status.toUpperCase()}** | Submitted: ${submitted} | Decided: ${decided}`,
            inline: false,
          };
        });

        const embed = new EmbedBuilder()
          .setTitle(`Application History: @${targetUser.username}`)
          .setColor(0x5865f2)
          .addFields(fields)
          .setFooter({ text: `Showing ${Math.min(apps.length, 25)} of ${apps.length} application(s)` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }


      if (isSetDefault) {
        if (!canManageServer) {
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

        const channelInput = interaction.options.getChannel("channel");
        const fallbackCurrentChannel =
          interaction.channel && interaction.channel.type === ChannelType.GuildText
            ? interaction.channel
            : null;
        const defaultChannel = channelInput || fallbackCurrentChannel;
        if (!defaultChannel || defaultChannel.type !== ChannelType.GuildText) {
          await interaction.reply({
            content:
              "Provide `channel:#channel`, or run this command in a guild text channel.",
            ephemeral: true,
          });
          return;
        }

        const selectedRoleIds = extractRoleIdsFromInteractionOptions(interaction).slice(0, 5);
        if (selectedRoleIds.length > 0 && !canManageRolesConfig) {
          await interaction.reply({
            content:
              "To apply default accepted roles, you need both Manage Server and Manage Roles (or Administrator).",
            ephemeral: true,
          });
          return;
        }

        const rawMessage = interaction.options.getString("message");
        const trimmedMessage = typeof rawMessage === "string" ? rawMessage.trim() : "";
        const trackKeys = getApplicationTrackKeys();
        const roleMentions =
          selectedRoleIds.length > 0
            ? selectedRoleIds.map((roleId) => `<@&${roleId}>`).join(", ")
            : "unchanged";

        await interaction.deferReply({ ephemeral: true });

        for (const trackKey of trackKeys) {
          setActiveChannel(trackKey, defaultChannel.id);
        }
        setActiveLogsChannel(defaultChannel.id);
        setActiveBotLogsChannel(defaultChannel.id);
        setActiveAcceptAnnounceChannel(defaultChannel.id);
        setActiveBugChannel(defaultChannel.id);
        setActiveSuggestionsChannel(defaultChannel.id);

        if (selectedRoleIds.length > 0) {
          for (const trackKey of trackKeys) {
            setActiveApprovedRoles(trackKey, selectedRoleIds);
          }
        }
        if (trimmedMessage) {
          setActiveAcceptAnnounceTemplate(trimmedMessage);
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
            replayLine += ` Failed jobs: ${replayResult.failed} (first: ${replayResult.failedJobId}: ${replayResult.failedError}).`;
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
            `Server default channel applied: <#${defaultChannel.id}>.`,
            `Track post channels updated: ${trackKeys.length}.`,
            "Shared channels updated: application_log, log, accept_message, bug, suggestions.",
            selectedRoleIds.length > 0
              ? `Accepted roles applied to all tracks (${selectedRoleIds.length}): ${roleMentions}.`
              : "Accepted roles unchanged (optional: provide `role`..`role_5`).",
            trimmedMessage
              ? "Accepted announcement template updated from `message`."
              : "Accepted announcement template unchanged (optional: provide `message`).",
            replayLine,
            auditResult,
          ].join("\n"),
        });

        await postConfigurationLog(interaction, "Server Default Configuration Updated", [
          `**Base Channel:** <#${defaultChannel.id}>`,
          `**Track Post Channels Updated:** ${trackKeys.length}`,
          `**Application Log Channel:** <#${defaultChannel.id}>`,
          `**Log Channel:** <#${defaultChannel.id}>`,
          `**Accept Message Channel:** <#${defaultChannel.id}>`,
          `**Bug Channel:** <#${defaultChannel.id}>`,
          `**Suggestions Channel:** <#${defaultChannel.id}>`,
          `**Accepted Roles:** ${
            selectedRoleIds.length > 0
              ? `${selectedRoleIds.length} role(s) for all tracks (${roleMentions})`
              : "unchanged"
          }`,
          `**Accepted Template:** ${trimmedMessage ? "updated" : "unchanged"}`,
        ]);
        logInteractionDebug(
          "setdefault_command_completed",
          "Updated server default channel configuration.",
          interaction,
          {
            defaultChannelId: defaultChannel.id,
            trackCount: trackKeys.length,
            roleCount: selectedRoleIds.length,
            roleIds: selectedRoleIds,
            acceptTemplateUpdated: Boolean(trimmedMessage),
          }
        );
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

        logInteractionDebug(
          "setchannel_command_received",
          "Processing setchannel command.",
          interaction,
          {
            sourceCommand: interaction.commandName,
            setMode: isSetUnified ? setCommandMode : null,
            setGroup: isSetUnified ? setSubcommandGroup : null,
            setSubcommand: isSetUnified ? setSubcommand : null,
            setChannelTarget: isSetUnified ? setChannelMode || null : null,
            options: summarizeCommandOptionsForDebug(interaction),
          }
        );

        let dynamicTrackInput = interaction.options.getString("track");
        let dynamicTrackChannelInput = interaction.options.getChannel("post_channel");
        let logChannelInput = interaction.options.getChannel("log");
        let applicationLogChannelInput = interaction.options.getChannel("application_log");
        let botLogChannelInput = interaction.options.getChannel("bot_log");
        let acceptMessageChannelInput = interaction.options.getChannel("accept_message");
        let bugChannelInput = interaction.options.getChannel("bug");
        let suggestionsChannelInput = interaction.options.getChannel("suggestions");

        if (isSetUnified && setChannelMode) {
          const genericChannelInput = interaction.options.getChannel("channel");
          if (!genericChannelInput) {
            await interaction.reply({
              content:
                "For `/set channel <target>`, provide `channel`. Example: `/set channel post track:tester channel:#tester-apps`.",
              ephemeral: true,
            });
            return;
          }

          const isPostChannelTarget =
            setChannelMode === "post" || setChannelMode === "channel_post";
          if (isPostChannelTarget) {
            if (!dynamicTrackInput) {
              await interaction.reply({
                content:
                  "For `/set channel post` (or `channel_post`), provide `track` and `channel`.",
                ephemeral: true,
              });
              return;
            }
            dynamicTrackChannelInput = genericChannelInput;
          } else if (setChannelMode === "application_log") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            applicationLogChannelInput = genericChannelInput;
          } else if (setChannelMode === "log") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            logChannelInput = genericChannelInput;
          } else if (setChannelMode === "accept_message") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            acceptMessageChannelInput = genericChannelInput;
          } else if (setChannelMode === "bug") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            bugChannelInput = genericChannelInput;
          } else if (setChannelMode === "suggestions") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            suggestionsChannelInput = genericChannelInput;
          } else {
            await interaction.reply({
              content:
                "Unknown `/set channel` target. Use one of: `post`, `channel_post`, `application_log`, `log`, `accept_message`, `bug`, `suggestions`.",
              ephemeral: true,
            });
            return;
          }
        } else if (isSetUnified && setCommandMode === "channel") {
          const channelTarget = String(
            interaction.options.getString("channel_target") || ""
          )
            .trim()
            .toLowerCase();
          const genericChannelInput = interaction.options.getChannel("channel");
          if (!channelTarget || !genericChannelInput) {
            await interaction.reply({
              content:
                "For `/set channel`, use `/set channel post track:<track> channel:#channel` or `/set channel <application_log|log|accept_message|bug|suggestions> channel:#channel`.",
              ephemeral: true,
            });
            return;
          }

          const isPostChannelTarget =
            channelTarget === "post" || channelTarget === "channel_post";
          if (isPostChannelTarget) {
            if (!dynamicTrackInput) {
              await interaction.reply({
                content:
                  "For `/set channel post` (or `channel_post`), provide `track` and `channel`.",
                ephemeral: true,
              });
              return;
            }
            dynamicTrackChannelInput = genericChannelInput;
          } else if (channelTarget === "application_log") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            applicationLogChannelInput = genericChannelInput;
          } else if (channelTarget === "log") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            logChannelInput = genericChannelInput;
          } else if (channelTarget === "accept_message") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            acceptMessageChannelInput = genericChannelInput;
          } else if (channelTarget === "bug") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            bugChannelInput = genericChannelInput;
          } else if (channelTarget === "suggestions") {
            dynamicTrackInput = null;
            dynamicTrackChannelInput = null;
            suggestionsChannelInput = genericChannelInput;
          } else {
            await interaction.reply({
              content:
                "Unknown `channel_target`. Use one of: `post`, `channel_post`, `application_log`, `log`, `accept_message`, `bug`, `suggestions`.",
              ephemeral: true,
            });
            return;
          }
        }

        if (Boolean(dynamicTrackInput) !== Boolean(dynamicTrackChannelInput)) {
          await interaction.reply({
            content:
              "Provide both `track` and a post channel together (for grouped command, use `/set channel post track:<track> channel:#channel`).",
            ephemeral: true,
          });
          return;
        }

        let dynamicTrackKey = null;
        if (dynamicTrackInput) {
          dynamicTrackKey = normalizeTrackKey(dynamicTrackInput);
          if (!dynamicTrackKey) {
            await interaction.reply({
              content:
                "Unknown track. Use `/track list` to view tracks or `/track add` to create one.",
              ephemeral: true,
            });
            return;
          }
        }

        const setChannelTrackOptions = [
          ...(Array.isArray(baseSetChannelTrackOptions)
            ? baseSetChannelTrackOptions
            : []),
          ...buildDynamicSetChannelTrackOptions(),
        ];
        const providedTrackChannelEntries = [];
        for (const optionDef of setChannelTrackOptions) {
          const primary = interaction.options.getChannel(optionDef.optionName);
          const legacy = optionDef.legacyOptionName
            ? interaction.options.getChannel(optionDef.legacyOptionName)
            : null;
          const channel = primary || legacy;
          if (channel) {
            providedTrackChannelEntries.push([optionDef.trackKey, channel]);
          }
        }
        if (dynamicTrackKey && dynamicTrackChannelInput) {
          providedTrackChannelEntries.push([dynamicTrackKey, dynamicTrackChannelInput]);
        }

        const hasTrackOption = providedTrackChannelEntries.length > 0;
        const resolvedTrackChannelIds = getActiveChannelMap();

        if (!hasTrackOption) {
          const hasExistingTrackChannel = Object.values(resolvedTrackChannelIds).some((id) =>
            isSnowflake(id)
          );
          const hasNonTrackChannelOption = Boolean(
            logChannelInput ||
              applicationLogChannelInput ||
              botLogChannelInput ||
              acceptMessageChannelInput ||
              bugChannelInput ||
              suggestionsChannelInput
          );
          const shouldAutoSetDefaultTrackFromCurrent =
            !isSetUnified && (!hasExistingTrackChannel || !hasNonTrackChannelOption);
          if (shouldAutoSetDefaultTrackFromCurrent) {
            if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
              await interaction.reply({
                content:
                  "Please run `/set channel` in a guild text channel or provide `track` + `channel`.",
                ephemeral: true,
              });
              return;
            }
            resolvedTrackChannelIds[defaultTrackKey] = interaction.channel.id;
          }
        } else {
          for (const [trackKey, channel] of providedTrackChannelEntries) {
            if (channel.type !== ChannelType.GuildText) {
              await interaction.reply({
                content: `Please choose a guild text channel for \`${getTrackLabel(trackKey)}\`.`,
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
              "No application post channels are configured. Set at least one track post channel.",
            ephemeral: true,
          });
          return;
        }

        let nextApplicationLogChannelId = getActiveLogsChannelId();
        if (applicationLogChannelInput) {
          if (applicationLogChannelInput.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Please choose a guild text channel for `application_log`.",
              ephemeral: true,
            });
            return;
          }
          nextApplicationLogChannelId = applicationLogChannelInput.id;
        }
        if (!nextApplicationLogChannelId) {
          for (const trackKey of getApplicationTrackKeys()) {
            const channelId = resolvedTrackChannelIds[trackKey];
            if (isSnowflake(channelId)) {
              nextApplicationLogChannelId = channelId;
              break;
            }
          }
        }

        let nextBotLogChannelId = getActiveBotLogsChannelId();
        const botLogInput = logChannelInput || botLogChannelInput;
        const botLogOptionName = logChannelInput ? "log" : "bot_log";
        if (botLogInput) {
          if (botLogInput.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: `Please choose a guild text channel for \`${botLogOptionName}\`.`,
              ephemeral: true,
            });
            return;
          }
          nextBotLogChannelId = botLogInput.id;
        }
        if (!nextBotLogChannelId) {
          nextBotLogChannelId = nextApplicationLogChannelId;
        }

        let nextAcceptAnnounceChannelId = getActiveAcceptAnnounceChannelId();
        if (acceptMessageChannelInput) {
          if (acceptMessageChannelInput.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Please choose a guild text channel for `accept_message`.",
              ephemeral: true,
            });
            return;
          }
          nextAcceptAnnounceChannelId = acceptMessageChannelInput.id;
        }

        let nextBugChannelId = getActiveBugChannelIdForSetChannel();
        if (bugChannelInput) {
          if (bugChannelInput.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Please choose a guild text channel for `bug`.",
              ephemeral: true,
            });
            return;
          }
          nextBugChannelId = bugChannelInput.id;
        }

        let nextSuggestionsChannelId = getActiveSuggestionsChannelIdForSetChannel();
        if (suggestionsChannelInput) {
          if (suggestionsChannelInput.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Please choose a guild text channel for `suggestions`.",
              ephemeral: true,
            });
            return;
          }
          nextSuggestionsChannelId = suggestionsChannelInput.id;
        }

        await interaction.deferReply({ ephemeral: true });

        for (const trackKey of getApplicationTrackKeys()) {
          if (isSnowflake(resolvedTrackChannelIds[trackKey])) {
            setActiveChannel(trackKey, resolvedTrackChannelIds[trackKey]);
          }
        }
        if (isSnowflake(nextApplicationLogChannelId)) {
          setActiveLogsChannel(nextApplicationLogChannelId);
        }
        if (isSnowflake(nextBotLogChannelId)) {
          setActiveBotLogsChannel(nextBotLogChannelId);
        }
        if (isSnowflake(nextAcceptAnnounceChannelId)) {
          setActiveAcceptAnnounceChannel(nextAcceptAnnounceChannelId);
        }
        if (isSnowflake(nextBugChannelId)) {
          setActiveBugChannel(nextBugChannelId);
        }
        if (isSnowflake(nextSuggestionsChannelId)) {
          setActiveSuggestionsChannel(nextSuggestionsChannelId);
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
            replayLine += ` Failed jobs: ${replayResult.failed} (first: ${replayResult.failedJobId}: ${replayResult.failedError}).`;
          }
        }

        let auditResult = "Permission audit passed.";
        try {
          await auditBotPermissions();
        } catch (err) {
          auditResult = `Permission audit failed: ${err.message}`;
        }

        const trackChannelStatusLines = getApplicationTrackKeys().map((trackKey) => {
          const trackLabel = getTrackLabel(trackKey);
          const channelId = resolvedTrackChannelIds[trackKey];
          return `${trackLabel} post channel: ${channelId ? `<#${channelId}>` : "not set"}`;
        });

        await interaction.editReply({
          content: [
            ...trackChannelStatusLines,
            `Application log channel: ${
              isSnowflake(nextApplicationLogChannelId)
                ? `<#${nextApplicationLogChannelId}>`
                : "not set"
            }`,
            `Log channel: ${
              isSnowflake(nextBotLogChannelId) ? `<#${nextBotLogChannelId}>` : "not set"
            }`,
            `Accept message channel: ${
              isSnowflake(nextAcceptAnnounceChannelId)
                ? `<#${nextAcceptAnnounceChannelId}>`
                : "not set"
            }`,
            `Bug channel: ${
              isSnowflake(nextBugChannelId) ? `<#${nextBugChannelId}>` : "not set"
            }`,
            `Suggestions channel: ${
              isSnowflake(nextSuggestionsChannelId)
                ? `<#${nextSuggestionsChannelId}>`
                : "not set"
            }`,
            replayLine,
            auditResult,
          ].join("\n"),
        });

        const trackChannelLogLines = getApplicationTrackKeys().map((trackKey) => {
          const trackLabel = getTrackLabel(trackKey);
          const channelId = resolvedTrackChannelIds[trackKey];
          return `**${trackLabel} Post:** ${channelId ? `<#${channelId}>` : "not set"}`;
        });

        await postConfigurationLog(interaction, "Application Channels Updated", [
          ...trackChannelLogLines,
          `**Application Log Channel:** ${
            isSnowflake(nextApplicationLogChannelId)
              ? `<#${nextApplicationLogChannelId}>`
              : "not set"
          }`,
          `**Log Channel:** ${
            isSnowflake(nextBotLogChannelId) ? `<#${nextBotLogChannelId}>` : "not set"
          }`,
          `**Accept Message Channel:** ${
            isSnowflake(nextAcceptAnnounceChannelId)
              ? `<#${nextAcceptAnnounceChannelId}>`
              : "not set"
          }`,
          `**Bug Channel:** ${
            isSnowflake(nextBugChannelId) ? `<#${nextBugChannelId}>` : "not set"
          }`,
          `**Suggestions Channel:** ${
            isSnowflake(nextSuggestionsChannelId)
              ? `<#${nextSuggestionsChannelId}>`
              : "not set"
          }`,
        ]);
        logInteractionDebug(
          "setchannel_command_completed",
          "Updated channel configuration.",
          interaction,
          {
            trackChannelIds: resolvedTrackChannelIds,
            applicationLogChannelId: nextApplicationLogChannelId || null,
            botLogChannelId: nextBotLogChannelId || null,
            acceptMessageChannelId: nextAcceptAnnounceChannelId || null,
            bugChannelId: nextBugChannelId || null,
            suggestionsChannelId: nextSuggestionsChannelId || null,
          }
        );
        return;
      }

      if (isClose) {
        if (!canForceDecision) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles permissions (or Administrator) to use /close.",
            ephemeral: true,
          });
          return;
        }

        const suppliedApplicationId = interaction.options.getString("application_id");
        const suppliedJobId = interaction.options.getString("job_id");
        const messageId = resolveMessageIdForCommand(interaction);
        logInteractionDebug(
          "close_command_received",
          "Processing close command.",
          interaction,
          {
            resolvedMessageId: messageId || null,
            suppliedApplicationId: suppliedApplicationId || null,
            suppliedJobId: suppliedJobId || null,
          }
        );
        if (!messageId) {
          await interaction.reply({
            content:
              suppliedApplicationId || suppliedJobId
                ? "That `application_id` or `job_id` was not found, or it matches multiple track posts."
                : "Message ID not found. Use this command inside an application thread or pass `message_id`, `application_id`, or `job_id`.",
            ephemeral: true,
          });
          return;
        }

        const reason = String(interaction.options.getString("reason") || "").trim();
        const result = await closeApplication(messageId, interaction.user.id, reason);
        if (!result.ok && result.reason === "unknown_application") {
          await interaction.reply({
            content: "This message ID is not a tracked application.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: "Application closed.",
          ephemeral: true,
        });

        await postConfigurationLog(interaction, "Application Closed", [
          `**Application:** ${result.application?.applicationId || result.application?.messageId || messageId}`,
          `**Closed By:** <@${interaction.user.id}>`,
          `**Reason:** ${reason || "none"}`,
        ]);
        logInteractionDebug(
          "close_command_completed",
          "Application closed via command.",
          interaction,
          {
            messageId,
            applicationId: result.application?.applicationId || null,
          }
        );
        return;
      }

      if (isReopen) {
        if (!canForceDecision) {
          await interaction.reply({
            content:
              "You need both Manage Server and Manage Roles permissions (or Administrator) to use /reopen.",
            ephemeral: true,
          });
          return;
        }

        const suppliedApplicationId = interaction.options.getString("application_id");
        const suppliedJobId = interaction.options.getString("job_id");
        const messageId = resolveMessageIdForCommand(interaction);
        logInteractionDebug(
          "reopen_command_received",
          "Processing reopen command.",
          interaction,
          {
            resolvedMessageId: messageId || null,
            suppliedApplicationId: suppliedApplicationId || null,
            suppliedJobId: suppliedJobId || null,
          }
        );
        if (!messageId) {
          await interaction.reply({
            content:
              suppliedApplicationId || suppliedJobId
                ? "That `application_id` or `job_id` was not found, or it matches multiple track posts."
                : "Message ID not found. Use this command inside an application thread or pass `message_id`, `application_id`, or `job_id`.",
            ephemeral: true,
          });
          return;
        }

        const reason = String(interaction.options.getString("reason") || "").trim();
        const result = await reopenApplication(messageId, interaction.user.id, reason);
        if (!result.ok && result.reason === "unknown_application") {
          await interaction.reply({
            content: "This message ID is not a tracked application.",
            ephemeral: true,
          });
          return;
        }

        if (!result.ok && result.reason === "already_pending") {
          await interaction.reply({
            content: "This application is already pending.",
            ephemeral: true,
          });
          return;
        }

        const reopenReplyLines = [
          `Application reopened (previous status: ${String(result.previousStatus || "").toUpperCase()}).`,
        ];
        if (
          String(result.previousStatus || "").toLowerCase() === statusAccepted &&
          result.reopenRoleRevertResult?.message
        ) {
          reopenReplyLines.push(`Role revert: ${result.reopenRoleRevertResult.message}`);
          reopenReplyLines.push(
            `Announcement revert: ${
              result.reopenAnnouncementRevertResult?.message ||
              "no announcement-revert action recorded"
            }`
          );
        }
        if (
          (String(result.previousStatus || "").toLowerCase() === statusAccepted ||
            String(result.previousStatus || "").toLowerCase() === statusDenied) &&
          result.reopenDmCompensationResult?.message
        ) {
          reopenReplyLines.push(`DM revert: ${result.reopenDmCompensationResult.message}`);
        }
        await interaction.reply({
          content: reopenReplyLines.join("\n"),
          ephemeral: true,
        });

        await postConfigurationLog(interaction, "Application Reopened", [
          `**Application:** ${result.application?.applicationId || result.application?.messageId || messageId}`,
          `**Previous Status:** ${String(result.previousStatus || "unknown").toUpperCase()}`,
          `**Role Revert:** ${
            result.reopenRoleRevertResult?.message || "no role-revert action recorded"
          }`,
          `**Announcement Revert:** ${
            result.reopenAnnouncementRevertResult?.message ||
            "no announcement-revert action recorded"
          }`,
          `**DM Revert:** ${
            result.reopenDmCompensationResult?.message || "no DM-revert action recorded"
          }`,
          `**Reason:** ${reason || "none"}`,
        ]);
        logInteractionDebug(
          "reopen_command_completed",
          "Application reopened via command.",
          interaction,
          {
            messageId,
            applicationId: result.application?.applicationId || null,
            previousStatus: result.previousStatus || null,
          }
        );
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

      const suppliedApplicationId = interaction.options.getString("application_id");
      const suppliedJobId = interaction.options.getString("job_id");
      const suppliedReason = String(interaction.options.getString("reason") || "").trim();
      const suppliedApplicantHint = String(
        interaction.options.getString("applicant") || ""
      ).trim();
      const acceptModeRaw = isAccept
        ? String(interaction.options.getString("mode") || "normal").trim().toLowerCase()
        : "normal";
      const acceptMode = acceptModeRaw === "force" ? "force" : "normal";
      const messageId = resolveMessageIdForCommand(interaction);
      logInteractionDebug(
        "decision_command_received",
        "Processing decision command.",
        interaction,
        {
          decisionCommand: interaction.commandName,
          resolvedMessageId: messageId || null,
          suppliedApplicationId: suppliedApplicationId || null,
          suppliedJobId: suppliedJobId || null,
          hasReason: Boolean(suppliedReason),
          hasApplicantHint: Boolean(suppliedApplicantHint),
          acceptMode: isAccept ? acceptMode : null,
        }
      );
      if (!messageId) {
        await interaction.reply({
          content:
            suppliedApplicationId || suppliedJobId
              ? "That `application_id` or `job_id` was not found, or it matches multiple track posts. Use this command in the target application thread/channel or pass `message_id`."
              : "Message ID not found. Use this command inside an application thread or pass `message_id`, `application_id`, or `job_id`.",
          ephemeral: true,
        });
        return;
      }

      const decision = isAccept ? statusAccepted : statusDenied;
      const result = await finalizeApplication(
        messageId,
        decision,
        "force_command",
        interaction.user.id,
        {
          reason: suppliedReason,
          allowMissingMemberAccept: isAccept && acceptMode === "force",
          applicantResolverHints: suppliedApplicantHint ? [suppliedApplicantHint] : [],
        }
      );

      if (!result.ok && result.reason === "unknown_application") {
        await interaction.reply({
          content: suppliedApplicationId || suppliedJobId
            ? "That `application_id` or `job_id` does not map to a unique tracked application in this context."
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

      if (
        !result.ok &&
        (result.reason === "missing_member_not_in_guild" ||
          result.reason === "unresolved_applicant_user")
      ) {
        // Show the applicant-resolve modal so the reviewer can supply the correct
        // @mention or numeric user ID.  This handles both "couldn't find any user"
        // and "found a user but they're not in the server" (wrong cached ID, stale
        // resolution, or form submitted display-name instead of real username).
        pruneExpiredAcceptResolvePrompts();
        const promptId = nextAcceptResolvePromptId();
        pendingAcceptResolvePrompts.set(promptId, {
          createdAt: Date.now(),
          userId: interaction.user.id,
          messageId,
          reason: suppliedReason || "",
          acceptMode,
          previousReason: result.reason,
        });
        await interaction.showModal(buildAcceptResolveModal(promptId));
        return;
      }

      await interaction.reply({
        content: suppliedReason
          ? `Application ${decision} by force command${isAccept ? ` (mode: ${acceptMode})` : ""}. Reason saved: ${suppliedReason}`
          : `Application ${decision} by force command${isAccept ? ` (mode: ${acceptMode})` : ""}.`,
        ephemeral: true,
      });
      logInteractionDebug(
        "decision_command_completed",
        "Application decision applied via command.",
        interaction,
        {
          decision,
          messageId,
          applicationId: result.application?.applicationId || null,
          jobId: result.application?.jobId || null,
        }
      );
    } catch (err) {
      logInteractionFailure(
        "interaction_command_failed",
        "Interaction handler failed.",
        interaction,
        err
      );
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
  };
}

module.exports = {
  createInteractionCommandHandler,
};
