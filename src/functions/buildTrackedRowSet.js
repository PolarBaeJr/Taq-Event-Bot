/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildTrackedRowSet(state) {
  const trackedRows = new Set();

  if (Array.isArray(state.postJobs)) {
    for (const job of state.postJobs) {
      if (Number.isInteger(job?.rowIndex) && job.rowIndex >= 2) {
        trackedRows.add(job.rowIndex);
      }
    }
  }

  for (const application of Object.values(state.applications || {})) {
    if (Number.isInteger(application?.rowIndex) && application.rowIndex >= 2) {
      trackedRows.add(application.rowIndex);
    }
  }

  return trackedRows;
}

module.exports = buildTrackedRowSet;
