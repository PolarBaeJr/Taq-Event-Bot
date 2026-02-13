/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function detectTracksFromText(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) {
    return new Set();
  }

  const matched = new Set();
  for (const track of APPLICATION_TRACKS) {
    for (const alias of track.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (pattern.test(text)) {
        matched.add(track.key);
      }
    }
  }

  return matched;
}

module.exports = detectTracksFromText;
