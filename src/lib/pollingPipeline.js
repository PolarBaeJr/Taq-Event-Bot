function createPollingPipeline(options = {}) {
  const readState = typeof options.readState === "function"
    ? options.readState
    : () => ({});
  const writeState = typeof options.writeState === "function"
    ? options.writeState
    : () => {};
  const inferApplicationTracks = typeof options.inferApplicationTracks === "function"
    ? options.inferApplicationTracks
    : () => [];
  const normalizeTrackKeys = typeof options.normalizeTrackKeys === "function"
    ? options.normalizeTrackKeys
    : (values) => (Array.isArray(values) ? values : [values]).filter(Boolean);
  const getActiveChannelId = typeof options.getActiveChannelId === "function"
    ? options.getActiveChannelId
    : () => null;
  const getTrackLabel = typeof options.getTrackLabel === "function"
    ? options.getTrackLabel
    : (trackKey) => String(trackKey || "");
  const inferApplicantName = typeof options.inferApplicantName === "function"
    ? options.inferApplicantName
    : () => "Applicant";
  const resolveApplicantDiscordUser =
    typeof options.resolveApplicantDiscordUser === "function"
      ? options.resolveApplicantDiscordUser
      : async () => ({ rawValue: null, userId: null });
  const buildApplicationId = typeof options.buildApplicationId === "function"
    ? options.buildApplicationId
    : () => null;
  const makeApplicationPostContent =
    typeof options.makeApplicationPostContent === "function"
      ? options.makeApplicationPostContent
      : () => "";
  const sendChannelMessage = typeof options.sendChannelMessage === "function"
    ? options.sendChannelMessage
    : async () => null;
  const withRateLimitRetry = typeof options.withRateLimitRetry === "function"
    ? options.withRateLimitRetry
    : async (_label, run) => run();
  const addReaction = typeof options.addReaction === "function"
    ? options.addReaction
    : async () => {};
  const createThread = typeof options.createThread === "function"
    ? options.createThread
    : async () => null;
  const extractAnsweredFields = typeof options.extractAnsweredFields === "function"
    ? options.extractAnsweredFields
    : () => [];
  const buildResponseKey = typeof options.buildResponseKey === "function"
    ? options.buildResponseKey
    : () => null;
  const buildResponseKeyFromApplication =
    typeof options.buildResponseKeyFromApplication === "function"
      ? options.buildResponseKeyFromApplication
      : () => null;
  const client = options.client || null;
  const statusPending = String(options.statusPending || "pending");
  const acceptEmoji = String(options.acceptEmoji || "✅");
  const denyEmoji = String(options.denyEmoji || "❌");
  const formatTrackLabels = typeof options.formatTrackLabels === "function"
    ? options.formatTrackLabels
    : (trackKeys) => String(trackKeys || "");
  const sortPostJobsInPlace = typeof options.sortPostJobsInPlace === "function"
    ? options.sortPostJobsInPlace
    : () => {};
  const hasAnyActivePostChannelConfigured =
    typeof options.hasAnyActivePostChannelConfigured === "function"
      ? options.hasAnyActivePostChannelConfigured
      : () => false;
  const readAllResponses = typeof options.readAllResponses === "function"
    ? options.readAllResponses
    : async () => [];
  const buildTrackedResponseKeySet =
    typeof options.buildTrackedResponseKeySet === "function"
      ? options.buildTrackedResponseKeySet
      : () => new Set();
  const buildTrackedRowSet = typeof options.buildTrackedRowSet === "function"
    ? options.buildTrackedRowSet
    : () => new Set();
  const autoRegisterTracksFromFormRow =
    typeof options.autoRegisterTracksFromFormRow === "function"
      ? options.autoRegisterTracksFromFormRow
      : () => [];
  const createPostJob = typeof options.createPostJob === "function"
    ? options.createPostJob
    : () => null;

  let isProcessingPostJobs = false;
  let loggedNoChannelWarning = false;

  function normalizeComparableText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractTrackLabelFromContent(content) {
    const match = /(?:^|\n)[^\n]*\*\*Track:\*\*\s*([^\n]+)/i.exec(String(content || ""));
    if (!match) {
      return "";
    }
    return normalizeComparableText(match[1].replace(/[`*_~]/g, ""));
  }

  function extractApplicationIdFromContent(content) {
    const match = /application id:\s*`?([A-Za-z0-9]+-\d+)`?/i.exec(
      String(content || "")
    );
    return match ? String(match[1]).trim() : null;
  }

  function parseSubmittedFieldsFromPostContent(content) {
    const blockMatch = /```(?:\w+)?\n?([\s\S]*?)```/.exec(String(content || ""));
    if (!blockMatch) {
      return [];
    }

    const body = String(blockMatch[1] || "").replace(/\r\n/g, "\n").trim();
    if (!body) {
      return [];
    }

    const chunks = body.split(/\n\s*\n/);
    const submittedFields = [];
    for (const chunk of chunks) {
      const line = String(chunk || "").trim();
      if (!line) {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        continue;
      }

      submittedFields.push(`**${key}:** ${value}`);
    }

    return submittedFields;
  }

  function buildSubmittedFieldsFingerprint(submittedFields) {
    return submittedFields
      .map((line) => normalizeComparableText(line))
      .filter(Boolean)
      .join("|");
  }

  async function findExistingApplicationPostInChannel({
    channelId,
    trackLabel,
    targetResponseKey,
    targetSubmittedFieldsFingerprint,
  }) {
    if (!client || !channelId) {
      return null;
    }

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch {
      return null;
    }

    if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
      return null;
    }

    const normalizedTrackLabel = normalizeComparableText(trackLabel);
    let before = null;
    const maxPages = 4;

    for (let page = 0; page < maxPages; page += 1) {
      let messages;
      try {
        messages = await withRateLimitRetry(
          "Search existing application post",
          async () => channel.messages.fetch({ limit: 100, before: before || undefined })
        );
      } catch {
        return null;
      }

      if (!messages || messages.size === 0) {
        break;
      }

      for (const message of messages.values()) {
        if (client.user?.id && message.author?.id && message.author.id !== client.user.id) {
          continue;
        }

        const content = String(message.content || "");
        if (!content || !content.includes("**New Application**")) {
          continue;
        }

        const messageTrackLabel = extractTrackLabelFromContent(content);
        if (normalizedTrackLabel && messageTrackLabel !== normalizedTrackLabel) {
          continue;
        }

        const submittedFields = parseSubmittedFieldsFromPostContent(content);
        if (submittedFields.length === 0) {
          continue;
        }

        const messageResponseKey = String(
          buildResponseKeyFromApplication({ submittedFields }) || ""
        ).trim();
        if (targetResponseKey && messageResponseKey && messageResponseKey === targetResponseKey) {
          return message;
        }

        if (
          targetSubmittedFieldsFingerprint &&
          buildSubmittedFieldsFingerprint(submittedFields) === targetSubmittedFieldsFingerprint
        ) {
          return message;
        }
      }

      before = messages.lastKey();
      if (!before) {
        break;
      }
    }

    return null;
  }

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
    const responseKey = String(job.responseKey || "").trim() || buildResponseKey(headers, row);
    const submittedFieldsForRow = extractAnsweredFields(headers, row).map(
      ({ key, value }) => `**${key}:** ${value}`
    );
    const submittedFieldsFingerprint = buildSubmittedFieldsFingerprint(
      submittedFieldsForRow
    );

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

      const existingMessage = await findExistingApplicationPostInChannel({
        channelId: configuredChannelId,
        trackLabel,
        targetResponseKey: responseKey,
        targetSubmittedFieldsFingerprint: submittedFieldsFingerprint,
      });

      let msg = existingMessage;
      if (!msg) {
        const initialContent = makeApplicationPostContent({
          applicationId: builtApplicationId,
          trackKey,
          applicantMention,
          applicantRawValue: applicantDiscord.rawValue,
          headers,
          row,
        });

        msg = await sendChannelMessage(
          configuredChannelId,
          initialContent,
          allowedMentions
        );

        const resolvedApplicationId = builtApplicationId || msg.id;
        const finalContent = makeApplicationPostContent({
          applicationId: resolvedApplicationId,
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
      } else {
        console.log(
          `[JOB ${job.jobId}] Reused existing ${trackLabel} application post (${msg.id}) in channel ${configuredChannelId}.`
        );
      }

      const postedChannelId = msg.channelId || configuredChannelId;
      const applicationId =
        extractApplicationIdFromContent(msg.content) || builtApplicationId || msg.id;

      try {
        await addReaction(postedChannelId, msg.id, acceptEmoji);
        await addReaction(postedChannelId, msg.id, denyEmoji);
      } catch (err) {
        console.error(
          `[JOB ${job.jobId}] Failed adding reactions for ${trackLabel}:`,
          err.message
        );
      }

      let threadId = msg.hasThread ? msg.thread?.id || msg.id : null;
      if (!threadId) {
        try {
          const thread = await createThread(
            postedChannelId,
            msg.id,
            `${trackLabel} Application - ${applicantName}`
          );
          threadId = thread?.id || null;
        } catch (err) {
          const errorMessage = String(err?.message || "");
          if (errorMessage.toLowerCase().includes("already has a thread")) {
            threadId = msg.id;
          } else {
            console.error(
              `[JOB ${job.jobId}] Failed creating thread for ${trackLabel}:`,
              err.message
            );
          }
        }
      }

      state.applications[msg.id] = {
        messageId: msg.id,
        applicationId,
        channelId: postedChannelId,
        threadId,
        status: statusPending,
        trackKey,
        rowIndex: typeof rowIndex === "number" ? rowIndex : null,
        responseKey,
        jobId: job.jobId,
        applicantName,
        applicantUserId: applicantDiscord.userId || null,
        createdAt: new Date().toISOString(),
        submittedFields: submittedFieldsForRow,
      };

      if (threadId) {
        state.threads[threadId] = msg.id;
      }

      postedTrackSet.add(trackKey);
      job.postedTrackKeys = normalizeTrackKeys([...postedTrackSet], {
        allowEmpty: true,
        fallback: [],
      });
      writeState(state);
    }
  }

  async function processQueuedPostJobs() {
    if (isProcessingPostJobs) {
      const state = readState();
      return {
        queuedBefore: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
        posted: 0,
        failed: 0,
        remaining: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
        busy: true,
        failedJobId: null,
        failedError: null,
      };
    }

    if (!hasAnyActivePostChannelConfigured()) {
      const state = readState();
      return {
        queuedBefore: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
        posted: 0,
        failed: 0,
        remaining: Array.isArray(state.postJobs) ? state.postJobs.length : 0,
        busy: false,
        failedJobId: null,
        failedError: null,
      };
    }

    isProcessingPostJobs = true;
    try {
      const state = readState();
      if (!Array.isArray(state.postJobs) || state.postJobs.length === 0) {
        return {
          queuedBefore: 0,
          posted: 0,
          failed: 0,
          remaining: 0,
          busy: false,
          failedJobId: null,
          failedError: null,
        };
      }

      sortPostJobsInPlace(state.postJobs);
      const queuedBefore = state.postJobs.length;
      let posted = 0;
      let failed = 0;
      let failedJobId = null;
      let failedError = null;

      while (state.postJobs.length > 0) {
        const job = state.postJobs[0];
        const inferredTrackKeys = inferApplicationTracks(
          Array.isArray(job.headers) ? job.headers : [],
          Array.isArray(job.row) ? job.row : []
        );
        job.trackKeys = normalizeTrackKeys(
          Array.isArray(job.trackKeys) ? job.trackKeys : job.trackKey,
          { fallback: inferredTrackKeys }
        );
        job.postedTrackKeys = normalizeTrackKeys(job.postedTrackKeys, {
          allowEmpty: true,
          fallback: [],
        });
        const trackLabels = formatTrackLabels(job.trackKeys);
        job.attempts = (Number.isInteger(job.attempts) ? job.attempts : 0) + 1;
        job.lastAttemptAt = new Date().toISOString();

        try {
          await postApplicationForJob(state, job);
          state.postJobs.shift();
          posted += 1;
          writeState(state);
          console.log(
            `[JOB ${job.jobId}] Posted ${trackLabels} application(s) for row ${job.rowIndex}.`
          );
        } catch (err) {
          job.lastError = err.message;
          failed += 1;
          failedJobId = job.jobId;
          failedError = err.message;
          writeState(state);
          console.error(
            `[JOB ${job.jobId}] Failed posting ${trackLabels} row ${job.rowIndex}:`,
            err.message
          );
          break;
        }
      }

      return {
        queuedBefore,
        posted,
        failed,
        remaining: state.postJobs.length,
        busy: false,
        failedJobId,
        failedError,
      };
    } finally {
      isProcessingPostJobs = false;
    }
  }

  async function pollOnce() {
    const state = readState();
    const values = await readAllResponses();

    if (values.length > 0) {
      const headers = Array.isArray(values[0]) ? values[0] : [];
      const rows = values.slice(1);
      const endDataRow = rows.length + 1;
      const trackedResponseKeys = buildTrackedResponseKeySet(state);
      const trackedRows = buildTrackedRowSet(state);
      let stateChanged = false;

      for (let sheetRowNumber = 2; sheetRowNumber <= endDataRow; sheetRowNumber += 1) {
        const row = values[sheetRowNumber - 1] || [];
        if (row.every((cell) => !String(cell || "").trim())) {
          continue;
        }

        const responseKey = options.buildResponseKey(headers, row);
        if (responseKey && trackedResponseKeys.has(responseKey)) {
          continue;
        }

        if (!responseKey && trackedRows.has(sheetRowNumber)) {
          continue;
        }

        const autoCreatedTrackKeys = autoRegisterTracksFromFormRow(state, headers, row);
        if (autoCreatedTrackKeys.length > 0) {
          stateChanged = true;
          console.log(
            `[TRACK] Auto-registered from row ${sheetRowNumber}: ${autoCreatedTrackKeys
              .map((trackKey) => `${getTrackLabel(trackKey)} (${trackKey})`)
              .join(", ")}`
          );
        }

        const job = createPostJob(state, headers, row, sheetRowNumber);
        if (responseKey && !job.responseKey) {
          job.responseKey = responseKey;
        }

        state.postJobs.push(job);
        if (responseKey) {
          trackedResponseKeys.add(responseKey);
        } else {
          trackedRows.add(sheetRowNumber);
        }
        stateChanged = true;
        console.log(
          `[JOB ${job.jobId}] Queued ${formatTrackLabels(job.trackKeys)} application post for row ${sheetRowNumber}.`
        );
      }

      if (state.lastRow !== endDataRow) {
        state.lastRow = endDataRow;
        stateChanged = true;
      }

      if (stateChanged) {
        sortPostJobsInPlace(state.postJobs);
        writeState(state);
      }
    }

    if (!hasAnyActivePostChannelConfigured()) {
      if (!loggedNoChannelWarning) {
        console.log(
          "Posting paused: no application post channels configured. Use /setchannel."
        );
        loggedNoChannelWarning = true;
      }
      return;
    }
    loggedNoChannelWarning = false;

    const queueResult = await processQueuedPostJobs();
    if (queueResult.posted > 0 || queueResult.failed > 0) {
      const details = [
        `queue=${queueResult.queuedBefore}`,
        `posted=${queueResult.posted}`,
        `remaining=${queueResult.remaining}`,
      ];
      if (queueResult.failed > 0 && queueResult.failedJobId) {
        details.push(`blocked=${queueResult.failedJobId}`);
      }
      console.log(`Job run summary: ${details.join(", ")}`);
    }
  }

  return {
    postApplicationForJob,
    processQueuedPostJobs,
    pollOnce,
  };
}

module.exports = {
  createPollingPipeline,
};
