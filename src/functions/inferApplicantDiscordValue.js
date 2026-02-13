/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function inferApplicantDiscordValue(headers, row) {
  let fallback = null;
  for (let i = 0; i < headers.length; i += 1) {
    const value = String(row[i] || "").trim();
    if (!value) {
      continue;
    }
    const header = String(headers[i] || "").toLowerCase();
    const isDiscordId = header.includes("discord") && header.includes("id");
    if (isDiscordId) {
      return value;
    }
    const isDiscordField = header.includes("discord");
    if (isDiscordField && !fallback) {
      fallback = value;
    }
    const isUserId = (header.includes("user") || header.includes("member")) && header.includes("id");
    if (isUserId && !fallback) {
      fallback = value;
    }
  }
  return fallback;
}

module.exports = inferApplicantDiscordValue;
