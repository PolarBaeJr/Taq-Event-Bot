/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getTrackApplicationIdPrefix(trackKey) {
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const label = getTrackLabel(normalizedTrack);
  const cleaned = String(label).replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  return cleaned || "APP";
}

module.exports = getTrackApplicationIdPrefix;
