/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveChannelId(trackKey = DEFAULT_TRACK_KEY) {
  const state = readState();
  return getActiveChannelIdFromState(state, trackKey);
}

module.exports = getActiveChannelId;
