/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveApprovedRoleIdsFromState(state, trackKey = DEFAULT_TRACK_KEY) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const stateRoles = normalizeTrackRoleMap(state?.settings?.approvedRoles);
  if (stateRoles[normalized].length > 0) {
    return stateRoles[normalized];
  }
  return getEnvApprovedRoleIdsForTrack(normalized);
}

module.exports = getActiveApprovedRoleIdsFromState;
