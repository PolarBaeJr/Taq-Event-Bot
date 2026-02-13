/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function evaluateAndApplyVoteDecision(messageId) {
  const state = readState();
  const application = state.applications[messageId];

  if (!application || application.status !== STATUS_PENDING) {
    return;
  }

  const channel = await client.channels.fetch(application.channelId);
  if (!channel || !channel.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(messageId);
  const eligibleReviewerIds = await getReviewersWithChannelAccess(channel);

  if (eligibleReviewerIds.size === 0) {
    return;
  }

  const threshold = requiredVotesCount(eligibleReviewerIds.size);
  const { yesCount, noCount } = await getVoteSnapshot(message, eligibleReviewerIds);

  if (yesCount >= threshold && noCount >= threshold) {
    return;
  }

  if (yesCount >= threshold) {
    await finalizeApplication(messageId, STATUS_ACCEPTED, "vote", client.user.id);
    return;
  }

  if (noCount >= threshold) {
    await finalizeApplication(messageId, STATUS_DENIED, "vote", client.user.id);
  }
}

module.exports = evaluateAndApplyVoteDecision;
