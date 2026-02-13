/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getEnvApprovedRoleIdsForTrack(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  if (normalized === TRACK_TESTER) {
    const fromList = parseRoleIdList(config.testerApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.testerApprovedRoleId)) {
      return [config.testerApprovedRoleId];
    }
    const legacyList = parseRoleIdList(config.approvedRoleIds);
    if (legacyList.length > 0) {
      return legacyList;
    }
    if (isSnowflake(config.approvedRoleId)) {
      return [config.approvedRoleId];
    }
    return [];
  }
  if (normalized === TRACK_BUILDER) {
    const fromList = parseRoleIdList(config.builderApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.builderApprovedRoleId)) {
      return [config.builderApprovedRoleId];
    }
    return [];
  }
  if (normalized === TRACK_CMD) {
    const fromList = parseRoleIdList(config.cmdApprovedRoleIds);
    if (fromList.length > 0) {
      return fromList;
    }
    if (isSnowflake(config.cmdApprovedRoleId)) {
      return [config.cmdApprovedRoleId];
    }
    return [];
  }
  return [];
}

module.exports = getEnvApprovedRoleIdsForTrack;
