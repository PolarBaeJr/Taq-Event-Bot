/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeSheetSourceInputValue(rawValue, fieldLabel) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    throw new Error(`${fieldLabel} cannot be empty.`);
  }
  if (/^(default|env|clear|none)$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

module.exports = normalizeSheetSourceInputValue;
