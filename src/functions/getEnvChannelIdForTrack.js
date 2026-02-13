/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getEnvChannelIdForTrack(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  if (normalized === TRACK_TESTER) {
    if (isSnowflake(config.testerChannelId)) {
      return config.testerChannelId;
    }
    if (isSnowflake(config.channelId)) {
      return config.channelId;
    }
    return null;
  }
  if (normalized === TRACK_BUILDER && isSnowflake(config.builderChannelId)) {
    return config.builderChannelId;
  }
  if (normalized === TRACK_CMD && isSnowflake(config.cmdChannelId)) {
    return config.cmdChannelId;
  }
  return null;
}

module.exports = getEnvChannelIdForTrack;
