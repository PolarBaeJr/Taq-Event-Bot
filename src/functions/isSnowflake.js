/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

module.exports = isSnowflake;
