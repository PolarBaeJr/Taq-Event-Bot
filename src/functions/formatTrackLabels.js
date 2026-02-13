/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function formatTrackLabels(trackKeys) {
  return normalizeTrackKeys(trackKeys).map(getTrackLabel).join(", ");
}

module.exports = formatTrackLabels;
