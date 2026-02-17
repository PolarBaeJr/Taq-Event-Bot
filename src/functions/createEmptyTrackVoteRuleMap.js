/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function createEmptyTrackVoteRuleMap() {
  return Object.fromEntries(
    getApplicationTrackKeys().map((trackKey) => [trackKey, normalizeVoteRule(null)])
  );
}

module.exports = createEmptyTrackVoteRuleMap;
