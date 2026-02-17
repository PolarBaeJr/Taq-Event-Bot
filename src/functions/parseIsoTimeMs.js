/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseIsoTimeMs(value) {
  if (typeof value !== "string") {
    return NaN;
  }
  return Date.parse(value);
}

module.exports = parseIsoTimeMs;
