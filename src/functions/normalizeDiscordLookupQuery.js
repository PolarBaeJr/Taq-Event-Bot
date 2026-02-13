/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeDiscordLookupQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/^@/, "").trim() || null;
}

module.exports = normalizeDiscordLookupQuery;
