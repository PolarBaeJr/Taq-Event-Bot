/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeTrackReviewerMap(rawMap) {
  const normalized = createEmptyTrackReviewerMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key || !rawValue || typeof rawValue !== "object") {
      continue;
    }

    normalized[key] = {
      roleIds: parseRoleIdList(rawValue.roleIds),
      userIds: parseUserIdList(rawValue.userIds),
      rotationIndex: clampInteger(rawValue.rotationIndex, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        fallback: 0,
      }),
    };
  }

  return normalized;
}

module.exports = normalizeTrackReviewerMap;
