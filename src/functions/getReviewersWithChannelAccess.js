/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function getReviewersWithChannelAccess(channel) {
  const members = await channel.guild.members.fetch();
  const reviewers = new Set();

  for (const member of members.values()) {
    if (member.user.bot) {
      continue;
    }

    const perms = channel.permissionsFor(member);
    if (perms && perms.has(PermissionsBitField.Flags.ViewChannel)) {
      reviewers.add(member.id);
    }
  }

  return reviewers;
}

module.exports = getReviewersWithChannelAccess;
