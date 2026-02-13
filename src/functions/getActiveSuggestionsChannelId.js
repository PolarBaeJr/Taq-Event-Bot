/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveSuggestionsChannelId() {
  const state = readState();
  if (isSnowflake(state?.settings?.suggestionsChannelId)) {
    return state.settings.suggestionsChannelId;
  }
  if (isSnowflake(config.suggestionsChannelId)) {
    return config.suggestionsChannelId;
  }
  return null;
}

module.exports = getActiveSuggestionsChannelId;
