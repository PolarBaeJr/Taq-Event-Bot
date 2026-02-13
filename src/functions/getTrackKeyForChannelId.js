/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getTrackKeyForChannelId(channelId) {
  if (!isSnowflake(channelId)) {
    return null;
  }
  const channels = getActiveChannelMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    if (channels[trackKey] === channelId) {
      return trackKey;
    }
  }
  return null;
}

module.exports = getTrackKeyForChannelId;
