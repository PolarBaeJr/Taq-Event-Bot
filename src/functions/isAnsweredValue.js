/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function isAnsweredValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  return String(value).trim().length > 0;
}

module.exports = isAnsweredValue;
