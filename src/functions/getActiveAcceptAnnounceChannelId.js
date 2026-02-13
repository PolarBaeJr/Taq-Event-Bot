/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveAcceptAnnounceChannelId() {
  const state = readState();
  if (isSnowflake(state?.settings?.acceptAnnounceChannelId)) {
    return state.settings.acceptAnnounceChannelId;
  }
  if (isSnowflake(config.acceptAnnounceChannelId)) {
    return config.acceptAnnounceChannelId;
  }
  return null;
}

module.exports = getActiveAcceptAnnounceChannelId;
