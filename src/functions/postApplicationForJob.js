/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function postApplicationForJob(state, job) {
  const headers = Array.isArray(job.headers) ? job.headers : [];
  const row = Array.isArray(job.row) ? job.row : [];
  const inferredTrackKeys = inferApplicationTracks(headers, row);
  const trackKeys = normalizeTrackKeys(
    Array.isArray(job.trackKeys) ? job.trackKeys : job.trackKey,
    { fallback: inferredTrackKeys }
  );
  job.trackKeys = trackKeys;
  const postedTrackKeys = normalizeTrackKeys(job.postedTrackKeys, {
    allowEmpty: true,
    fallback: [],
  });
  job.postedTrackKeys = postedTrackKeys;

  const pendingTrackKeys = trackKeys.filter(
    (trackKey) => !postedTrackKeys.includes(trackKey)
  );
  if (pendingTrackKeys.length === 0) {
    return;
  }

  const missingTrackKeys = [];
  const channelByTrack = {};
  for (const trackKey of pendingTrackKeys) {
    const channelId = getActiveChannelId(trackKey);
    if (!channelId) {
      missingTrackKeys.push(trackKey);
    } else {
      channelByTrack[trackKey] = channelId;
    }
  }
  if (missingTrackKeys.length > 0) {
    throw new Error(
      `Missing post channels for: ${missingTrackKeys
        .map((trackKey) => getTrackLabel(trackKey))
        .join(", ")}. Run /setchannel.`
    );
  }

  const rowIndex = Number.isInteger(job.rowIndex) ? job.rowIndex : "unknown";
  const applicantName = inferApplicantName(headers, row);
  const postedTrackSet = new Set(postedTrackKeys);

  for (const trackKey of pendingTrackKeys) {
    const trackLabel = getTrackLabel(trackKey);
    const configuredChannelId = channelByTrack[trackKey];

    const applicantDiscord = await resolveApplicantDiscordUser(
      configuredChannelId,
      headers,
      row
    );
    const applicantMention = applicantDiscord.userId
      ? `<@${applicantDiscord.userId}>`
      : null;
    const allowedMentions = applicantDiscord.userId
      ? { parse: [], users: [applicantDiscord.userId] }
      : { parse: [] };
    const builtApplicationId = buildApplicationId(trackKey, job.jobId);

    const initialContent = makeApplicationPostContent({
      applicationId: builtApplicationId,
      trackKey,
      applicantMention,
      applicantRawValue: applicantDiscord.rawValue,
      headers,
      row,
    });

    const msg = await sendChannelMessage(
      configuredChannelId,
      initialContent,
      allowedMentions
    );
    const postedChannelId = msg.channelId || configuredChannelId;

    const applicationId = builtApplicationId || msg.id;
    const finalContent = makeApplicationPostContent({
      applicationId,
      trackKey,
      applicantMention,
      applicantRawValue: applicantDiscord.rawValue,
      headers,
      row,
    });
    if (finalContent !== initialContent) {
      try {
        await withRateLimitRetry("Edit message", async () =>
          msg.edit({
            content: finalContent,
            allowedMentions,
          })
        );
      } catch (err) {
        console.error(
          `[JOB ${job.jobId}] Failed updating application ID text for ${trackLabel}:`,
          err.message
        );
      }
    }

    try {
      await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
      await addReaction(postedChannelId, msg.id, DENY_EMOJI);
    } catch (err) {
      console.error(
        `[JOB ${job.jobId}] Failed adding reactions for ${trackLabel}:`,
        err.message
      );
    }

    let thread = null;
    try {
      thread = await createThread(
        postedChannelId,
        msg.id,
        `${trackLabel} Application - ${applicantName}`
      );
    } catch (err) {
      console.error(
        `[JOB ${job.jobId}] Failed creating thread for ${trackLabel}:`,
        err.message
      );
    }

    state.applications[msg.id] = {
      messageId: msg.id,
      applicationId,
      channelId: postedChannelId,
      threadId: thread?.id || null,
      status: STATUS_PENDING,
      trackKey,
      rowIndex: typeof rowIndex === "number" ? rowIndex : null,
      responseKey: String(job.responseKey || "").trim() || buildResponseKey(headers, row),
      jobId: job.jobId,
      applicantName,
      applicantUserId: applicantDiscord.userId || null,
      createdAt: new Date().toISOString(),
      submittedFields: extractAnsweredFields(headers, row).map(
        ({ key, value }) => `**${key}:** ${value}`
      ),
    };

    if (thread?.id) {
      state.threads[thread.id] = msg.id;
    }

    postedTrackSet.add(trackKey);
    job.postedTrackKeys = normalizeTrackKeys([...postedTrackSet], {
      allowEmpty: true,
      fallback: [],
    });
    writeState(state);
  }
}

module.exports = postApplicationForJob;
