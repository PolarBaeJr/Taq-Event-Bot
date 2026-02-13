/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function extractCellByHeaderHints(headers, row, hintSets) {
  for (let i = 0; i < headers.length; i += 1) {
    const header = String(headers[i] || "").toLowerCase();
    for (const hints of hintSets) {
      if (!Array.isArray(hints) || hints.length === 0) {
        continue;
      }
      if (hints.every((hint) => header.includes(String(hint).toLowerCase()))) {
        return String(row[i] || "").trim();
      }
    }
  }
  return "";
}

module.exports = extractCellByHeaderHints;
