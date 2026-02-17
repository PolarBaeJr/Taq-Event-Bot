/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeSheetSourceSettings(rawSheetSource) {
  const source = rawSheetSource && typeof rawSheetSource === "object" ? rawSheetSource : {};
  return {
    spreadsheetId:
      typeof source.spreadsheetId === "string" && source.spreadsheetId.trim()
        ? source.spreadsheetId.trim()
        : null,
    sheetName:
      typeof source.sheetName === "string" && source.sheetName.trim()
        ? source.sheetName.trim()
        : null,
  };
}

module.exports = normalizeSheetSourceSettings;
