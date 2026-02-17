/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function setTrackVoterRoles(trackKey, mentionInput) {
  const normalizedTrack = normalizeTrackKey(trackKey);
  if (!normalizedTrack) {
    throw new Error("Unknown track.");
  }

  const raw = String(mentionInput || "").trim();
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (/^clear$/i.test(raw)) {
    settings.voterRoles[normalizedTrack] = [];
    writeState(state);
    return {
      trackKey: normalizedTrack,
      trackLabel: getTrackLabel(normalizedTrack),
      roleIds: [],
    };
  }

  const roleIds = parseRoleMentionInput(raw);
  if (roleIds.length === 0) {
    throw new Error(
      "No valid roles found. Provide @role mentions, role IDs, or `role:<id>`."
    );
  }

  settings.voterRoles[normalizedTrack] = roleIds;
  writeState(state);
  return {
    trackKey: normalizedTrack,
    trackLabel: getTrackLabel(normalizedTrack),
    roleIds,
  };
}

module.exports = setTrackVoterRoles;
