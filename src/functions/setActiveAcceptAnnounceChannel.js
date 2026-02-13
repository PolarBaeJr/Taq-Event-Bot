/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveAcceptAnnounceChannel(channelId) {
  if (!isSnowflake(channelId)) {
    throw new Error("Invalid accept announce channel id.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.acceptAnnounceChannelId = channelId;
  writeState(state);
}

module.exports = setActiveAcceptAnnounceChannel;
