/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function runDebugDecisionTest(interaction, decision) {
  const suppliedJobId = interaction.options.getString("job_id");
  const messageId = resolveMessageIdForCommand(interaction);
  if (!messageId) {
    if (suppliedJobId) {
      const selectedTrack =
        getTrackKeyForChannelId(interaction.channelId || "") ||
        normalizeTrackKey(interaction.options.getString("track")) ||
        DEFAULT_TRACK_KEY;
      const selectedTrackLabel = getTrackLabel(selectedTrack);
      const normalizedJobId = String(suppliedJobId).trim();
      const derivedApplicationId = normalizedJobId || `${getTrackApplicationIdPrefix(selectedTrack)}-SIMULATED`;
      const fallbackChannelId =
        (interaction.inGuild() && isSnowflake(interaction.channelId)
          ? interaction.channelId
          : null) || getActiveChannelId(selectedTrack);
      const targetUser = interaction.options.getUser("user");
      const sideEffects = [
        `Simulation only: \`${normalizedJobId}\` is not a tracked application job ID in this chat context.`,
      ];

      if (!targetUser) {
        return {
          ok: false,
          simulated: true,
          decision,
          jobId: normalizedJobId,
          trackLabel: selectedTrackLabel,
          channelId: fallbackChannelId || null,
          error:
            decision === STATUS_ACCEPTED
              ? "For `/debug mode:accept_test` simulation, provide `user` to test role assignment."
              : "For `/debug mode:deny_test` simulation, provide `user` to test denied DM delivery.",
        };
      }

      if (decision === STATUS_ACCEPTED) {
        const roleTest = await runDebugRoleAssignmentSimulation({
          trackKey: selectedTrack,
          channelId: fallbackChannelId,
          userId: targetUser.id,
          applicationId: derivedApplicationId,
          jobId: normalizedJobId,
        });
        sideEffects.push(`Role Test User: <@${targetUser.id}>`);
        sideEffects.push(roleTest.message);
      } else {
        const deniedDmTest = await runDebugDeniedDmSimulation({
          trackKey: selectedTrack,
          channelId: fallbackChannelId,
          userId: targetUser.id,
          applicationId: derivedApplicationId,
          jobId: normalizedJobId,
        });
        sideEffects.push(`Denied DM Test User: <@${targetUser.id}>`);
        sideEffects.push(deniedDmTest.message);
      }
      sideEffects.push("No application state was changed.");

      return {
        ok: true,
        simulated: true,
        decision,
        messageId: null,
        applicationId: derivedApplicationId,
        jobId: normalizedJobId,
        trackLabel: selectedTrackLabel,
        channelId: fallbackChannelId || null,
        messageUrl: null,
        priorStatus: STATUS_PENDING,
        currentStatus: decision,
        decidedAt: new Date().toISOString(),
        sideEffects,
      };
    }
    return {
      ok: false,
      decision,
      error: suppliedJobId
        ? "That `job_id` was not found, or it maps to multiple track posts in this context."
        : "Message ID not found. Use this command in an application thread or pass `message_id`/`job_id`.",
    };
  }

  const stateBefore = readState();
  const applicationBefore = stateBefore.applications?.[messageId];
  if (!applicationBefore) {
    return {
      ok: false,
      decision,
      messageId,
      error: "This message ID is not a tracked application.",
    };
  }

  let finalizeResult = null;
  try {
    finalizeResult = await finalizeApplication(
      messageId,
      decision,
      "debug_command",
      interaction.user.id
    );
  } catch (err) {
    return {
      ok: false,
      decision,
      messageId,
      jobId: applicationBefore.jobId || null,
      trackLabel: getTrackLabel(applicationBefore.trackKey),
      priorStatus: applicationBefore.status || STATUS_PENDING,
      error: `Decision attempt failed: ${err.message}`,
    };
  }

  const stateAfter = readState();
  const applicationAfter = stateAfter.applications?.[messageId] || applicationBefore;

  const priorStatus = applicationBefore.status || STATUS_PENDING;
  const currentStatus = applicationAfter.status || priorStatus;
  const trackLabel = getTrackLabel(applicationAfter.trackKey);
  const channelId = applicationAfter.channelId || null;
  const jobId = applicationAfter.jobId || null;
  const applicationId = getApplicationDisplayId(applicationAfter, messageId);

  let messageUrl = null;
  let guildId = interaction.guildId || null;
  if (!guildId && channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && "guildId" in channel && channel.guildId) {
        guildId = channel.guildId;
      }
    } catch {
      // ignore URL resolution failure
    }
  }
  if (guildId && channelId) {
    messageUrl = makeMessageUrl(guildId, channelId, messageId);
  }

  const sideEffects = [];
  if (decision === STATUS_ACCEPTED) {
    sideEffects.push(
      `Approved Role Action: ${
        applicationAfter.approvedRoleResult?.message || "No approved-role action recorded."
      }`
    );
    sideEffects.push(
      `Acceptance Announcement Action: ${
        applicationAfter.acceptAnnounceResult?.message ||
        "No acceptance-announcement action recorded."
      }`
    );
  } else {
    sideEffects.push(
      `Denied DM Action: ${
        applicationAfter.denyDmResult?.message || "No denied-DM action recorded."
      }`
    );
  }

  if (!finalizeResult?.ok) {
    const reason =
      finalizeResult?.reason === "already_decided"
        ? `Already decided as ${String(finalizeResult?.status || currentStatus).toUpperCase()}.`
        : finalizeResult?.reason === "unknown_application"
          ? "This message ID is not a tracked application."
          : "Decision was not applied.";

    return {
      ok: false,
      decision,
      messageId,
      applicationId,
      jobId,
      trackLabel,
      channelId,
      messageUrl,
      priorStatus,
      currentStatus,
      error: reason,
      sideEffects,
    };
  }

  return {
    ok: true,
    decision,
    messageId,
    applicationId,
    jobId,
    trackLabel,
    channelId,
    messageUrl,
    priorStatus,
    currentStatus,
    decidedAt: applicationAfter.decidedAt || null,
    sideEffects,
  };
}

module.exports = runDebugDecisionTest;
