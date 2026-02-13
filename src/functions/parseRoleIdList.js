/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseRoleIdList(value) {
  const out = [];
  const seen = new Set();

  if (Array.isArray(value)) {
    for (const item of value) {
      const roleId = String(item || "").trim();
      if (!isSnowflake(roleId) || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push(roleId);
    }
    return out;
  }

  if (isSnowflake(value)) {
    return [value.trim()];
  }

  if (typeof value === "string" && value.trim()) {
    const parts = value.split(/[,\s]+/);
    for (const part of parts) {
      const roleId = String(part || "").trim();
      if (!isSnowflake(roleId) || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push(roleId);
    }
  }

  return out;
}

module.exports = parseRoleIdList;
