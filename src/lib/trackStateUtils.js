function createTrackStateUtils(options = {}) {
  const defaultTrackKey = String(options.defaultTrackKey || "tester");
  const normalizeTrackAlias = typeof options.normalizeTrackAlias === "function"
    ? options.normalizeTrackAlias
    : (value) => String(value || "").trim().toLowerCase();
  const getApplicationTracks = typeof options.getApplicationTracks === "function"
    ? options.getApplicationTracks
    : () => [];
  const getApplicationTrackKeys = typeof options.getApplicationTrackKeys === "function"
    ? options.getApplicationTrackKeys
    : () => [];
  const getTrackLookupByKey = typeof options.getTrackLookupByKey === "function"
    ? options.getTrackLookupByKey
    : () => ({});
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : () => false;
  const parseRoleIdList = typeof options.parseRoleIdList === "function"
    ? options.parseRoleIdList
    : () => [];

  function normalizeTrackKey(value) {
    const normalized = normalizeTrackAlias(value);
    if (!normalized) {
      return null;
    }
    for (const track of getApplicationTracks()) {
      if (
        track.key === normalized ||
        (Array.isArray(track.aliases) && track.aliases.includes(normalized))
      ) {
        return track.key;
      }
    }
    return null;
  }

  function getTrackLabel(trackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const lookup = getTrackLookupByKey();
    return lookup[normalized]?.label || lookup[defaultTrackKey]?.label || defaultTrackKey;
  }

  function normalizeTrackKeys(values, options = {}) {
    const { allowEmpty = false } = options;
    const fallback = Object.prototype.hasOwnProperty.call(options, "fallback")
      ? options.fallback
      : [defaultTrackKey];

    const unique = new Set();
    const source = Array.isArray(values) ? values : [values];
    for (const value of source) {
      const normalized = normalizeTrackKey(value);
      if (normalized) {
        unique.add(normalized);
      }
    }

    const orderedTrackKeys = getApplicationTrackKeys();
    const ordered = orderedTrackKeys.filter((key) => unique.has(key));
    if (ordered.length > 0) {
      return ordered;
    }

    const fallbackSet = new Set();
    const fallbackSource = Array.isArray(fallback) ? fallback : [fallback];
    for (const value of fallbackSource) {
      const normalized = normalizeTrackKey(value);
      if (normalized) {
        fallbackSet.add(normalized);
      }
    }
    const fallbackOrdered = orderedTrackKeys.filter((key) =>
      fallbackSet.has(key)
    );
    if (fallbackOrdered.length > 0) {
      return fallbackOrdered;
    }

    return allowEmpty ? [] : [defaultTrackKey];
  }

  function formatTrackLabels(trackKeys) {
    return normalizeTrackKeys(trackKeys).map(getTrackLabel).join(", ");
  }

  function createEmptyTrackMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, null]));
  }

  function createEmptyTrackRoleMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, []]));
  }

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

  function normalizeTrackRoleMap(rawMap) {
    const normalized = createEmptyTrackRoleMap();
    if (!rawMap || typeof rawMap !== "object") {
      return normalized;
    }

    for (const [rawKey, rawValue] of Object.entries(rawMap)) {
      const key = normalizeTrackKey(rawKey);
      if (!key) {
        continue;
      }
      normalized[key] = parseRoleIdList(rawValue);
    }

    return normalized;
  }

  return {
    normalizeTrackKey,
    getTrackLabel,
    normalizeTrackKeys,
    formatTrackLabels,
    createEmptyTrackMap,
    createEmptyTrackRoleMap,
    normalizeTrackMap,
    normalizeTrackRoleMap,
  };
}

module.exports = {
  createTrackStateUtils,
};
