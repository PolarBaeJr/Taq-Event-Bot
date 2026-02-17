/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildSubmittedFieldsFingerprintFromLines(submittedFields) {
  return (Array.isArray(submittedFields) ? submittedFields : [])
    .map((line) => normalizeComparableText(line))
    .filter(Boolean)
    .join("|");
}

module.exports = buildSubmittedFieldsFingerprintFromLines;
