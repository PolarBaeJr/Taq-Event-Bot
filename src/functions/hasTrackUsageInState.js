/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function hasTrackUsageInState(state, trackKey) {
  for (const application of Object.values(state.applications || {})) {
    if (String(application?.trackKey || "").toLowerCase() === String(trackKey).toLowerCase()) {
      return true;
    }
  }

  for (const job of Array.isArray(state.postJobs) ? state.postJobs : []) {
    const keys = normalizeTrackKeys(job?.trackKeys || job?.trackKey, {
      allowEmpty: true,
      fallback: [],
    });
    if (keys.includes(trackKey)) {
      return true;
    }
  }

  return false;
}

module.exports = hasTrackUsageInState;
