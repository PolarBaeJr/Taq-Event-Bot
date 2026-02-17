/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeVoteRule(rawRule) {
  const numerator = clampInteger(rawRule?.numerator, {
    min: 1,
    max: 20,
    fallback: DEFAULT_VOTE_RULE.numerator,
  });
  const denominator = clampInteger(rawRule?.denominator, {
    min: 1,
    max: 20,
    fallback: DEFAULT_VOTE_RULE.denominator,
  });
  const minimumVotes = clampInteger(rawRule?.minimumVotes, {
    min: 1,
    max: 200,
    fallback: DEFAULT_VOTE_RULE.minimumVotes,
  });

  return {
    numerator,
    denominator: denominator < numerator ? numerator : denominator,
    minimumVotes,
  };
}

module.exports = normalizeVoteRule;
