/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function ensureBotLogsChannel(guild) {
  const configuredBotLogsChannelId = getConfiguredBotLogsChannelId();
  if (!configuredBotLogsChannelId) {
    return ensureLogsChannel(guild);
  }
  return ensureNamedLogsChannel(guild, {
    configuredChannelId: configuredBotLogsChannelId,
    channelName: config.botLogsChannelName,
    createReason: "Bot operation logs channel",
  });
}

module.exports = ensureBotLogsChannel;
