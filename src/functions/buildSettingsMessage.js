/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildSettingsMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const activeSheetSource = getActiveSheetSourceFromSettings(settings);
  const applicantMissingDiscordThreadNoticeMessage =
    normalizeApplicantMissingDiscordThreadNoticeMessage(
      settings.applicantMissingDiscordThreadNoticeMessage
    ).replace(/\n/g, "\\n");
  const applicationLogsChannelId = getActiveLogsChannelId();
  const botLogsChannelId = getActiveBotLogsChannelId();
  const lines = [
    "⚙️ **Current Settings**",
    `Reminders: ${
      settings.reminders.enabled
        ? `enabled (threshold=${settings.reminders.thresholdHours}h, repeat=${settings.reminders.repeatHours}h)`
        : "disabled"
    }`,
    `Daily Digest: ${
      settings.dailyDigest.enabled
        ? `enabled at ${settings.dailyDigest.hourUtc}:00 UTC (last=${settings.dailyDigest.lastDigestDate || "never"})`
        : "disabled"
    }`,
    `Reaction Roles: ${Array.isArray(settings.reactionRoles) ? settings.reactionRoles.length : 0}`,
    `Sheets Source: spreadsheet_id=${activeSheetSource.spreadsheetId} (${activeSheetSource.spreadsheetIdSource}) | sheet_name=${activeSheetSource.sheetName} (${activeSheetSource.sheetNameSource})`,
    `Missing-User Thread Notice: ${applicantMissingDiscordThreadNoticeMessage}`,
    `Application Logs Channel: ${applicationLogsChannelId ? `<#${applicationLogsChannelId}>` : "not set"}`,
    `Log Channel: ${botLogsChannelId ? `<#${botLogsChannelId}>` : "not set (falls back to application logs)"}`,
  ];

  for (const trackKey of getApplicationTrackKeys()) {
    const trackLabel = getTrackLabel(trackKey);
    const voteRule = settings.voteRules[trackKey] || DEFAULT_VOTE_RULE;
    const voterRoles = settings.voterRoles[trackKey] || [];
    const reviewers = settings.reviewerMentions[trackKey] || {
      roleIds: [],
      userIds: [],
      rotationIndex: 0,
    };
    lines.push(
      `${trackLabel}: vote=${formatVoteRule(voteRule)} | voters=${summarizeRoleMentions(voterRoles, "any channel member")} | reviewers=${summarizeReviewerMentions(reviewers)}`
    );
  }

  return lines.join("\n");
}

module.exports = buildSettingsMessage;
