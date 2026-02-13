/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getTrackLabel(trackKey) {
  const normalized = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  return TRACK_LOOKUP_BY_KEY[normalized]?.label || TRACK_LOOKUP_BY_KEY[DEFAULT_TRACK_KEY].label;
}

module.exports = getTrackLabel;
