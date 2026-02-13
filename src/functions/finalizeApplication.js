/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function finalizeApplication(messageId, decision, sourceLabel, actorId) {
  const state = readState();
  const application = state.applications[messageId];

  if (!application) {
    return { ok: false, reason: "unknown_application" };
  }

  if (application.status !== STATUS_PENDING) {
    return { ok: false, reason: "already_decided", status: application.status };
  }

  application.applicationId = getApplicationDisplayId(application, messageId);
  application.status = decision;
  application.decidedAt = new Date().toISOString();
  application.decidedBy = actorId;
  application.decisionSource = sourceLabel;
  let decisionReason =
    sourceLabel === "vote"
      ? "Decision reached with 2/3 channel supermajority."
      : `Forced by <@${actorId}> using slash command.`;

  if (decision === STATUS_ACCEPTED) {
    const roleResult = await grantApprovedRoleOnAcceptance(application);
    application.approvedRoleResult = roleResult;
    decisionReason = `${decisionReason}\n${roleResult.message}`;
    const acceptAnnounceResult = await sendAcceptedApplicationAnnouncement(
      application,
      roleResult
    );
    application.acceptAnnounceResult = acceptAnnounceResult;
    decisionReason = `${decisionReason}\n${acceptAnnounceResult.message}`;
  } else if (decision === STATUS_DENIED) {
    const denyDmResult = await sendDeniedApplicationDm(application, decisionReason);
    application.denyDmResult = denyDmResult;
    decisionReason = `${decisionReason}\n${denyDmResult.message}`;
  }

  writeState(state);

  await postDecisionUpdate(
    application,
    decision,
    decisionReason
  );
  await postClosureLog(application);

  return { ok: true };
}

module.exports = finalizeApplication;
