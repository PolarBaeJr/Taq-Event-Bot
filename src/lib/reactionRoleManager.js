/*
  Core module for reaction role manager.
*/

const CUSTOM_EMOJI_MENTION_PATTERN = /^<a?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/;
const CUSTOM_EMOJI_COLON_PATTERN = /^([a-zA-Z0-9_]{2,32}):(\d{17,20})$/;
const CUSTOM_EMOJI_ID_PATTERN = /^(\d{17,20})$/;
const DEFAULT_REACTION_ROLE_LIST_MAX_LINES = 40;

// defaultIsSnowflake: handles default is snowflake.
function defaultIsSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

// normalizeReactionRoleEmojiInput: handles normalize reaction role emoji input.
function normalizeReactionRoleEmojiInput(rawValue, options = {}) {
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : defaultIsSnowflake;
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  const mentionMatch = CUSTOM_EMOJI_MENTION_PATTERN.exec(raw);
  if (mentionMatch) {
    const emojiName = mentionMatch[1];
    const emojiId = mentionMatch[2];
    return {
      key: `custom:${emojiId}`,
      type: "custom",
      emojiId,
      emojiName,
      display: `<:${emojiName}:${emojiId}>`,
      reactionIdentifier: `${emojiName}:${emojiId}`,
    };
  }

  const colonMatch = CUSTOM_EMOJI_COLON_PATTERN.exec(raw);
  if (colonMatch) {
    const emojiName = colonMatch[1];
    const emojiId = colonMatch[2];
    return {
      key: `custom:${emojiId}`,
      type: "custom",
      emojiId,
      emojiName,
      display: `<:${emojiName}:${emojiId}>`,
      reactionIdentifier: `${emojiName}:${emojiId}`,
    };
  }

  const idMatch = CUSTOM_EMOJI_ID_PATTERN.exec(raw);
  if (idMatch) {
    const emojiId = idMatch[1];
    if (!isSnowflake(emojiId)) {
      return null;
    }
    return {
      key: `custom:${emojiId}`,
      type: "custom",
      emojiId,
      emojiName: null,
      display: `custom:${emojiId}`,
      reactionIdentifier: emojiId,
    };
  }

  const unicodeValue = raw.normalize("NFC");
  if (!unicodeValue || /\s/.test(unicodeValue) || unicodeValue.length > 64) {
    return null;
  }
  return {
    key: `unicode:${unicodeValue}`,
    type: "unicode",
    emojiId: null,
    emojiName: unicodeValue,
    display: unicodeValue,
    reactionIdentifier: unicodeValue,
  };
}

// normalizeStoredReactionRoleEmojiKey: handles normalize stored reaction role emoji key.
function normalizeStoredReactionRoleEmojiKey(rawValue, options = {}) {
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : defaultIsSnowflake;
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("custom:")) {
    const customId = raw.slice("custom:".length).trim();
    if (!isSnowflake(customId)) {
      return null;
    }
    return `custom:${customId}`;
  }

  if (raw.startsWith("unicode:")) {
    const unicodeValue = raw.slice("unicode:".length).trim().normalize("NFC");
    if (!unicodeValue || /\s/.test(unicodeValue) || unicodeValue.length > 64) {
      return null;
    }
    return `unicode:${unicodeValue}`;
  }

  const parsed = normalizeReactionRoleEmojiInput(raw, { isSnowflake });
  return parsed ? parsed.key : null;
}

// normalizeReactionRoleBindings: handles normalize reaction role bindings.
function normalizeReactionRoleBindings(rawBindings, options = {}) {
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : defaultIsSnowflake;
  const bindings = Array.isArray(rawBindings) ? rawBindings : [];
  const deduped = new Map();

  for (const rawBinding of bindings) {
    if (!rawBinding || typeof rawBinding !== "object") {
      continue;
    }

    const guildId = String(rawBinding.guildId || "").trim();
    const channelId = String(rawBinding.channelId || "").trim();
    const messageId = String(rawBinding.messageId || "").trim();
    const roleId = String(rawBinding.roleId || "").trim();
    if (
      !isSnowflake(guildId) ||
      !isSnowflake(channelId) ||
      !isSnowflake(messageId) ||
      !isSnowflake(roleId)
    ) {
      continue;
    }

    const normalizedEmojiKey =
      normalizeStoredReactionRoleEmojiKey(rawBinding.emojiKey, { isSnowflake }) ||
      normalizeStoredReactionRoleEmojiKey(rawBinding.emojiDisplay, { isSnowflake }) ||
      normalizeStoredReactionRoleEmojiKey(rawBinding.emoji, { isSnowflake });
    if (!normalizedEmojiKey) {
      continue;
    }

    let fallbackEmojiDisplay = "";
    if (normalizedEmojiKey.startsWith("unicode:")) {
      fallbackEmojiDisplay = normalizedEmojiKey.slice("unicode:".length);
    } else {
      fallbackEmojiDisplay = `custom:${normalizedEmojiKey.slice("custom:".length)}`;
    }

    const emojiDisplay =
      typeof rawBinding.emojiDisplay === "string" && rawBinding.emojiDisplay.trim()
        ? rawBinding.emojiDisplay.trim()
        : fallbackEmojiDisplay;

    const normalized = {
      guildId,
      channelId,
      messageId,
      roleId,
      emojiKey: normalizedEmojiKey,
      emojiDisplay,
      createdAt:
        typeof rawBinding.createdAt === "string" && rawBinding.createdAt
          ? rawBinding.createdAt
          : new Date().toISOString(),
      createdBy: isSnowflake(rawBinding.createdBy) ? rawBinding.createdBy : null,
      updatedAt:
        typeof rawBinding.updatedAt === "string" && rawBinding.updatedAt
          ? rawBinding.updatedAt
          : null,
    };

    const identity = `${guildId}:${channelId}:${messageId}:${normalizedEmojiKey}`;
    deduped.set(identity, normalized);
  }

  return [...deduped.values()].sort(
    (a, b) =>
      a.channelId.localeCompare(b.channelId) ||
      a.messageId.localeCompare(b.messageId) ||
      a.emojiDisplay.localeCompare(b.emojiDisplay)
  );
}

// getReactionRoleEmojiKeyFromReaction: handles get reaction role emoji key from reaction.
function getReactionRoleEmojiKeyFromReaction(emoji, options = {}) {
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : defaultIsSnowflake;
  const emojiId = String(emoji?.id || "").trim();
  if (isSnowflake(emojiId)) {
    return `custom:${emojiId}`;
  }
  const emojiName = String(emoji?.name || "").trim();
  if (!emojiName) {
    return null;
  }
  return `unicode:${emojiName.normalize("NFC")}`;
}

// createReactionRoleManager: handles create reaction role manager.
function createReactionRoleManager(options = {}) {
  const readState = typeof options.readState === "function"
    ? options.readState
    : () => ({ settings: {} });
  const writeState = typeof options.writeState === "function"
    ? options.writeState
    : () => {};
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : defaultIsSnowflake;
  const client = options.client;
  const logger =
    options.logger &&
    typeof options.logger.info === "function" &&
    typeof options.logger.warn === "function"
      ? options.logger
      : {
          info: () => {},
          warn: () => {},
        };
  const PermissionsBitField = options.PermissionsBitField;
  const manageRolesPermission = PermissionsBitField?.Flags?.ManageRoles;

  // ensureReactionRoleSettings: handles ensure reaction role settings.
  function ensureReactionRoleSettings(state) {
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.reactionRoles = normalizeReactionRoleBindings(
      state.settings.reactionRoles,
      { isSnowflake }
    );
    return state.settings;
  }

  // upsertReactionRoleBinding: handles upsert reaction role binding.
  function upsertReactionRoleBinding({
    guildId,
    channelId,
    messageId,
    roleId,
    emojiInput,
    actorId,
  }) {
    if (!isSnowflake(guildId)) {
      throw new Error("Invalid guild id.");
    }
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid channel id.");
    }
    if (!isSnowflake(messageId)) {
      throw new Error("Invalid message id.");
    }
    if (!isSnowflake(roleId)) {
      throw new Error("Invalid role id.");
    }

    const parsedEmoji = normalizeReactionRoleEmojiInput(emojiInput, { isSnowflake });
    if (!parsedEmoji) {
      throw new Error("Invalid emoji. Use a standard emoji or custom emoji like `<:name:id>`.");
    }

    const state = readState();
    const settings = ensureReactionRoleSettings(state);
    const identity = `${guildId}:${channelId}:${messageId}:${parsedEmoji.key}`;
    const existingIndex = settings.reactionRoles.findIndex(
      (binding) =>
        `${binding.guildId}:${binding.channelId}:${binding.messageId}:${binding.emojiKey}` ===
        identity
    );
    const existing = existingIndex >= 0 ? settings.reactionRoles[existingIndex] : null;
    const nowIso = new Date().toISOString();

    const binding = {
      guildId,
      channelId,
      messageId,
      roleId,
      emojiKey: parsedEmoji.key,
      emojiDisplay: parsedEmoji.display,
      createdAt: existing?.createdAt || nowIso,
      createdBy: existing?.createdBy || (isSnowflake(actorId) ? actorId : null),
      updatedAt: existing ? nowIso : null,
    };

    if (existingIndex >= 0) {
      settings.reactionRoles[existingIndex] = binding;
    } else {
      settings.reactionRoles.push(binding);
    }
    settings.reactionRoles = normalizeReactionRoleBindings(settings.reactionRoles, {
      isSnowflake,
    });
    writeState(state);

    const persisted =
      settings.reactionRoles.find(
        (item) =>
          `${item.guildId}:${item.channelId}:${item.messageId}:${item.emojiKey}` === identity
      ) || binding;

    return {
      created: existingIndex < 0,
      binding: persisted,
      emoji: parsedEmoji,
    };
  }

  // removeReactionRoleBinding: handles remove reaction role binding.
  function removeReactionRoleBinding({ guildId, channelId, messageId, emojiInput }) {
    if (!isSnowflake(guildId)) {
      throw new Error("Invalid guild id.");
    }
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid channel id.");
    }
    if (!isSnowflake(messageId)) {
      throw new Error("Invalid message id.");
    }

    const parsedEmoji = normalizeReactionRoleEmojiInput(emojiInput, { isSnowflake });
    if (!parsedEmoji) {
      throw new Error("Invalid emoji. Use a standard emoji or custom emoji like `<:name:id>`.");
    }

    const state = readState();
    const settings = ensureReactionRoleSettings(state);
    let removedBinding = null;
    settings.reactionRoles = settings.reactionRoles.filter((binding) => {
      const isMatch =
        binding.guildId === guildId &&
        binding.channelId === channelId &&
        binding.messageId === messageId &&
        binding.emojiKey === parsedEmoji.key;
      if (isMatch) {
        removedBinding = binding;
      }
      return !isMatch;
    });

    if (!removedBinding) {
      return {
        removed: false,
        binding: null,
        emoji: parsedEmoji,
      };
    }

    writeState(state);
    return {
      removed: true,
      binding: removedBinding,
      emoji: parsedEmoji,
    };
  }

  // listReactionRoleBindings: handles list reaction role bindings.
  function listReactionRoleBindings({ guildId, channelId, messageId } = {}) {
    const state = readState();
    const settings = ensureReactionRoleSettings(state);

    return settings.reactionRoles.filter((binding) => {
      if (isSnowflake(guildId) && binding.guildId !== guildId) {
        return false;
      }
      if (isSnowflake(channelId) && binding.channelId !== channelId) {
        return false;
      }
      if (isSnowflake(messageId) && binding.messageId !== messageId) {
        return false;
      }
      return true;
    });
  }

  // applyReactionRoleFromEvent: handles apply reaction role from event.
  async function applyReactionRoleFromEvent(reaction, user, action = "add") {
    const normalizedAction = action === "remove" ? "remove" : "add";
    if (!user || user.bot) {
      return false;
    }

    const message = reaction?.message;
    const messageId = String(message?.id || "").trim();
    const channelId = String(message?.channelId || "").trim();
    const guildId = String(message?.guildId || message?.guild?.id || "").trim();
    if (!isSnowflake(messageId) || !isSnowflake(channelId) || !isSnowflake(guildId)) {
      return false;
    }

    const emojiKey = getReactionRoleEmojiKeyFromReaction(reaction?.emoji, { isSnowflake });
    if (!emojiKey) {
      return false;
    }

    const binding = listReactionRoleBindings({
      guildId,
      channelId,
      messageId,
    }).find((entry) => entry.emojiKey === emojiKey);
    if (!binding) {
      return false;
    }

    let guild = message?.guild || null;
    if (!guild) {
      try {
        guild = await client.guilds.fetch(guildId);
      } catch {
        guild = null;
      }
    }
    if (!guild) {
      return true;
    }

    const [me, member, role] = await Promise.all([
      guild.members.fetchMe().catch(() => null),
      guild.members.fetch(user.id).catch(() => null),
      guild.roles.fetch(binding.roleId).catch(() => null),
    ]);
    if (!me || !member || !role) {
      return true;
    }

    if (!manageRolesPermission || !me.permissions.has(manageRolesPermission)) {
      logger.warn(
        "reaction_role_missing_manage_roles",
        "Cannot process reaction role without ManageRoles.",
        {
          guildId,
          roleId: binding.roleId,
          action: normalizedAction,
        }
      );
      return true;
    }
    if (role.managed || me.roles.highest.comparePositionTo(role) <= 0) {
      logger.warn(
        "reaction_role_unassignable",
        "Reaction role target is not assignable by bot.",
        {
          guildId,
          roleId: binding.roleId,
          action: normalizedAction,
          managed: role.managed,
        }
      );
      return true;
    }

    const hasRole = member.roles.cache.has(role.id);
    if (normalizedAction === "add" && hasRole) {
      return true;
    }
    if (normalizedAction === "remove" && !hasRole) {
      return true;
    }

    const reason = `Reaction role ${normalizedAction} (${binding.emojiDisplay}) message ${binding.messageId}`;
    if (normalizedAction === "add") {
      await member.roles.add(role.id, reason);
    } else {
      await member.roles.remove(role.id, reason);
    }

    logger.info("reaction_role_applied", "Reaction role change applied.", {
      guildId,
      channelId,
      messageId,
      roleId: role.id,
      userId: member.id,
      action: normalizedAction,
      emojiKey,
    });
    return true;
  }

  return {
    upsertReactionRoleBinding,
    removeReactionRoleBinding,
    listReactionRoleBindings,
    applyReactionRoleFromEvent,
  };
}

module.exports = {
  DEFAULT_REACTION_ROLE_LIST_MAX_LINES,
  normalizeReactionRoleBindings,
  createReactionRoleManager,
};
