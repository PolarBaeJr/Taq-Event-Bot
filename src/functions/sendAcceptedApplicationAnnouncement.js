/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function sendAcceptedApplicationAnnouncement(application, roleResult) {
  const channelId = getActiveAcceptAnnounceChannelId();
  if (!channelId) {
    return {
      status: "skipped_no_channel",
      message: "No accept announcement channel configured.",
      channelId: null,
    };
  }

  const trackLabel = getTrackLabel(application.trackKey);
  let serverName = "Unknown Server";
  try {
    const sourceChannel = await client.channels.fetch(application.channelId);
    if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
      serverName = sourceChannel.guild.name;
    }
  } catch {
    // ignore and keep fallback
  }

  const replacements = {
    user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
    user_id: application.applicantUserId || "",
    applicant_name: application.applicantName || "Applicant",
    track: trackLabel,
    application_id: getApplicationDisplayId(application),
    job_id: application.jobId || "Unknown",
    server: serverName,
    role_result: roleResult?.message || "",
    decided_at: application.decidedAt || new Date().toISOString(),
  };
  const template = getActiveAcceptAnnounceTemplate();
  const rendered = applyTemplatePlaceholders(template, replacements).trim();
  const content = rendered || DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE;

  try {
    await sendChannelMessage(channelId, content, {
      parse: [],
      users: application.applicantUserId ? [application.applicantUserId] : [],
    });
    return {
      status: "sent",
      message: `Acceptance announcement posted in <#${channelId}>.`,
      channelId,
    };
  } catch (err) {
    return {
      status: "failed_error",
      message: `Failed posting acceptance announcement in <#${channelId}>: ${err.message}`,
      channelId,
    };
  }
}

module.exports = sendAcceptedApplicationAnnouncement;
