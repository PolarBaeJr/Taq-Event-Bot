/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function compareApplicationsByRowOrder(left, right) {
  const leftRow = Number.isInteger(left?.rowIndex) ? left.rowIndex : Number.MAX_SAFE_INTEGER;
  const rightRow = Number.isInteger(right?.rowIndex) ? right.rowIndex : Number.MAX_SAFE_INTEGER;
  if (leftRow !== rightRow) {
    return leftRow - rightRow;
  }

  const leftCreated = parseIsoTimeMs(left?.createdAt);
  const rightCreated = parseIsoTimeMs(right?.createdAt);
  const leftCreatedSafe = Number.isFinite(leftCreated) ? leftCreated : Number.MAX_SAFE_INTEGER;
  const rightCreatedSafe = Number.isFinite(rightCreated)
    ? rightCreated
    : Number.MAX_SAFE_INTEGER;
  if (leftCreatedSafe !== rightCreatedSafe) {
    return leftCreatedSafe - rightCreatedSafe;
  }

  const leftId = String(left?.messageId || left?.applicationId || "");
  const rightId = String(right?.messageId || right?.applicationId || "");
  return leftId.localeCompare(rightId);
}

module.exports = compareApplicationsByRowOrder;
