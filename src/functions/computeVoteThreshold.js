/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function computeVoteThreshold(eligibleCount, trackKey) {
  const rule = getActiveVoteRule(trackKey);
  const ratioThreshold = Math.ceil((eligibleCount * rule.numerator) / rule.denominator);
  const threshold = Math.max(rule.minimumVotes, ratioThreshold);
  return {
    rule,
    ratioThreshold,
    threshold,
  };
}

module.exports = computeVoteThreshold;
