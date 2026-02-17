/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setTrackVoteRule(trackKey, rawRule) {
  const normalizedTrack = normalizeTrackKey(trackKey);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const voteRule = normalizeVoteRule(rawRule);
  settings.voteRules[normalizedTrack] = voteRule;
  writeState(state);
  return {
    trackKey: normalizedTrack,
    trackLabel: getTrackLabel(normalizedTrack),
    voteRule,
  };
}

module.exports = setTrackVoteRule;
