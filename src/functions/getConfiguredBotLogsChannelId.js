/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getConfiguredBotLogsChannelId() {
  const state = readState();
  if (isSnowflake(state?.settings?.botLogChannelId)) {
    return state.settings.botLogChannelId;
  }
  if (isSnowflake(config.botLogsChannelId)) {
    return config.botLogsChannelId;
  }
  return null;
}

module.exports = getConfiguredBotLogsChannelId;
