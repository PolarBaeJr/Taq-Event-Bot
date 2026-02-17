/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeApplicantMissingDiscordThreadNoticeMessage(rawMessage) {
  const normalized = String(rawMessage || "").trim();
  if (!normalized) {
    return DEFAULT_APPLICANT_MISSING_DISCORD_THREAD_NOTICE_MESSAGE;
  }
  return normalized.slice(0, 1900);
}

module.exports = normalizeApplicantMissingDiscordThreadNoticeMessage;
