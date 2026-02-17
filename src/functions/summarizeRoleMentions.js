/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function summarizeRoleMentions(roleIds, emptyLabel = "none") {
  const mentions = parseRoleIdList(roleIds).map((id) => `<@&${id}>`);
  return mentions.length > 0 ? mentions.join(", ") : emptyLabel;
}

module.exports = summarizeRoleMentions;
