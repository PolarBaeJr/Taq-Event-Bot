/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveApprovedRoleIds(trackKey = DEFAULT_TRACK_KEY) {
  const state = readState();
  return getActiveApprovedRoleIdsFromState(state, trackKey);
}

module.exports = getActiveApprovedRoleIds;
