/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildResponseKey(headers, row) {
  const timestamp = extractCellByHeaderHints(headers, row, [["timestamp"]]);
  const discordId = extractCellByHeaderHints(headers, row, [
    ["discord", "id"],
    ["user", "id"],
    ["member", "id"],
  ]);
  const discordUserName = extractCellByHeaderHints(headers, row, [
    ["discord", "user", "name"],
    ["discord", "name"],
  ]);
  const inGameUserName = extractCellByHeaderHints(headers, row, [
    ["ingame", "user", "name"],
    ["ingame", "user", "name"],
    ["in game", "user", "name"],
    ["ingame", "name"],
  ]);
  const applyingFor = extractCellByHeaderHints(headers, row, [
    ["what are you applying for"],
    ["applying for"],
    ["application for"],
    ["track"],
    ["position"],
    ["role"],
  ]);
  if (timestamp) {
    return [
      `ts:${timestamp.toLowerCase()}`,
      `id:${discordId.toLowerCase()}`,
      `dname:${discordUserName.toLowerCase()}`,
      `ign:${inGameUserName.toLowerCase()}`,
      `apply:${applyingFor.toLowerCase()}`,
    ].join("|");
  }

  const normalizedCells = (Array.isArray(row) ? row : [])
    .map(normalizeCell)
    .map((value) => value.trim())
    .filter(Boolean);
  if (normalizedCells.length === 0) {
    return null;
  }
  return `row:${normalizedCells.join("\u241f").toLowerCase()}`;
}

module.exports = buildResponseKey;
