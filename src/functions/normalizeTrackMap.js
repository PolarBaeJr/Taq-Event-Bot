/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeTrackMap(rawMap) {
  const normalized = createEmptyTrackMap();
  if (!rawMap || typeof rawMap !== "object") {
    return normalized;
  }

  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = normalizeTrackKey(rawKey);
    if (!key || !isSnowflake(rawValue)) {
      continue;
    }
    normalized[key] = rawValue;
  }

  return normalized;
}

module.exports = normalizeTrackMap;
