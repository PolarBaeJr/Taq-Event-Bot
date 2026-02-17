/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setTrackReviewerMentions(trackKey, mentionInput) {
  const normalizedTrack = normalizeTrackKey(trackKey);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const raw = String(mentionInput || "").trim();
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (/^clear$/i.test(raw)) {
    settings.reviewerMentions[normalizedTrack] = {
      roleIds: [],
      userIds: [],
      rotationIndex: 0,
    };
    writeState(state);
    return settings.reviewerMentions[normalizedTrack];
  }

  const parsed = parseReviewerMentionInput(raw);
  if (parsed.roleIds.length === 0 && parsed.userIds.length === 0) {
    throw new Error(
      "No valid reviewers found. Provide @user/@role mentions, raw user IDs, or `role:<id>`."
    );
  }

  settings.reviewerMentions[normalizedTrack] = {
    roleIds: parsed.roleIds,
    userIds: parsed.userIds,
    rotationIndex: 0,
  };
  writeState(state);
  return settings.reviewerMentions[normalizedTrack];
}

module.exports = setTrackReviewerMentions;
