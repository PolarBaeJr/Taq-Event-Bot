/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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

module.exports = resolveGuildIdForCommands;
