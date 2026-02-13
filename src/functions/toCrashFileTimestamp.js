/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function toCrashFileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

module.exports = toCrashFileTimestamp;
