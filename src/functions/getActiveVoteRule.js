/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveVoteRule(trackKey) {
  const normalizedTrack = normalizeTrackKey(trackKey) || DEFAULT_TRACK_KEY;
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  return normalizeVoteRule(settings.voteRules[normalizedTrack]);
}

module.exports = getActiveVoteRule;
