/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getReviewerMentionsForTrackFromState(state, trackKey) {
  const settings = ensureExtendedSettingsContainers(state);
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  return settings.reviewerMentions[normalizedTrack] || {
    roleIds: [],
    userIds: [],
    rotationIndex: 0,
  };
}

module.exports = getReviewerMentionsForTrackFromState;
