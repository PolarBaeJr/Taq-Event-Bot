/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveBugChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid bug channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.bugChannelId = channelId;
  writeState(state);
}

module.exports = setActiveBugChannel;
