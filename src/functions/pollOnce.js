/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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

      const responseKey = buildResponseKey(headers, row);
      if (responseKey && trackedResponseKeys.has(responseKey)) {
        continue;
      }

      if (!responseKey && trackedRows.has(sheetRowNumber)) {
        continue;
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

module.exports = pollOnce;
