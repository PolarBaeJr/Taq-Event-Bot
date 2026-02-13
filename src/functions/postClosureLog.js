/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function postClosureLog(application) {
  try {
    const channel = await client.channels.fetch(application.channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return;
    }

    const logsChannel = await ensureLogsChannel(channel.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const decisionLabel =
      application.status === STATUS_ACCEPTED ? "ACCEPTED" : "DENIED";
    const trackKey = normalizeTrackKey(application.trackKey) || DEFAULT_TRACK_KEY;
    const trackLabel = getTrackLabel(trackKey);
    const submittedLines =
      Array.isArray(application.submittedFields) &&
      application.submittedFields.length > 0
        ? application.submittedFields.join("\n")
        : "_No answered fields stored_";
    const messageLink = makeMessageUrl(
      channel.guild.id,
      application.channelId,
      application.messageId
    );
    const threadLink = application.threadId
      ? makeMessageUrl(channel.guild.id, application.threadId, application.threadId)
      : "_No thread_";
    const approvedRoleNote =
      application.approvedRoleResult && application.status === STATUS_ACCEPTED
        ? application.approvedRoleResult.message
        : "No role action recorded.";
    const acceptAnnounceNote =
      application.acceptAnnounceResult && application.status === STATUS_ACCEPTED
        ? application.acceptAnnounceResult.message
        : "No acceptance announcement action recorded.";
    const deniedDmNote =
      application.denyDmResult && application.status === STATUS_DENIED
        ? application.denyDmResult.message
        : "No denied-DM action recorded.";

    const logLines = [
      "📚 **Application Closed (History Log)**",
      `**Decision:** ${decisionLabel}`,
      `**Track:** ${trackLabel}`,
      `**Applicant:** ${application.applicantName || "Unknown"}`,
      `**Row:** ${application.rowIndex || "Unknown"}`,
      `**Application ID:** ${getApplicationDisplayId(application)}`,
      `**Created At:** ${application.createdAt || "Unknown"}`,
      `**Decided At:** ${application.decidedAt || "Unknown"}`,
      `**Decision Source:** ${application.decisionSource || "Unknown"}`,
      `**Decided By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
      `**Approved Role Action:** ${approvedRoleNote}`,
      `**Acceptance Announcement Action:** ${acceptAnnounceNote}`,
      `**Denied DM Action:** ${deniedDmNote}`,
      `**Application Message:** ${messageLink}`,
      `**Discussion Thread:** ${threadLink}`,
      "",
      "**Submitted Fields:**",
      submittedLines,
    ];
    const log = logLines.join("\n");

    await logsChannel.send({ content: log, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("Failed posting closure log:", err.message);
  }
}

module.exports = postClosureLog;
