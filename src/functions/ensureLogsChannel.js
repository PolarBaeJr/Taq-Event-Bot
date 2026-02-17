/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function ensureLogsChannel(guild) {
  return ensureNamedLogsChannel(guild, {
    configuredChannelId: getActiveLogsChannelId(),
    channelName: config.logsChannelName,
    createReason: "Application logs channel",
  });
}

module.exports = ensureLogsChannel;
