/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function sanitizeThreadName(name) {
  return (
    name.replace(/[^\p{L}\p{N}\s\-_]/gu, "").trim().slice(0, 90) ||
    "Application Discussion"
  );
}

module.exports = sanitizeThreadName;
