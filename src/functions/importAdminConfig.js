/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function importAdminConfig(rawJson) {
  const stripped = stripCodeFence(rawJson);
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  const settingsPayload = parsed?.settings && typeof parsed.settings === "object"
    ? parsed.settings
    : parsed;
  if (!settingsPayload || typeof settingsPayload !== "object") {
    throw new Error("JSON payload must be an object or `{ settings: { ... } }`.");
  }

  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "customTracks")) {
    settings.customTracks = setRuntimeCustomTracks(settingsPayload.customTracks);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "channels")) {
    settings.channels = normalizeTrackMap(settingsPayload.channels);
  } else {
    settings.channels = normalizeTrackMap(settings.channels);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "approvedRoles")) {
    settings.approvedRoles = normalizeTrackRoleMap(settingsPayload.approvedRoles);
  } else {
    settings.approvedRoles = normalizeTrackRoleMap(settings.approvedRoles);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "voteRules")) {
    settings.voteRules = normalizeTrackVoteRuleMap(settingsPayload.voteRules);
  } else {
    settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "reviewerMentions")) {
    settings.reviewerMentions = normalizeTrackReviewerMap(settingsPayload.reviewerMentions);
  } else {
    settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "reminders")) {
    settings.reminders = normalizeReminderSettings(settingsPayload.reminders);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "dailyDigest")) {
    settings.dailyDigest = normalizeDailyDigestSettings(settingsPayload.dailyDigest);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "sheetSource")) {
    settings.sheetSource = normalizeSheetSourceSettings(settingsPayload.sheetSource);
  } else if (
    Object.prototype.hasOwnProperty.call(settingsPayload, "spreadsheetId") ||
    Object.prototype.hasOwnProperty.call(settingsPayload, "sheetName")
  ) {
    settings.sheetSource = normalizeSheetSourceSettings({
      spreadsheetId: settingsPayload.spreadsheetId,
      sheetName: settingsPayload.sheetName,
    });
  } else {
    settings.sheetSource = normalizeSheetSourceSettings(settings.sheetSource);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "reactionRoles")) {
    settings.reactionRoles = normalizeReactionRoleBindings(settingsPayload.reactionRoles);
  } else {
    settings.reactionRoles = normalizeReactionRoleBindings(settings.reactionRoles);
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "logChannelId")) {
    settings.logChannelId = isSnowflake(settingsPayload.logChannelId)
      ? settingsPayload.logChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "bugChannelId")) {
    settings.bugChannelId = isSnowflake(settingsPayload.bugChannelId)
      ? settingsPayload.bugChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "suggestionsChannelId")) {
    settings.suggestionsChannelId = isSnowflake(settingsPayload.suggestionsChannelId)
      ? settingsPayload.suggestionsChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "acceptAnnounceChannelId")) {
    settings.acceptAnnounceChannelId = isSnowflake(settingsPayload.acceptAnnounceChannelId)
      ? settingsPayload.acceptAnnounceChannelId
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "acceptAnnounceTemplate")) {
    settings.acceptAnnounceTemplate =
      typeof settingsPayload.acceptAnnounceTemplate === "string" &&
      settingsPayload.acceptAnnounceTemplate.trim()
        ? settingsPayload.acceptAnnounceTemplate
        : null;
  }

  if (Object.prototype.hasOwnProperty.call(settingsPayload, "denyDmTemplate")) {
    settings.denyDmTemplate =
      typeof settingsPayload.denyDmTemplate === "string" &&
      settingsPayload.denyDmTemplate.trim()
        ? settingsPayload.denyDmTemplate
        : null;
  }

  ensureExtendedSettingsContainers(state);
  writeState(state);

  return {
    trackCount: getApplicationTrackKeys().length,
    customTrackCount: getCustomTracksSnapshot().length,
  };
}

module.exports = importAdminConfig;
