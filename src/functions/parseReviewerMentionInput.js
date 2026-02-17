/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseReviewerMentionInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return {
      roleIds: [],
      userIds: [],
    };
  }

  const roleIds = [];
  const userIds = [];
  const seenRoles = new Set();
  const seenUsers = new Set();
  const tokens = raw.split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const roleMatch = /^<@&(\d{17,20})>$/.exec(token) || /^role:(\d{17,20})$/i.exec(token);
    if (roleMatch) {
      const roleId = roleMatch[1];
      if (!seenRoles.has(roleId)) {
        seenRoles.add(roleId);
        roleIds.push(roleId);
      }
      continue;
    }

    const userMatch =
      /^<@!?(\d{17,20})>$/.exec(token) ||
      /^user:(\d{17,20})$/i.exec(token) ||
      /^(\d{17,20})$/.exec(token);
    if (userMatch) {
      const userId = userMatch[1];
      if (!seenUsers.has(userId)) {
        seenUsers.add(userId);
        userIds.push(userId);
      }
    }
  }

  return {
    roleIds,
    userIds,
  };
}

module.exports = parseReviewerMentionInput;
