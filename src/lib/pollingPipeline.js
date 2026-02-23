/*
  Core module for polling pipeline.
*/

const {
  normalizeComparableText,
  extractTrackLabelFromMessage,
  extractApplicationIdFromMessage,
  parseSubmittedFieldsFromMessage,
  isApplicationPostMessage,
} = require("./applicationMessageParser");

// createPollingPipeline: handles create polling pipeline.
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
  const findDuplicateApplications =
    typeof options.findDuplicateApplications === "function"
      ? options.findDuplicateApplications
      : () => [];
  const postDuplicateWarning =
    typeof options.postDuplicateWarning === "function"
      ? options.postDuplicateWarning
      : async () => {};
  const announceReviewerAssignment =
    typeof options.announceReviewerAssignment === "function"
      ? options.announceReviewerAssignment
      : async () => {};
  const onApplicationCreated =
    typeof options.onApplicationCreated === "function"
      ? options.onApplicationCreated
      : () => {};
  const logger =
    options.logger &&
    typeof options.logger.info === "function" &&
    typeof options.logger.error === "function"
      ? options.logger
      : null;

  let isProcessingPostJobs = false;
  let loggedNoChannelWarning = false;

  // logInfo: handles log info.
  function logInfo(event, message, context = {}) {
    if (logger) {
      logger.info(event, message, context);
      return;
    }
    console.log(message);
  }

  // logError: handles log error.
  function logError(event, message, context = {}) {
    if (logger) {
      logger.error(event, message, context);
      return;
    }
    console.error(message);
  }

  // normalizeMessagePayload: handles normalize message payload.
  function normalizeMessagePayload(payload, allowedMentions) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return {
        ...payload,
      };
    }
    return {
      content: String(payload || ""),
      allowedMentions,
    };
  }

  // buildSubmittedFieldsFingerprint: handles build submitted fields fingerprint.
  function buildSubmittedFieldsFingerprint(submittedFields) {
    return submittedFields
      .map((line) => normalizeComparableText(line))
      .filter(Boolean)
      .join("|");
  }

  // findExistingApplicationPostInChannel: handles find existing application post in channel.
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

        if (!isApplicationPostMessage(message)) {
          continue;
        }

        const messageTrackLabel = extractTrackLabelFromMessage(message);
        if (
          normalizedTrackLabel &&
          messageTrackLabel &&
          messageTrackLabel !== normalizedTrackLabel
        ) {
          continue;
        }

        const submittedFields = parseSubmittedFieldsFromMessage(message);
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

  // postApplicationForJob: handles post application for job.
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
          .join(", ")}. Run /set channel.`
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
        const initialPayload = normalizeMessagePayload(
          makeApplicationPostContent({
            applicationId: builtApplicationId,
            trackKey,
            applicantMention,
            applicantRawValue: applicantDiscord.rawValue,
            headers,
            row,
          }),
          allowedMentions
        );

        msg = await sendChannelMessage(
          configuredChannelId,
          initialPayload,
          allowedMentions
        );

        const resolvedApplicationId = builtApplicationId || msg.id;
        const finalPayload = normalizeMessagePayload(
          makeApplicationPostContent({
            applicationId: resolvedApplicationId,
            trackKey,
            applicantMention,
            applicantRawValue: applicantDiscord.rawValue,
            headers,
            row,
          }),
          allowedMentions
        );

        if (JSON.stringify(finalPayload) !== JSON.stringify(initialPayload)) {
          try {
            await withRateLimitRetry("Edit message", async () =>
              msg.edit({
                ...finalPayload,
                allowedMentions: finalPayload.allowedMentions || allowedMentions,
              })
            );
          } catch (err) {
            logError(
              "queue_application_update_failed",
              `[JOB ${job.jobId}] Failed updating application ID text for ${trackLabel}: ${err.message}`,
              {
                jobId: job.jobId,
                trackKey,
                trackLabel,
                error: err.message,
              }
            );
          }
        }
      } else {
        logInfo(
          "queue_application_reused",
          `[JOB ${job.jobId}] Reused existing ${trackLabel} application post (${msg.id}) in channel ${configuredChannelId}.`,
          {
            jobId: job.jobId,
            trackKey,
            trackLabel,
            messageId: msg.id,
            channelId: configuredChannelId,
          }
        );
      }

      const postedChannelId = msg.channelId || configuredChannelId;
      const applicationId =
        extractApplicationIdFromMessage(msg) || builtApplicationId || msg.id;
      const duplicateSignals = findDuplicateApplications({
        state,
        trackKey,
        responseKey,
        submittedFieldsFingerprint,
        applicantUserId: applicantDiscord.userId || null,
        rowIndex: typeof rowIndex === "number" ? rowIndex : null,
        jobId: job.jobId,
      });

      try {
        await addReaction(postedChannelId, msg.id, acceptEmoji);
        await addReaction(postedChannelId, msg.id, denyEmoji);
      } catch (err) {
        logError(
          "queue_reactions_failed",
          `[JOB ${job.jobId}] Failed adding reactions for ${trackLabel}: ${err.message}`,
          {
            jobId: job.jobId,
            trackKey,
            trackLabel,
            channelId: postedChannelId,
            messageId: msg.id,
            error: err.message,
          }
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
            logError(
              "queue_thread_create_failed",
              `[JOB ${job.jobId}] Failed creating thread for ${trackLabel}: ${err.message}`,
              {
                jobId: job.jobId,
                trackKey,
                trackLabel,
                channelId: postedChannelId,
                messageId: msg.id,
                error: err.message,
              }
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
        submittedFieldsFingerprint,
        duplicateSignals,
      };

      if (threadId) {
        state.threads[threadId] = msg.id;
      }

      postedTrackSet.add(trackKey);
      job.postedTrackKeys = normalizeTrackKeys([...postedTrackSet], {
        allowEmpty: true,
        fallback: [],
      });

      try {
        onApplicationCreated({
          application: state.applications[msg.id],
          trackKey,
          rowIndex: typeof rowIndex === "number" ? rowIndex : null,
        });
      } catch (err) {
        logError(
          "queue_post_create_hook_failed",
          `[JOB ${job.jobId}] Failed running post-create hook for ${trackLabel}: ${err.message}`,
          {
            jobId: job.jobId,
            trackKey,
            trackLabel,
            error: err.message,
          }
        );
      }

      try {
        await announceReviewerAssignment({
          state,
          application: state.applications[msg.id],
          trackKey,
          trackLabel,
          channelId: postedChannelId,
          threadId,
          jobId: job.jobId,
        });
      } catch (err) {
        logError(
          "queue_reviewer_assignment_failed",
          `[JOB ${job.jobId}] Failed reviewer assignment message for ${trackLabel}: ${err.message}`,
          {
            jobId: job.jobId,
            trackKey,
            trackLabel,
            error: err.message,
          }
        );
      }

      if (Array.isArray(duplicateSignals) && duplicateSignals.length > 0) {
        try {
          await postDuplicateWarning({
            state,
            application: state.applications[msg.id],
            trackKey,
            trackLabel,
            channelId: postedChannelId,
            threadId,
            duplicateSignals,
            jobId: job.jobId,
          });
        } catch (err) {
          logError(
            "queue_duplicate_warning_failed",
            `[JOB ${job.jobId}] Failed duplicate warning post for ${trackLabel}: ${err.message}`,
            {
              jobId: job.jobId,
              trackKey,
              trackLabel,
              error: err.message,
            }
          );
        }
      }
    }
  }

  // processQueuedPostJobs: handles process queued post jobs.
  // Refreshes web-managed fields from disk into a working state snapshot before writing,
  // preventing race conditions where concurrent web-server writes get overwritten.
  function mergeWebManagedFields(state) {
    try {
      const fresh = readState();
      // Never overwrite pending admin actions with a stale snapshot
      state.pendingAdminActions = Array.isArray(fresh.pendingAdminActions)
        ? fresh.pendingAdminActions
        : [];
      // Preserve per-application admin flags set by the web panel
      const adminFields = ["adminArchived", "adminArchivedAt", "adminDone", "adminNotes"];
      for (const [appId, freshApp] of Object.entries(fresh.applications || {})) {
        if (state.applications && state.applications[appId]) {
          for (const f of adminFields) {
            if (freshApp[f] !== undefined) {
              state.applications[appId][f] = freshApp[f];
            } else {
              delete state.applications[appId][f];
            }
          }
        }
      }
    } catch {
      // If refresh fails, proceed with existing snapshot — better than crashing
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
      const failedJobIds = [];
      const jobsToAttempt = queuedBefore;

      for (
        let attempted = 0;
        attempted < jobsToAttempt && state.postJobs.length > 0;
        attempted += 1
      ) {
        const job = state.postJobs.shift();
        if (!job || typeof job !== "object") {
          continue;
        }
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
          posted += 1;
          mergeWebManagedFields(state);
          writeState(state);
          logInfo(
            "queue_job_posted",
            `[JOB ${job.jobId}] Posted ${trackLabels} application(s) for row ${job.rowIndex}.`,
            {
              jobId: job.jobId,
              rowIndex: job.rowIndex,
              trackKeys: job.trackKeys,
            }
          );
        } catch (err) {
          job.lastError = err.message;
          failed += 1;
          failedJobIds.push(job.jobId);
          if (!failedJobId) {
            failedJobId = job.jobId;
          }
          if (!failedError) {
            failedError = err.message;
          }
          state.postJobs.push(job);
          mergeWebManagedFields(state);
          writeState(state);
          logError(
            "queue_job_failed",
            `[JOB ${job.jobId}] Failed posting ${trackLabels} row ${job.rowIndex}: ${err.message}`,
            {
              jobId: job.jobId,
              rowIndex: job.rowIndex,
              trackKeys: job.trackKeys,
              error: err.message,
              attempts: job.attempts,
              requeued: true,
            }
          );
        }
      }

      if (state.postJobs.length > 1) {
        sortPostJobsInPlace(state.postJobs);
        mergeWebManagedFields(state);
        writeState(state);
      }

      return {
        queuedBefore,
        posted,
        failed,
        remaining: state.postJobs.length,
        busy: false,
        failedJobId,
        failedError,
        failedJobIds,
      };
    } finally {
      isProcessingPostJobs = false;
    }
  }

  // pollOnce: handles poll once.
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
          logInfo(
            "track_auto_registered",
            `[TRACK] Auto-registered from row ${sheetRowNumber}: ${autoCreatedTrackKeys
              .map((trackKey) => `${getTrackLabel(trackKey)} (${trackKey})`)
              .join(", ")}`,
            {
              rowIndex: sheetRowNumber,
              trackKeys: autoCreatedTrackKeys,
            }
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
        logInfo(
          "queue_job_created",
          `[JOB ${job.jobId}] Queued ${formatTrackLabels(job.trackKeys)} application post for row ${sheetRowNumber}.`,
          {
            jobId: job.jobId,
            rowIndex: sheetRowNumber,
            trackKeys: job.trackKeys,
          }
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
        const queuedJobs = Array.isArray(state.postJobs) ? state.postJobs.length : 0;
        logInfo(
          "queue_paused_no_channels",
          `Posting paused: no application post channels configured. queued=${queuedJobs}. Use /set channel.`,
          {
            queuedJobs,
          }
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
        details.push(`first_failed=${queueResult.failedJobId}`);
      }
      if (queueResult.failed > 0 && queueResult.failedError) {
        details.push(`error=${String(queueResult.failedError).slice(0, 180)}`);
      }
      if (Array.isArray(queueResult.failedJobIds) && queueResult.failedJobIds.length > 1) {
        details.push(`failed_jobs=${queueResult.failedJobIds.slice(0, 5).join("|")}`);
      }
      logInfo("queue_run_summary", `Job run summary: ${details.join(", ")}`, queueResult);
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
