/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getAnyActiveChannelId() {
  const channels = getActiveChannelMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    if (isSnowflake(channels[trackKey])) {
      return channels[trackKey];
    }
  }
  return null;
}

module.exports = getAnyActiveChannelId;
