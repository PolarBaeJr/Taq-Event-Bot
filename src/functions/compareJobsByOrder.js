/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function compareJobsByOrder(a, b) {
  const rowDiff = a.rowIndex - b.rowIndex;
  if (rowDiff !== 0) {
    return rowDiff;
  }

  const aSeq = parseJobIdSequence(a.jobId);
  const bSeq = parseJobIdSequence(b.jobId);
  if (aSeq > 0 && bSeq > 0 && aSeq !== bSeq) {
    return aSeq - bSeq;
  }

  const aCreated = Date.parse(a.createdAt || "");
  const bCreated = Date.parse(b.createdAt || "");
  if (!Number.isNaN(aCreated) && !Number.isNaN(bCreated) && aCreated !== bCreated) {
    return aCreated - bCreated;
  }

  return String(a.jobId).localeCompare(String(b.jobId));
}

module.exports = compareJobsByOrder;
