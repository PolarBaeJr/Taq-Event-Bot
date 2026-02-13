/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveLogsChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid log channel id.");
  }
  const state = readState();
  state.settings.logChannelId = channelId;
  writeState(state);
}

module.exports = setActiveLogsChannel;
