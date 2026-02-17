/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function formatVoteRule(rule) {
  const normalized = normalizeVoteRule(rule);
  return `${normalized.numerator}/${normalized.denominator} (min ${normalized.minimumVotes})`;
}

module.exports = formatVoteRule;
