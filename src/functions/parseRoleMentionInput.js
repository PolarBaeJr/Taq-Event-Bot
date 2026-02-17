/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseRoleMentionInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return [];
  }

  const roleIds = [];
  const seenRoles = new Set();
  const tokens = raw.split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const roleMatch =
      /^<@&(\d{17,20})>$/.exec(token) ||
      /^role:(\d{17,20})$/i.exec(token) ||
      /^(\d{17,20})$/.exec(token);
    if (!roleMatch) {
      continue;
    }
    const roleId = roleMatch[1];
    if (seenRoles.has(roleId)) {
      continue;
    }
    seenRoles.add(roleId);
    roleIds.push(roleId);
  }

  return roleIds;
}

module.exports = parseRoleMentionInput;
