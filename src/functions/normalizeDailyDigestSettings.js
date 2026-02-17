/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeDailyDigestSettings(rawDigest) {
  const source = rawDigest && typeof rawDigest === "object" ? rawDigest : {};
  return {
    enabled: source.enabled !== false,
    hourUtc: clampInteger(source.hourUtc, {
      min: 0,
      max: 23,
      fallback: DEFAULT_DAILY_DIGEST_SETTINGS.hourUtc,
    }),
    lastDigestDate:
      typeof source.lastDigestDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.lastDigestDate)
        ? source.lastDigestDate
        : null,
  };
}

module.exports = normalizeDailyDigestSettings;
