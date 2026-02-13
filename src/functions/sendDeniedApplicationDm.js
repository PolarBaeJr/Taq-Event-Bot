/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function sendDeniedApplicationDm(application, decisionReason) {
  if (!application.applicantUserId) {
    return {
      status: "skipped_no_user",
      message: "No applicant Discord user could be resolved from discord_ID.",
      userId: null,
    };
  }

  const trackLabel = getTrackLabel(application.trackKey);
  let serverName = "Unknown Server";
  try {
    const channel = await client.channels.fetch(application.channelId);
    if (channel && "guild" in channel && channel.guild?.name) {
      serverName = channel.guild.name;
    }
  } catch {
    // ignore and keep fallback server name
  }

  const replacements = {
    user: `<@${application.applicantUserId}>`,
    user_id: application.applicantUserId,
    applicant_name: application.applicantName || "Applicant",
    track: trackLabel,
    application_id: getApplicationDisplayId(application),
    job_id: application.jobId || "Unknown",
    server: serverName,
    decision_source: application.decisionSource || "Unknown",
    reason: decisionReason || "",
    decided_at: application.decidedAt || new Date().toISOString(),
  };
  const template = getActiveDenyDmTemplate();
  const rendered = applyTemplatePlaceholders(template, replacements).trim();
  const content = rendered || DEFAULT_DENY_DM_TEMPLATE;

  try {
    const user = await client.users.fetch(application.applicantUserId);
    await sendDebugDm(user, content);
    return {
      status: "sent",
      message: `Denied DM sent to <@${application.applicantUserId}>.`,
      userId: application.applicantUserId,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Failed sending denied DM to <@${application.applicantUserId}>: ${err.message}`,
      userId: application.applicantUserId,
    };
  }
}

module.exports = sendDeniedApplicationDm;
