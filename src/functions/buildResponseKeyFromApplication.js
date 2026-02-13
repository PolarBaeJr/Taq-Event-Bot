/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildResponseKeyFromApplication(application) {
  if (!application || typeof application !== "object") {
    return null;
  }
  const explicit = String(application.responseKey || "").trim();
  if (explicit) {
    return explicit;
  }

  const timestamp = extractSubmittedFieldValue(application.submittedFields, [
    ["timestamp"],
  ]);
  const discordId = extractSubmittedFieldValue(application.submittedFields, [
    ["discord", "id"],
    ["user", "id"],
    ["member", "id"],
  ]);
  const discordUserName = extractSubmittedFieldValue(application.submittedFields, [
    ["discord", "user", "name"],
    ["discord", "name"],
  ]);
  const inGameUserName = extractSubmittedFieldValue(application.submittedFields, [
    ["ingame", "user", "name"],
    ["ingame", "user", "name"],
    ["in game", "user", "name"],
    ["ingame", "name"],
  ]);
  const applyingFor = extractSubmittedFieldValue(application.submittedFields, [
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
  return null;
}

module.exports = buildResponseKeyFromApplication;
