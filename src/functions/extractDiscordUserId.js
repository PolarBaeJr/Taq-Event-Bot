/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function extractDiscordUserId(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  const snowflakeMatch = raw.match(/\b(\d{17,20})\b/);
  if (snowflakeMatch) {
    return snowflakeMatch[1];
  }
  return null;
}

module.exports = extractDiscordUserId;
