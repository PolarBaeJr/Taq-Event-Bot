/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function readAllResponses() {
  const sheets = await getSheetsClient();
  const range = `${config.sheetName}!A:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });
  return response.data.values || [];
}

module.exports = readAllResponses;
