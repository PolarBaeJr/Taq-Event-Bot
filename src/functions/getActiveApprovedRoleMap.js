/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveApprovedRoleMap() {
  const state = readState();
  const result = createEmptyTrackRoleMap();
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    result[trackKey] = getActiveApprovedRoleIdsFromState(state, trackKey);
  }
  return result;
}

module.exports = getActiveApprovedRoleMap;
