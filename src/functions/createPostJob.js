/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function createPostJob(state, headers, row, rowIndex) {
  const normalizedHeaders = (Array.isArray(headers) ? headers : []).map(normalizeCell);
  const normalizedRow = (Array.isArray(row) ? row : []).map(normalizeCell);
  const trackKeys = inferApplicationTracks(normalizedHeaders, normalizedRow);
  return {
    jobId: allocateNextJobId(state),
    type: JOB_TYPE_POST_APPLICATION,
    rowIndex,
    trackKeys,
    postedTrackKeys: [],
    responseKey: buildResponseKey(normalizedHeaders, normalizedRow),
    headers: normalizedHeaders,
    row: normalizedRow,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
}

module.exports = createPostJob;
