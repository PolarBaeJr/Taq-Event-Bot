/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeTrackKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const track of APPLICATION_TRACKS) {
    if (track.key === normalized || track.aliases.includes(normalized)) {
      return track.key;
    }
  }
  return null;
}

module.exports = normalizeTrackKey;
