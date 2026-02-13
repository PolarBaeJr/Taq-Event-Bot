/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function formatJobId(sequence) {
  return `job-${String(sequence).padStart(6, "0")}`;
}

module.exports = formatJobId;
