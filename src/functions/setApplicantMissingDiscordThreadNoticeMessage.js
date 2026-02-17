/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setApplicantMissingDiscordThreadNoticeMessage(rawMessage) {
  const raw = String(rawMessage || "").trim();
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (!raw) {
    throw new Error("Message cannot be empty. Provide text or `default`.");
  }

  const shouldReset = /^(default|reset|clear)$/i.test(raw);
  settings.applicantMissingDiscordThreadNoticeMessage =
    normalizeApplicantMissingDiscordThreadNoticeMessage(
      shouldReset
        ? DEFAULT_APPLICANT_MISSING_DISCORD_THREAD_NOTICE_MESSAGE
        : raw
    );
  writeState(state);
  return settings.applicantMissingDiscordThreadNoticeMessage;
}

module.exports = setApplicantMissingDiscordThreadNoticeMessage;
