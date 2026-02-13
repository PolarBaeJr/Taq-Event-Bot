/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function extractSubmittedFieldValue(submittedFields, hintSets) {
  if (!Array.isArray(submittedFields)) {
    return "";
  }
  for (const rawLine of submittedFields) {
    const line = String(rawLine || "");
    const match = /^\*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const key = String(match[1] || "").toLowerCase();
    const value = String(match[2] || "").trim();
    if (!value) {
      continue;
    }
    for (const hints of hintSets) {
      if (!Array.isArray(hints) || hints.length === 0) {
        continue;
      }
      if (hints.every((hint) => key.includes(String(hint).toLowerCase()))) {
        return value;
      }
    }
  }
  return "";
}

module.exports = extractSubmittedFieldValue;
