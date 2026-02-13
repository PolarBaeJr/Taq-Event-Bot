/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildTrackedResponseKeySet(state) {
  const trackedKeys = new Set();

  if (Array.isArray(state.postJobs)) {
    for (const job of state.postJobs) {
      const explicit = String(job?.responseKey || "").trim();
      if (explicit) {
        trackedKeys.add(explicit);
        continue;
      }
      const inferred = buildResponseKey(
        Array.isArray(job?.headers) ? job.headers : [],
        Array.isArray(job?.row) ? job.row : []
      );
      if (inferred) {
        trackedKeys.add(inferred);
      }
    }
  }

  for (const application of Object.values(state.applications || {})) {
    const key = buildResponseKeyFromApplication(application);
    if (key) {
      trackedKeys.add(key);
    }
  }

  return trackedKeys;
}

module.exports = buildTrackedResponseKeySet;
