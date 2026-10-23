/*
  Core module for minecraft chat bridge.
*/

const crypto = require("node:crypto");

const DEFAULT_INTERVAL_MS = 2000;

// Discord's limit is 2000; a little under so a batch never fails on the last character.
const MESSAGE_BUDGET = 1900;

// Same alphabet and lifetime as TAqCore's codes: no 0/O or 1/I, ten minutes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_TTL_MS = 10 * 60 * 1000;

const LINK_COMMANDS = new Set(["link", "unlink", "forcelink", "forceunlink"]);

const EVENT_ICONS = {
  join: "🟢",
  quit: "🔴",
  death: "💀",
};

// normalizeString: handles normalize string.
function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

// escapeMarkdown: handles escape markdown.
//
// Game chat should arrive as typed. A player sending `# hi` or `**` is not asking for a
// heading or bold, and in Minecraft those characters mean nothing.
function escapeMarkdown(value) {
  return normalizeString(value)
    .replace(/[\\*_~`|[\]]/g, "\\$&")
    .replace(/^([#>-])/, "\\$1");
}

// formatEvent: handles format event.
//
// One game event as one Discord line. `rank` is the linked Discord member's rank name, if
// any. Unknown types are skipped rather than guessed at, so a newer TAqCore can add one
// without the bot posting something odd; `link` events are for the bot, not the channel.
function formatEvent(event, rank = null) {
  const type = normalizeString(event?.type);
  if (type === "chat") {
    const text = escapeMarkdown(event.text);
    if (!text) {
      return "";
    }
    const title = normalizeString(rank) ? `\\[${escapeMarkdown(rank)}\\] ` : "";
    return `**${title}${escapeMarkdown(event.player)}**: ${text}`;
  }
  const icon = EVENT_ICONS[type];
  if (!icon) {
    return "";
  }
  const text = escapeMarkdown(event.text) || `**${escapeMarkdown(event.player)}** ${type}`;
  return `${icon} ${text}`;
}

// batchLines: handles batch lines.
//
// A busy minute of chat as a handful of messages instead of one per line, which keeps the
// bot well inside Discord's per-channel rate limit.
function batchLines(lines, budget = MESSAGE_BUDGET) {
  const batches = [];
  let current = "";
  for (const raw of lines) {
    const line = raw.length > budget ? `${raw.slice(0, budget - 1)}…` : raw;
    if (current && current.length + 1 + line.length > budget) {
      batches.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) {
    batches.push(current);
  }
  return batches;
}

// toGameText: handles to game text.
//
// What a Discord message should read as in game. cleanContent has already turned mentions
// into @names; custom emoji are left as <:name:id>, which is noise in Minecraft, so they
// become :name:. Attachments cannot cross, so they are named instead of silently dropped.
function toGameText(message) {
  let text = normalizeString(message?.cleanContent ?? message?.content)
    .replace(/<a?(:[A-Za-z0-9_]+:)\d+>/g, "$1")
    .replace(/\s+/g, " ");
  const attachments = message?.attachments?.size || 0;
  if (attachments > 0) {
    text = `${text} [${attachments === 1 ? "attachment" : `${attachments} attachments`}]`.trim();
  }
  return text;
}

// rankOf: handles rank of.
//
// A member's rank is their highest rank role: one of `rankRoleIds` when that list is set,
// otherwise any role shown separately in the member list, which is how servers mark rank
// roles apart from "Pings" and "Verified". Returns { name, color } or null.
function rankOf(member, rankRoleIds = new Set()) {
  const roles = member?.roles?.cache;
  if (!roles || typeof roles.values !== "function") {
    return null;
  }
  const everyoneId = member.guild?.id;
  let best = null;
  for (const role of roles.values()) {
    if (!role || role.id === everyoneId) {
      continue;
    }
    const counts = rankRoleIds.size > 0 ? rankRoleIds.has(String(role.id)) : Boolean(role.hoist);
    if (counts && (!best || role.position > best.position)) {
      best = role;
    }
  }
  if (!best) {
    return null;
  }
  return {
    name: normalizeString(best.name),
    color: best.color ? `#${Number(best.color).toString(16).padStart(6, "0")}` : null,
  };
}

// newCode: handles new code.
function newCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// displayNameOf: handles display name of.
function displayNameOf(member, user) {
  return (
    normalizeString(member?.displayName) ||
    normalizeString(user?.globalName) ||
    normalizeString(user?.username) ||
    "Discord"
  );
}

// memberRoleIds: handles member role ids.
function memberRoleIds(member) {
  const roles = member?.roles;
  if (Array.isArray(roles)) {
    return roles.map(String);
  }
  if (roles?.cache && typeof roles.cache.keys === "function") {
    return [...roles.cache.keys()].map(String);
  }
  return [];
}

// createMinecraftChatBridge: handles create minecraft chat bridge.
//
// Cross chat between one Discord channel and the game, through TAqCore's remote console.
// Game to Discord polls /chat for numbered events and posts what is new; Discord to game
// posts each message in the channel to /chat, which broadcasts it as [Discord] name: text.
//
// Linked accounts (see minecraftLinks) carry over both ways: a linked player's game chat
// shows their Discord rank, and their Discord messages show in game under their IGN.
//
// The server broadcasts Discord messages rather than chatting them, so they never come back
// out of /chat, and messages from bots and webhooks are ignored here, so nothing loops.
function createMinecraftChatBridge(options = {}) {
  const minecraftConsole = options.minecraftConsole;
  const client = options.client;
  const links = options.links || null;
  const channelId = normalizeString(options.channelId);
  const rankRoleIds = new Set((options.rankRoleIds || []).map(String));
  const intervalMs = Number.isFinite(options.intervalMs)
    ? Math.max(500, Math.trunc(options.intervalMs))
    : DEFAULT_INTERVAL_MS;
  const logger = options.logger && typeof options.logger === "object" ? options.logger : null;

  // The last event relayed. Null until the first poll, which only learns where the server
  // is: whatever was said before the bot started has already been missed, and replaying a
  // buffer of it all at once would be worse than not.
  let cursor = null;
  let timer = null;
  let busy = false;
  let failing = false;

  // Codes shown by /link in Discord, waiting for the player to type them in game.
  // code -> { discordId, interaction, expires }
  const pendingLinks = new Map();

  // isEnabled: handles is enabled.
  function isEnabled() {
    return Boolean(channelId && minecraftConsole?.isConfigured?.());
  }

  // fetchChannel: handles fetch channel.
  async function fetchChannel() {
    const channel = await client.channels.fetch(channelId);
    if (!channel || typeof channel.send !== "function") {
      throw new Error(`Channel ${channelId} is not a text channel the bot can post in.`);
    }
    return channel;
  }

  // rankForPlayer: handles rank for player. The Discord rank of whoever linked this UUID.
  async function rankForPlayer(guild, uuid) {
    const discordId = links?.findByUuid(uuid);
    if (!discordId || !guild?.members?.fetch) {
      return null;
    }
    const member = await guild.members.fetch(discordId).catch(() => null);
    return rankOf(member, rankRoleIds);
  }

  // completeLink: handles complete link.
  //
  // A player typed a code from Discord's /link in game. Ties the two together and tells
  // the Discord side, which is still waiting on its own ephemeral reply.
  async function completeLink(event) {
    const code = normalizeString(event.text).toUpperCase();
    const pending = pendingLinks.get(code);
    if (!pending) {
      return;
    }
    pendingLinks.delete(code);
    if (pending.expires < Date.now() || !links) {
      return;
    }
    links.set(pending.discordId, { uuid: event.uuid, player: event.player });
    await pending.interaction
      ?.followUp?.({ content: `Linked to **${escapeMarkdown(event.player)}**.`, ephemeral: true })
      .catch(() => {});
  }

  // pollOnce: handles poll once.
  async function pollOnce() {
    if (!isEnabled() || busy) {
      return 0;
    }
    busy = true;
    try {
      const { head, events } = await minecraftConsole.chat({ since: cursor ?? 0 });
      const latest = Math.max(0, head - 1);

      if (cursor === null) {
        cursor = latest;
        return 0;
      }
      // Numbers went backwards: the server restarted and started counting again. Start
      // from the top of the new count on the next poll.
      if (latest < cursor) {
        cursor = 0;
        return 0;
      }

      const fresh = events
        .filter((event) => Number(event?.seq) > cursor)
        .sort((a, b) => a.seq - b.seq);
      if (fresh.length === 0) {
        return 0;
      }

      const channel = await fetchChannel();
      const lines = [];
      for (const event of fresh) {
        if (event.type === "link") {
          await completeLink(event);
          continue;
        }
        let rank = null;
        if (event.type === "chat" && links) {
          links.updatePlayerName(event.uuid, event.player);
          rank = (await rankForPlayer(channel.guild, event.uuid))?.name || null;
        }
        const line = formatEvent(event, rank);
        if (line) {
          lines.push(line);
        }
      }

      for (const content of batchLines(lines)) {
        await channel.send({ content, allowedMentions: { parse: [] } });
      }
      cursor = fresh[fresh.length - 1].seq;

      if (failing) {
        failing = false;
        logger?.info?.("minecraft_chat_recovered", "Minecraft chat relay is working again.");
      }
      return lines.length;
    } catch (error) {
      // Said once per outage, not once every two seconds while the server is down.
      if (!failing) {
        failing = true;
        logger?.warn?.("minecraft_chat_poll_failed", "Minecraft chat relay failed.", {
          error: error?.message || String(error),
        });
      }
      return 0;
    } finally {
      busy = false;
    }
  }

  // handleMessage: handles handle message.
  //
  // Returns whether the message was sent into the game.
  async function handleMessage(message) {
    if (!isEnabled() || message?.channelId !== channelId) {
      return false;
    }
    if (message.author?.bot || message.webhookId || message.system) {
      return false;
    }
    const content = toGameText(message);
    if (!content) {
      return false;
    }
    const link = links?.get(message.author?.id);
    const author = link?.player || displayNameOf(message.member, message.author);
    const rank = rankOf(message.member, rankRoleIds);

    try {
      await minecraftConsole.say({ author, content, rank: rank?.name, rankColor: rank?.color });
      return true;
    } catch (error) {
      logger?.warn?.("minecraft_chat_send_failed", "Could not send a Discord message to the game.", {
        error: error?.message || String(error),
      });
      // Visible to the sender, so they know the server did not see it.
      await message.react?.("⚠️").catch(() => {});
      return false;
    }
  }

  // reply: handles reply. Every link reply is ephemeral; codes are not for the channel.
  //
  // Deferred first, because a round trip to the server can outlast Discord's three seconds.
  function reply(interaction, content) {
    const payload = { content, allowedMentions: { parse: [] } };
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply({ ...payload, ephemeral: true });
  }

  // handleInteraction: handles handle interaction.
  //
  // /link, /unlink, /forcelink and /forceunlink. Returns false for anything else so the
  // main command handler gets it.
  async function handleInteraction(interaction) {
    if (!interaction?.isChatInputCommand?.() || !LINK_COMMANDS.has(interaction.commandName)) {
      return false;
    }
    if (!isEnabled() || !links) {
      await reply(interaction, "Cross chat is not set up on this bot.");
      return true;
    }

    const name = interaction.commandName;
    const userId = interaction.user.id;
    try {
      await interaction.deferReply?.({ ephemeral: true });
      if (name === "link") {
        const code = normalizeString(interaction.options.getString("code"));
        if (code) {
          const claim = await minecraftConsole.claimLink(code);
          links.set(userId, claim);
          await reply(interaction, `Linked to **${escapeMarkdown(claim.player)}**.`);
          return true;
        }

        const fresh = newCode();
        const now = Date.now();
        for (const [key, pending] of pendingLinks) {
          if (pending.expires < now || pending.discordId === userId) {
            pendingLinks.delete(key);
          }
        }
        await minecraftConsole.offerLink({
          code: fresh,
          discord: displayNameOf(interaction.member, interaction.user),
        });
        pendingLinks.set(fresh, { discordId: userId, interaction, expires: now + LINK_TTL_MS });
        await reply(
          interaction,
          `Run \`/link ${fresh}\` in game within 10 minutes.\n` +
            "Already have a code from the game? Use `/link code:<code>` here instead."
        );
        return true;
      }

      if (name === "unlink") {
        const removed = links.remove(userId);
        await reply(
          interaction,
          removed ? `Unlinked from **${escapeMarkdown(removed.player)}**.` : "You are not linked."
        );
        return true;
      }

      // The force commands are staff tools, so they sit behind the same allowlist as /mc.
      if (!minecraftConsole.isAllowed({ userId, roleIds: memberRoleIds(interaction.member) })) {
        await reply(interaction, "You are not allowed to change other people's links.");
        return true;
      }
      const target = interaction.options.getUser("user", true);

      if (name === "forcelink") {
        const player = await minecraftConsole.lookupPlayer(interaction.options.getString("ign", true));
        links.set(target.id, player);
        logger?.info?.("minecraft_link_forced", "Staff linked an account by hand.", {
          by: userId,
          discordId: target.id,
          player: player.player,
        });
        await reply(interaction, `Linked <@${target.id}> to **${escapeMarkdown(player.player)}**.`);
        return true;
      }

      const removed = links.remove(target.id);
      logger?.info?.("minecraft_link_force_removed", "Staff removed a link by hand.", {
        by: userId,
        discordId: target.id,
      });
      await reply(
        interaction,
        removed
          ? `Unlinked <@${target.id}> from **${escapeMarkdown(removed.player)}**.`
          : `<@${target.id}> is not linked.`
      );
      return true;
    } catch (error) {
      await reply(interaction, error?.message || "Something went wrong.").catch(() => {});
      return true;
    }
  }

  // start: handles start.
  function start() {
    if (!isEnabled() || timer) {
      return false;
    }
    pollOnce();
    timer = setInterval(pollOnce, intervalMs);
    timer.unref?.();
    logger?.info?.("minecraft_chat_started", "Minecraft chat relay started.", {
      channelId,
      intervalMs,
    });
    return true;
  }

  // stop: handles stop.
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    isEnabled,
    pollOnce,
    handleMessage,
    handleInteraction,
    start,
    stop,
  };
}

module.exports = {
  createMinecraftChatBridge,
  formatEvent,
  batchLines,
  escapeMarkdown,
  toGameText,
  rankOf,
};
