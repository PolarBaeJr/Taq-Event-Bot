/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveChannelIdFromState(state, trackKey = DEFAULT_TRACK_KEY) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const stateChannels = normalizeTrackMap(state?.settings?.channels);
  if (isSnowflake(stateChannels[normalized])) {
    return stateChannels[normalized];
  }
  return getEnvChannelIdForTrack(normalized);
}

module.exports = getActiveChannelIdFromState;
