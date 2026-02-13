/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveChannel(trackKey, channelId) {
  const normalized = normalizeTrackKey(trackKey);
  if (!normalized) {
    throw new Error("Invalid track key.");
  }
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.channels = normalizeTrackMap(state.settings.channels);
  state.settings.channels[normalized] = channelId;
  writeState(state);
}

module.exports = setActiveChannel;
