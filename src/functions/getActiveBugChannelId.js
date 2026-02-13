/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveBugChannelId() {
  const state = readState();
  if (isSnowflake(state?.settings?.bugChannelId)) {
    return state.settings.bugChannelId;
  }
  if (isSnowflake(config.bugChannelId)) {
    return config.bugChannelId;
  }
  return null;
}

module.exports = getActiveBugChannelId;
