/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function extractAnsweredFields(headers, row) {
  const headerList = Array.isArray(headers) ? headers : [];
  const rowList = Array.isArray(row) ? row : [];
  const count = Math.max(headerList.length, rowList.length);
  const fields = [];

  for (let i = 0; i < count; i += 1) {
    const rawValue = rowList[i];
    if (!isAnsweredValue(rawValue)) {
      continue;
    }

    const key = String(headerList[i] || `Field ${i + 1}`).trim() || `Field ${i + 1}`;
    const value = String(rawValue).trim();
    fields.push({ key, value });
  }

  return fields;
}

module.exports = extractAnsweredFields;
