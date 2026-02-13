/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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

module.exports = processQueuedPostJobs;
