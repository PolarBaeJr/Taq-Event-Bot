/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function exportAdminConfig() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      customTracks: settings.customTracks,
      channels: settings.channels,
      logChannelId: settings.logChannelId || null,
      botLogChannelId: settings.botLogChannelId || null,
      bugChannelId: settings.bugChannelId || null,
      suggestionsChannelId: settings.suggestionsChannelId || null,
      approvedRoles: settings.approvedRoles,
      acceptAnnounceChannelId: settings.acceptAnnounceChannelId || null,
      acceptAnnounceTemplate: settings.acceptAnnounceTemplate || null,
      denyDmTemplate: settings.denyDmTemplate || null,
      voteRules: settings.voteRules,
      reviewerMentions: settings.reviewerMentions,
      reminders: settings.reminders,
      dailyDigest: settings.dailyDigest,
      sheetSource: settings.sheetSource,
      reactionRoles: settings.reactionRoles,
    },
  };
  return JSON.stringify(payload, null, 2);
}

module.exports = exportAdminConfig;
