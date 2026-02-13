/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildApplicationId(trackKey, jobId, fallbackSequence = null) {
  let sequence = parseJobIdSequence(jobId);
  if (
    sequence <= 0 &&
    Number.isInteger(fallbackSequence) &&
    fallbackSequence > 0
  ) {
    sequence = fallbackSequence;
  }
  if (sequence <= 0) {
    return null;
  }
  return `${getTrackApplicationIdPrefix(trackKey)}-${sequence}`;
}

module.exports = buildApplicationId;
