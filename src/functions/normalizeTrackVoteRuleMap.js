/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeTrackVoteRuleMap(rawMap) {
  const normalized = createEmptyTrackVoteRuleMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key) {
      continue;
    }
    normalized[key] = normalizeVoteRule(rawValue);
  }

  return normalized;
}

module.exports = normalizeTrackVoteRuleMap;
