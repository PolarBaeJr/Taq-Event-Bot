/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function removeCustomTrack(track) {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const normalizedTrack = normalizeTrackKey(track);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const customTracks = Array.isArray(settings.customTracks) ? settings.customTracks : [];
  const existing = customTracks.find((item) => item.key === normalizedTrack);
  if (!existing) {
    throw new Error("Only custom tracks can be removed.");
  }

  if (hasTrackUsageInState(state, normalizedTrack)) {
    throw new Error(
      "Cannot remove this track because existing applications/jobs still reference it."
    );
  }

  settings.customTracks = setRuntimeCustomTracks(
    customTracks.filter((item) => item.key !== normalizedTrack)
  );
  settings.channels = normalizeTrackMap(settings.channels);
  settings.approvedRoles = normalizeTrackRoleMap(settings.approvedRoles);
  settings.voteRules = normalizeTrackVoteRuleMap(settings.voteRules);
  settings.voterRoles = normalizeTrackRoleMap(settings.voterRoles);
  settings.reviewerMentions = normalizeTrackReviewerMap(settings.reviewerMentions);
  writeState(state);

  return existing;
}

module.exports = removeCustomTrack;
