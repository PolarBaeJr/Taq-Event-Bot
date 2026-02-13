/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function parseJobIdSequence(jobId) {
  if (typeof jobId !== "string") {
    return 0;
  }
  const match = JOB_ID_PATTERN.exec(jobId.trim());
  if (!match) {
    return 0;
  }
  const sequence = Number(match[1]);
  if (!Number.isInteger(sequence) || sequence <= 0) {
    return 0;
  }
  return sequence;
}

module.exports = parseJobIdSequence;
