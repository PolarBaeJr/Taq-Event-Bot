/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function ensureExtendedSettingsContainers(state) {
  const settings = ensureTrackSettingsContainers(state);
  settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  settings.voterRoles = normalizeTrackRoleMap(settings.voterRoles);
  settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  settings.reminders = normalizeReminderSettings(settings.reminders);
  settings.dailyDigest = normalizeDailyDigestSettings(settings.dailyDigest);
  settings.sheetSource = normalizeSheetSourceSettings(settings.sheetSource);
  settings.applicantMissingDiscordThreadNoticeMessage =
    normalizeApplicantMissingDiscordThreadNoticeMessage(
      settings.applicantMissingDiscordThreadNoticeMessage
    );
  settings.reactionRoles = normalizeReactionRoleBindings(settings.reactionRoles);
  return settings;
}

module.exports = ensureExtendedSettingsContainers;
