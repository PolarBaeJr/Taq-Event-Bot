/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function postForcedDecisionTemplateToThread(application, decision, decisionReason) {
  if (application?.decisionSource !== "force_command") {
    return;
  }
  if (!application?.threadId) {
    return;
  }

  try {
    const thread = await client.channels.fetch(application.threadId);
    if (!thread || !thread.isTextBased()) {
      return;
    }

    // If the thread auto-archived, try to reopen so the forced decision note is visible there.
    if (
      "archived" in thread &&
      thread.archived &&
      typeof thread.setArchived === "function"
    ) {
      try {
        await thread.setArchived(false, "Posting forced decision template message");
      } catch {
        // ignore; send will fail naturally if thread stays archived/locked
      }
    }

    const trackLabel = getTrackLabel(application.trackKey);
    let serverName = "Unknown Server";
    try {
      const sourceChannel = await client.channels.fetch(application.channelId);
      if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
        serverName = sourceChannel.guild.name;
      }
    } catch {
      // keep fallback server name
    }

    const replacements = {
      user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
      user_id: application.applicantUserId || "",
      applicant_name: application.applicantName || "Applicant",
      track: trackLabel,
      application_id: getApplicationDisplayId(application),
      job_id: application.jobId || "Unknown",
      server: serverName,
      decision_source: application.decisionSource || "Unknown",
      role_result: application.approvedRoleResult?.message || "",
      reason: decisionReason || "",
      decided_at: application.decidedAt || new Date().toISOString(),
    };

    const isAccepted = decision === STATUS_ACCEPTED;
    const template = isAccepted
      ? getActiveAcceptAnnounceTemplate()
      : getActiveDenyDmTemplate();
    const fallback = isAccepted
      ? DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE
      : DEFAULT_DENY_DM_TEMPLATE;
    const rendered = applyTemplatePlaceholders(template, replacements).trim() || fallback;
    const label = isAccepted ? "ACCEPTED" : "DENIED";

    const lines = [
      `📨 **Forced ${label} Message**`,
      `**By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
      `**Application ID:** \`${getApplicationDisplayId(application)}\``,
      "",
      toCodeBlock(rendered),
    ];
    await thread.send({ content: lines.join("\n"), allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(
      `Failed posting forced ${decision} template to thread ${application.threadId}:`,
      err.message
    );
  }
}

module.exports = postForcedDecisionTemplateToThread;
