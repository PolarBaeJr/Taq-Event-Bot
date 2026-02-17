/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getReviewerAllowedMentions(configEntry) {
  const roleIds = parseRoleIdList(configEntry?.roleIds);
  const userIds = parseUserIdList(configEntry?.userIds);
  return {
    parse: [],
    roles: roleIds,
    users: userIds,
  };
}

module.exports = getReviewerAllowedMentions;
