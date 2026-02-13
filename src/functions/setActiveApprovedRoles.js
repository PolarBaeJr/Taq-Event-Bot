/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setActiveApprovedRoles(trackKey, roleIds) {
  const normalized = normalizeTrackKey(trackKey);
  if (!normalized) {
    throw new Error("Invalid track key.");
  }
  const normalizedRoleIds = parseRoleIdList(roleIds);
  if (normalizedRoleIds.length === 0) {
    throw new Error("At least one valid approved role id is required.");
  }
  const state = readState();
  state.settings = state.settings && typeof state.settings === "object"
    ? state.settings
    : {};
  state.settings.approvedRoles = normalizeTrackRoleMap(state.settings.approvedRoles);
  state.settings.approvedRoles[normalized] = normalizedRoleIds;
  writeState(state);
  return {
    replaced: true,
    roleIds: state.settings.approvedRoles[normalized],
  };
}

module.exports = setActiveApprovedRoles;
