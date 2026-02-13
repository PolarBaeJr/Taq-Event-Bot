/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function getVoteSnapshot(message, eligibleReviewerIds) {
  const yesReaction = message.reactions.cache.find(
    (r) => r.emoji.name === ACCEPT_EMOJI
  );
  const noReaction = message.reactions.cache.find((r) => r.emoji.name === DENY_EMOJI);

  const yesUsers = new Set();
  const noUsers = new Set();

  if (yesReaction) {
    const users = await yesReaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot && eligibleReviewerIds.has(user.id)) {
        yesUsers.add(user.id);
      }
    }
  }

  if (noReaction) {
    const users = await noReaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot && eligibleReviewerIds.has(user.id)) {
        noUsers.add(user.id);
      }
    }
  }

  for (const userId of yesUsers) {
    if (noUsers.has(userId)) {
      yesUsers.delete(userId);
      noUsers.delete(userId);
    }
  }

  return {
    yesCount: yesUsers.size,
    noCount: noUsers.size,
  };
}

module.exports = getVoteSnapshot;
