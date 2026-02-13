/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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

module.exports = getActiveLogsChannelId;
