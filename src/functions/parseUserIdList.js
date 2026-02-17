/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseUserIdList(value) {
  const out = [];
  const seen = new Set();
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [value];

  for (const rawItem of source) {
    const userId = String(rawItem || "").trim();
    if (!isSnowflake(userId) || seen.has(userId)) {
      continue;
    }
    seen.add(userId);
    out.push(userId);
  }

  return out;
}

module.exports = parseUserIdList;
