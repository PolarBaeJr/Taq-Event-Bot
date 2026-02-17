/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function readAllResponses() {
  const sheets = await getSheetsClient();
  const source = getActiveSheetSource();
  const range = `${source.sheetName}!A:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: source.spreadsheetId,
    range,
  });
  return response.data.values || [];
}

module.exports = readAllResponses;
