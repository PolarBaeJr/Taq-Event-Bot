/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function inferApplicationTracks(headers, row) {
  const explicitSelectionHeaderHints = [
    "what are you applying for",
  ];
  const primaryHeaderHints = [
    "applying for",
    "apply for",
    "application for",
    "track",
    "position",
    "role",
  ];
  const secondaryHeaderHints = [
    "department",
    "team",
    "type",
  ];

  const collectMatchesFromHeaders = (hints) => {
    const matches = new Set();
    for (let i = 0; i < headers.length; i += 1) {
      const header = String(headers[i] || "").toLowerCase();
      if (!hints.some((hint) => header.includes(hint))) {
        continue;
      }
      const value = String(row[i] || "").trim();
      if (!value) {
        // Ignore intentionally empty form fields.
        continue;
      }
      const detected = detectTracksFromText(value);
      for (const key of detected) {
        matches.add(key);
      }
    }
    return matches;
  };

  // Highest priority: exact form selection columns.
  const explicitSelectionMatches = collectMatchesFromHeaders(
    explicitSelectionHeaderHints
  );
  if (explicitSelectionMatches.size > 0) {
    return normalizeTrackKeys([...explicitSelectionMatches]);
  }

  // Highest priority: explicit "applying for/role/track" style answers.
  const primaryMatches = collectMatchesFromHeaders(primaryHeaderHints);
  if (primaryMatches.size > 0) {
    return normalizeTrackKeys([...primaryMatches]);
  }

  // Secondary priority: department/team/type style answers.
  const secondaryMatches = collectMatchesFromHeaders(secondaryHeaderHints);
  if (secondaryMatches.size > 0) {
    return normalizeTrackKeys([...secondaryMatches]);
  }

  // Last fallback: scan all answered cells.
  const found = new Set();
  for (const cell of row) {
    const value = String(cell || "").trim();
    if (!value) {
      continue;
    }
    const detected = detectTracksFromText(value);
    for (const key of detected) {
      found.add(key);
    }
  }

  return normalizeTrackKeys([...found], {
    fallback: [DEFAULT_TRACK_KEY],
  });
}

module.exports = inferApplicationTracks;
