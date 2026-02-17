const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const REACTION_ROLE_GUI_PREFIX = "rrgui";
const REACTION_ROLE_GUI_ACTION_ADD = "add";
const REACTION_ROLE_GUI_ACTION_REMOVE = "remove";
const REACTION_ROLE_GUI_ACTION_MODAL_ADD = "modal_add";
const REACTION_ROLE_GUI_ACTION_MODAL_REMOVE = "modal_remove";
const APPROLE_GUI_PREFIX = "approlegui";
const APPROLE_GUI_ACTION_TRACK = "track";
const APPROLE_GUI_ACTION_ROLES = "roles";

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
  const parseRoleIdList = options.parseRoleIdList;
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
  const getActiveBugChannelIdForSetChannel = options.getActiveBugChannelIdForSetChannel;
  const getActiveSuggestionsChannelIdForSetChannel =
    options.getActiveSuggestionsChannelIdForSetChannel;
  const getApplicationTrackKeys = options.getApplicationTrackKeys;
  const setActiveChannel = options.setActiveChannel;
  const setActiveLogsChannel = options.setActiveLogsChannel;
  const setActiveBugChannel = options.setActiveBugChannel;
  const setActiveSuggestionsChannel = options.setActiveSuggestionsChannel;
  const readState = options.readState;
  const processQueuedPostJobs = options.processQueuedPostJobs;
  const auditBotPermissions = options.auditBotPermissions;
  const logControlCommand = options.logControlCommand;
  const resolveMessageIdForCommand = options.resolveMessageIdForCommand;
  const finalizeApplication = options.finalizeApplication;
  const reopenApplication = options.reopenApplication;
  const buildDashboardMessage = options.buildDashboardMessage;
  const buildUptimeMessage = typeof options.buildUptimeMessage === "function"
    ? options.buildUptimeMessage
    : () => "⏱️ Uptime is unavailable.";
  const buildSettingsMessage = options.buildSettingsMessage;
  const setTrackVoteRule = options.setTrackVoteRule;
  const setReminderConfiguration = options.setReminderConfiguration;
  const setDailyDigestConfiguration = options.setDailyDigestConfiguration;
  const setTrackReviewerMentions = options.setTrackReviewerMentions;
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

  function buildReactionRoleGuiCustomId(action, userId) {
    return `${REACTION_ROLE_GUI_PREFIX}:${action}:${String(userId || "")}`;
  }

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

  function buildAppRoleGuiCustomId(action, userId, trackKey = "") {
    const keyPart = String(trackKey || "").trim();
    return `${APPROLE_GUI_PREFIX}:${action}:${String(userId || "")}${keyPart ? `:${keyPart}` : ""}`;
  }

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

  function isValidReactionRoleTargetChannel(channel, guildId) {
    return Boolean(
      channel &&
        channel.isTextBased() &&
        typeof channel.messages?.fetch === "function" &&
        channel.guildId === guildId
    );
  }

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

  return async function onInteractionCreate(interaction) {
    try {
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

      if (interaction.isStringSelectMenu()) {
        const guiContext = parseAppRoleGuiCustomId(interaction.customId);
        if (!guiContext || guiContext.action !== APPROLE_GUI_ACTION_TRACK) {
          return;
        }

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
        return;
      }

      if (interaction.isRoleSelectMenu()) {
        const guiContext = parseAppRoleGuiCustomId(interaction.customId);
        if (!guiContext || guiContext.action !== APPROLE_GUI_ACTION_ROLES) {
          return;
        }

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
            content: "Track context expired or invalid. Re-open `/setapprolegui`.",
            components: buildAppRoleGuiComponents(interaction.user.id),
          });
          return;
        }

        const selectedRoleIds = parseRoleIdList(interaction.values || []);
        const roleUpdate = setActiveApprovedRoles(selectedTrack, selectedRoleIds);
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
        return;
      }

      if (interaction.isButton()) {
        const guiContext = parseReactionRoleGuiCustomId(interaction.customId);
        if (!guiContext) {
          return;
        }

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

      if (interaction.isModalSubmit()) {
        const guiContext = parseReactionRoleGuiCustomId(interaction.customId);
        if (!guiContext) {
          return;
        }

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
        return;
      }

      if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused(true);
        const supportsTrackAutocomplete =
          focused?.name === "track" &&
          (interaction.commandName === "setapprole" ||
            interaction.commandName === "setchannel" ||
            interaction.commandName === "debug" ||
            interaction.commandName === "track" ||
            interaction.commandName === "settings");

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
      const isSetChannel = interaction.commandName === "setchannel";
      const isSetAppRole = interaction.commandName === "setapprole";
      const isSetAppRoleGui = interaction.commandName === "setapprolegui";
      const isReactionRole = interaction.commandName === "reactionrole";
      const isTrackCommand = interaction.commandName === "track";
      const isDashboard = interaction.commandName === "dashboard";
      const isUptime = interaction.commandName === "uptime";
      const isSettings = interaction.commandName === "settings";
      const isConfig = interaction.commandName === "config";
      const isSetDenyMsg = interaction.commandName === "setdenymsg";
      const isSetAcceptMsg =
        interaction.commandName === "setacceptmsg" ||
        interaction.commandName === "setaccept";
      const isStructuredMsg = interaction.commandName === "structuredmsg";
      const isEmbedMsg = interaction.commandName === "embedmsg";
      const isEmbedEdit = interaction.commandName === "embededit";
      const isBug = interaction.commandName === "bug";
      const isSuggestions =
        interaction.commandName === "suggestions" ||
        interaction.commandName === "suggestion";
      const isDebug = interaction.commandName === "debug";
      const isStop = interaction.commandName === "stop";
      const isRestart = interaction.commandName === "restart";
      if (
        !isAccept &&
        !isDeny &&
        !isReopen &&
        !isSetChannel &&
        !isSetAppRole &&
        !isSetAppRoleGui &&
        !isReactionRole &&
        !isTrackCommand &&
        !isDashboard &&
        !isUptime &&
        !isSettings &&
        !isConfig &&
        !isSetDenyMsg &&
        !isSetAcceptMsg &&
        !isStructuredMsg &&
        !isEmbedMsg &&
        !isEmbedEdit &&
        !isBug &&
        !isSuggestions &&
        !isDebug &&
        !isStop &&
        !isRestart
      ) {
        return;
      }

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

      if (isBug) {
        await relayFeedbackCommand({
          interaction,
          commandLabel: "Bug Report",
          heading: "🐞 **Bug Report**",
          channelId: getActiveBugChannelId(),
          emptyChannelMessage:
            "Bug channel is not configured. Run `/setchannel bug:#channel` first.",
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
            "Suggestions channel is not configured. Run `/setchannel suggestions:#channel` first.",
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

      if (isSettings) {
        if (!canManageServer) {
          await interaction.reply({
            content: "You need Manage Server permission (or Administrator) to use /settings.",
            ephemeral: true,
          });
          return;
        }

        const subcommand = interaction.options.getSubcommand(true);
        if (subcommand === "show") {
          await interaction.reply({
            content: buildSettingsMessage(),
            ephemeral: true,
          });
          return;
        }

        if (subcommand === "vote") {
          const track = interaction.options.getString("track", true);
          const numerator = interaction.options.getInteger("numerator", true);
          const denominator = interaction.options.getInteger("denominator", true);
          const minimumVotes = interaction.options.getInteger("minimum_votes");

          let update;
          try {
            update = setTrackVoteRule(track, {
              numerator,
              denominator,
              minimumVotes,
            });
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
          return;
        }

        if (subcommand === "reminders") {
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
          return;
        }

        if (subcommand === "reviewers") {
          const track = interaction.options.getString("track", true);
          const mentions = interaction.options.getString("mentions", true);
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
          return;
        }

        if (subcommand === "digest") {
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
          return;
        }

        await interaction.reply({
          content: `Unknown settings action: ${subcommand}`,
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

        const action = interaction.options.getSubcommand(true);
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
            "Accepted announcement template updated. Placeholders: `{user}`, `{user_id}`, `{applicant_name}`, `{track}`, `{application_id}`, `{job_id}`, `{server}`, `{role_result}`, `{reason}`, `{decided_at}`."
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
              ...lines,
            ];
        const content = contentLines.join("\n");

        await sendChannelMessage(interaction.channelId, content, { parse: [] });
        await interaction.reply({
          content: `Structured message posted in <#${interaction.channelId}>.`,
          ephemeral: true,
        });
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

        const title = String(interaction.options.getString("title", true) || "").trim();
        const description = String(
          interaction.options.getString("description", true) || ""
        ).trim();
        if (!title || !description) {
          await interaction.reply({
            content: "Please provide both title and description.",
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

        const messageId = String(interaction.options.getString("message_id", true) || "").trim();
        if (!isSnowflake(messageId)) {
          await interaction.reply({
            content: "Please provide a valid `message_id`.",
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
            content: "Please provide a valid track. Use `/track list` to view available tracks.",
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
          return;
        }

        if (action === "create") {
          const messageId = String(interaction.options.getString("message_id", true) || "").trim();
          const emoji = String(interaction.options.getString("emoji", true) || "").trim();
          const role = interaction.options.getRole("role", true);
          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;

          if (!isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
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
          return;
        }

        if (action === "remove") {
          const messageId = String(interaction.options.getString("message_id", true) || "").trim();
          const emoji = String(interaction.options.getString("emoji", true) || "").trim();
          const channelInput = interaction.options.getChannel("channel");
          const targetChannel = channelInput || interaction.channel;

          if (!isSnowflake(messageId)) {
            await interaction.reply({
              content: "Please provide a valid message ID.",
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
          return;
        }

        await interaction.reply({
          content: `Unknown reactionrole action: ${action}`,
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

        const dynamicTrackInput = interaction.options.getString("track");
        const dynamicTrackChannelInput = interaction.options.getChannel("post_channel");
        const logChannelInput = interaction.options.getChannel("log");
        const acceptMessageChannelInput = interaction.options.getChannel("accept_message");
        const bugChannelInput = interaction.options.getChannel("bug");
        const suggestionsChannelInput = interaction.options.getChannel("suggestions");

        if (Boolean(dynamicTrackInput) !== Boolean(dynamicTrackChannelInput)) {
          await interaction.reply({
            content: "Provide both `track` and `post_channel` together.",
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
              acceptMessageChannelInput ||
              bugChannelInput ||
              suggestionsChannelInput
          );
          const shouldAutoSetDefaultTrackFromCurrent =
            !hasExistingTrackChannel || !hasNonTrackChannelOption;
          if (shouldAutoSetDefaultTrackFromCurrent) {
            if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
              await interaction.reply({
                content:
                  "Please run `/setchannel` in a guild text channel or provide track channel options.",
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
          for (const trackKey of getApplicationTrackKeys()) {
            const channelId = resolvedTrackChannelIds[trackKey];
            if (isSnowflake(channelId)) {
              nextLogChannelId = channelId;
              break;
            }
          }
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
        if (isSnowflake(nextLogChannelId)) {
          setActiveLogsChannel(nextLogChannelId);
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
            replayLine += ` Blocked at ${replayResult.failedJobId}: ${replayResult.failedError}`;
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
              isSnowflake(nextLogChannelId) ? `<#${nextLogChannelId}>` : "not set"
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
          `**Log Channel:** ${
            isSnowflake(nextLogChannelId) ? `<#${nextLogChannelId}>` : "not set"
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

        await interaction.reply({
          content: `Application reopened (previous status: ${String(result.previousStatus || "").toUpperCase()}).`,
          ephemeral: true,
        });

        await postConfigurationLog(interaction, "Application Reopened", [
          `**Application:** ${result.application?.applicationId || result.application?.messageId || messageId}`,
          `**Previous Status:** ${String(result.previousStatus || "unknown").toUpperCase()}`,
          `**Reason:** ${reason || "none"}`,
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

      const suppliedApplicationId = interaction.options.getString("application_id");
      const suppliedJobId = interaction.options.getString("job_id");
      const suppliedReason = String(interaction.options.getString("reason") || "").trim();
      const messageId = resolveMessageIdForCommand(interaction);
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

      await interaction.reply({
        content: suppliedReason
          ? `Application ${decision} by force command. Reason saved: ${suppliedReason}`
          : `Application ${decision} by force command.`,
        ephemeral: true,
      });
    } catch (err) {
      const interactionContext = {
        commandName: interaction?.commandName || null,
        userId: interaction?.user?.id || null,
        channelId: interaction?.channelId || null,
        guildId: interaction?.guildId || null,
        deferred: Boolean(interaction?.deferred),
        replied: Boolean(interaction?.replied),
        error: err?.message || String(err),
      };
      if (logger) {
        logger.error(
          "interaction_command_failed",
          "Interaction handler failed.",
          interactionContext
        );
      } else {
        console.error("Interaction handler failed:", err.message);
      }
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
