/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveChannelMap() {
  const state = readState();
  const result = createEmptyTrackMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    result[trackKey] = getActiveChannelIdFromState(state, trackKey);
  }
  return result;
}

module.exports = getActiveChannelMap;
