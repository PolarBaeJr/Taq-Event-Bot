/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function allocateNextJobId(state) {
  if (!Number.isInteger(state.nextJobId) || state.nextJobId < 1) {
    state.nextJobId = 1;
  }
  const jobId = formatJobId(state.nextJobId);
  state.nextJobId += 1;
  return jobId;
}

module.exports = allocateNextJobId;
