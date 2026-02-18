/*
  Core module for track auto manager.
*/

const DEFAULT_AUTO_TRACK_HEADER_HINTS = [
  "what are you applying for",
  "applying for",
  "apply for",
  "application for",
  "track",
  "position",
  "role",
  "department",
  "team",
  "type",
];

const DEFAULT_AUTO_TRACK_SKIP_VALUES = [
  "none",
  "n/a",
  "na",
  "n\\a",
  "unknown",
  "null",
];

// createTrackAutoManager: handles create track auto manager.
function createTrackAutoManager(options = {}) {
  const autoTrackRegistrationEnabled = options.autoTrackRegistrationEnabled === true;
  const autoTrackHeaderHints = Array.isArray(options.autoTrackHeaderHints)
    ? options.autoTrackHeaderHints
    : DEFAULT_AUTO_TRACK_HEADER_HINTS;
  const autoTrackSkipValues = Array.isArray(options.autoTrackSkipValues)
    ? options.autoTrackSkipValues
    : DEFAULT_AUTO_TRACK_SKIP_VALUES;
  const normalizedHeaderHints = autoTrackHeaderHints
    .map((hint) => String(hint || "").toLowerCase().trim())
    .filter(Boolean);
  const skipValueSet = new Set(
    autoTrackSkipValues
      .map((value) => String(value || "").toLowerCase().trim())
      .filter(Boolean)
  );

  const {
    setRuntimeCustomTracks,
    normalizeTrackMap,
    normalizeTrackRoleMap,
    normalizeCustomTrackDefinition,
    parseTrackAliasInput,
    getApplicationTracks,
    buildTrackAliasLookup,
    getTrackLabel,
    normalizeTrackKey,
  } = options;

  // ensureTrackSettingsContainers: handles ensure track settings containers.
  function ensureTrackSettingsContainers(state) {
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.customTracks = setRuntimeCustomTracks(state.settings.customTracks);
    state.settings.channels = normalizeTrackMap(state.settings.channels);
    state.settings.approvedRoles = normalizeTrackRoleMap(state.settings.approvedRoles);
    return state.settings;
  }

  // upsertCustomTrackInState: handles upsert custom track in state.
  function upsertCustomTrackInState(state, { name, key, aliases }) {
    const settings = ensureTrackSettingsContainers(state);
    const existingCustomTracks = [...settings.customTracks];

    const normalized = normalizeCustomTrackDefinition({
      key: key || name,
      label: name,
      aliases: parseTrackAliasInput(aliases),
    });
    if (!normalized) {
      throw new Error(
        "Invalid track. Use a key/name with letters or numbers, and avoid built-in keys."
      );
    }

    const allCurrentTracks = getApplicationTracks().filter(
      (track) => track.key !== normalized.key
    );
    const aliasLookup = buildTrackAliasLookup(allCurrentTracks);
    for (const candidate of [normalized.key, ...normalized.aliases]) {
      const conflict = aliasLookup.get(candidate);
      if (conflict && conflict !== normalized.key) {
        const conflictLabel = getTrackLabel(conflict);
        throw new Error(
          `Track key/alias "${candidate}" conflicts with existing track "${conflictLabel}" (${conflict}).`
        );
      }
    }

    let created = true;
    const index = existingCustomTracks.findIndex(
      (track) => track.key === normalized.key
    );
    if (index >= 0) {
      existingCustomTracks[index] = normalized;
      created = false;
    } else {
      existingCustomTracks.push(normalized);
    }

    const nextCustomTracks = setRuntimeCustomTracks(existingCustomTracks);
    settings.customTracks = nextCustomTracks;
    if (!Object.prototype.hasOwnProperty.call(settings.channels, normalized.key)) {
      settings.channels[normalized.key] = null;
    }
    if (!Array.isArray(settings.approvedRoles[normalized.key])) {
      settings.approvedRoles[normalized.key] = [];
    }

    return {
      created,
      track: normalized,
    };
  }

  // collectTrackValuesFromFormFields: handles collect track values from form fields.
  function collectTrackValuesFromFormFields(headers, row) {
    const values = [];
    const maxLength = Math.max(
      Array.isArray(headers) ? headers.length : 0,
      Array.isArray(row) ? row.length : 0
    );

    for (let i = 0; i < maxLength; i += 1) {
      const header = String(headers?.[i] || "").toLowerCase();
      if (!normalizedHeaderHints.some((hint) => header.includes(hint))) {
        continue;
      }
      const value = String(row?.[i] || "").trim();
      if (!value) {
        continue;
      }
      values.push(value);
    }

    return values;
  }

  // splitTrackValueCandidates: handles split track value candidates.
  function splitTrackValueCandidates(rawValue) {
    const normalized = String(rawValue || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }
    return normalized
      .split(/\s*[,/;|]+\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  // isAutoCreatableTrackToken: handles is auto creatable track token.
  function isAutoCreatableTrackToken(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return false;
    }
    const lowered = normalized.toLowerCase();
    if (skipValueSet.has(lowered)) {
      return false;
    }
    if (normalized.length < 2 || normalized.length > 48) {
      return false;
    }
    if (!/[a-z0-9]/i.test(normalized)) {
      return false;
    }
    return true;
  }

  // autoRegisterTracksFromFormRow: handles auto register tracks from form row.
  function autoRegisterTracksFromFormRow(state, headers, row) {
    if (!autoTrackRegistrationEnabled) {
      return [];
    }
    const createdTrackKeys = new Set();
    const rawTrackValues = collectTrackValuesFromFormFields(headers, row);

    for (const rawValue of rawTrackValues) {
      const candidates = splitTrackValueCandidates(rawValue);
      for (const candidate of candidates) {
        if (!isAutoCreatableTrackToken(candidate)) {
          continue;
        }
        if (normalizeTrackKey(candidate)) {
          continue;
        }

        try {
          const result = upsertCustomTrackInState(state, {
            name: candidate,
            key: candidate,
            aliases: candidate,
          });
          if (result.created) {
            createdTrackKeys.add(result.track.key);
          }
        } catch {
          // Ignore invalid/conflicting values from freeform form fields.
        }
      }
    }

    return [...createdTrackKeys];
  }

  return {
    ensureTrackSettingsContainers,
    upsertCustomTrackInState,
    autoRegisterTracksFromFormRow,
  };
}

module.exports = {
  createTrackAutoManager,
};
