/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function summarizeReviewerMentions(configEntry) {
  const roleMentions = parseRoleIdList(configEntry?.roleIds).map((id) => `<@&${id}>`);
  const userMentions = parseUserIdList(configEntry?.userIds).map((id) => `<@${id}>`);
  const combined = [...userMentions, ...roleMentions];
  return combined.length > 0 ? combined.join(", ") : "none";
}

module.exports = summarizeReviewerMentions;
