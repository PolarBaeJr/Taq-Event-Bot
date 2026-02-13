/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveSuggestionsChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid suggestions channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.suggestionsChannelId = channelId;
  writeState(state);
}

module.exports = setActiveSuggestionsChannel;
