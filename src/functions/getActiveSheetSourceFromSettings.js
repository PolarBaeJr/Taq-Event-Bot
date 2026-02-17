/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveSheetSourceFromSettings(settings) {
  const source = normalizeSheetSourceSettings(settings?.sheetSource);
  return {
    spreadsheetId: source.spreadsheetId || config.spreadsheetId,
    sheetName: source.sheetName || config.sheetName,
    spreadsheetIdSource: source.spreadsheetId ? "state" : "env",
    sheetNameSource: source.sheetName ? "state" : "env",
  };
}

module.exports = getActiveSheetSourceFromSettings;
