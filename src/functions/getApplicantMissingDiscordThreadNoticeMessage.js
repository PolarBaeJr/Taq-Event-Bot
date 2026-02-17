/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getApplicantMissingDiscordThreadNoticeMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  return normalizeApplicantMissingDiscordThreadNoticeMessage(
    settings.applicantMissingDiscordThreadNoticeMessage
  );
}

module.exports = getApplicantMissingDiscordThreadNoticeMessage;
