/*
  Core module for minecraft chat bridge.
*/

const DEFAULT_INTERVAL_MS = 2000;

// Discord's limit is 2000; a little under so a batch never fails on the last character.
const MESSAGE_BUDGET = 1900;

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
    .replace(/[\\*_~`|]/g, "\\$&")
    .replace(/^([#>-])/, "\\$1");
}

// formatEvent: handles format event.
//
// One game event as one Discord line. Unknown types are skipped rather than guessed at, so
// a newer TAqCore can add one without the bot posting something odd.
function formatEvent(event) {
  const type = normalizeString(event?.type);
  if (type === "chat") {
    const text = escapeMarkdown(event.text);
    return text ? `**${escapeMarkdown(event.player)}**: ${text}` : "";
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

// createMinecraftChatBridge: handles create minecraft chat bridge.
//
// Cross chat between one Discord channel and the game, through TAqCore's remote console.
// Game to Discord polls /chat for numbered events and posts what is new; Discord to game
// posts each message in the channel to /chat, which broadcasts it as [Discord] name: text.
//
// The server broadcasts Discord messages rather than chatting them, so they never come back
// out of /chat, and messages from bots and webhooks are ignored here, so nothing loops.
function createMinecraftChatBridge(options = {}) {
  const minecraftConsole = options.minecraftConsole;
  const client = options.client;
  const channelId = normalizeString(options.channelId);
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

      const lines = fresh.map(formatEvent).filter(Boolean);
      if (lines.length > 0) {
        const channel = await fetchChannel();
        for (const content of batchLines(lines)) {
          await channel.send({ content, allowedMentions: { parse: [] } });
        }
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
    const author =
      normalizeString(message.member?.displayName) ||
      normalizeString(message.author?.globalName) ||
      normalizeString(message.author?.username) ||
      "Discord";

    try {
      await minecraftConsole.say({ author, content });
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
};
