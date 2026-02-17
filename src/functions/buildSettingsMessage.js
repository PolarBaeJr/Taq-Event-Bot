/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildSettingsMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const activeSheetSource = getActiveSheetSourceFromSettings(settings);
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
  ];

  for (const trackKey of getApplicationTrackKeys()) {
    const trackLabel = getTrackLabel(trackKey);
    const voteRule = settings.voteRules[trackKey] || DEFAULT_VOTE_RULE;
    const reviewers = settings.reviewerMentions[trackKey] || {
      roleIds: [],
      userIds: [],
      rotationIndex: 0,
    };
    lines.push(
      `${trackLabel}: vote=${formatVoteRule(voteRule)} | reviewers=${summarizeReviewerMentions(reviewers)}`
    );
  }

  return lines.join("\n");
}

module.exports = buildSettingsMessage;
