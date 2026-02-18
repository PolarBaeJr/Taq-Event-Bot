/*
  Core module for track registry.
*/

function normalizeTrackAlias(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized;
}

// parseTrackAliasInput: handles parse track alias input.
function parseTrackAliasInput(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTrackAliasInput(item));
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,;\n]+/)
    .map((part) => normalizeTrackAlias(part))
    .filter(Boolean);
}

// normalizeTrackStorageKey: handles normalize track storage key.
function normalizeTrackStorageKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  const cleaned = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) {
    return "";
  }

  return cleaned.slice(0, 32);
}

// defaultTrackLabelFromKey: handles default track label from key.
function defaultTrackLabelFromKey(trackKey) {
  const words = String(trackKey || "")
    .split(/[_\-\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return "Track";
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// buildTrackAliasLookup: handles build track alias lookup.
function buildTrackAliasLookup(tracks) {
  const lookup = new Map();
  for (const track of tracks) {
    const key = normalizeTrackAlias(track?.key);
    if (key && !lookup.has(key)) {
      lookup.set(key, track.key);
    }
    for (const alias of Array.isArray(track?.aliases) ? track.aliases : []) {
      const normalizedAlias = normalizeTrackAlias(alias);
      if (normalizedAlias && !lookup.has(normalizedAlias)) {
        lookup.set(normalizedAlias, track.key);
      }
    }
  }
  return lookup;
}

// createTrackRegistry: handles create track registry.
function createTrackRegistry({ baseTracks }) {
  const baseTrackList = Array.isArray(baseTracks) ? baseTracks : [];
  const baseTrackKeySet = new Set(baseTrackList.map((track) => track.key));
  let runtimeCustomTracks = [];

  // normalizeCustomTrackDefinition: handles normalize custom track definition.
  function normalizeCustomTrackDefinition(rawTrack) {
    if (!rawTrack || typeof rawTrack !== "object") {
      return null;
    }

    const normalizedKey = normalizeTrackStorageKey(
      rawTrack.key || rawTrack.label || rawTrack.name
    );
    if (!normalizedKey || baseTrackKeySet.has(normalizedKey)) {
      return null;
    }

    const rawLabel = String(rawTrack.label || rawTrack.name || "").trim();
    const label = rawLabel || defaultTrackLabelFromKey(normalizedKey);

    const aliases = new Set(parseTrackAliasInput(rawTrack.aliases));
    aliases.add(normalizeTrackAlias(normalizedKey));
    aliases.add(normalizeTrackAlias(normalizedKey.replace(/_/g, " ")));
    aliases.add(normalizeTrackAlias(label));

    return {
      key: normalizedKey,
      label,
      aliases: [...aliases].filter(Boolean),
    };
  }

  // setCustomTracks: handles set custom tracks.
  function setCustomTracks(rawTracks) {
    const normalized = [];
    const seenKeys = new Set(baseTrackKeySet);
    const aliasLookup = buildTrackAliasLookup(baseTrackList);

    for (const rawTrack of Array.isArray(rawTracks) ? rawTracks : []) {
      const track = normalizeCustomTrackDefinition(rawTrack);
      if (!track || seenKeys.has(track.key)) {
        continue;
      }

      const keyOwner = aliasLookup.get(track.key);
      if (keyOwner && keyOwner !== track.key) {
        continue;
      }

      const filteredAliases = track.aliases.filter((alias) => {
        const owner = aliasLookup.get(alias);
        return !owner || owner === track.key;
      });
      track.aliases = [...new Set(filteredAliases)].filter(Boolean);
      if (!track.aliases.includes(track.key)) {
        track.aliases.push(track.key);
      }

      normalized.push(track);
      seenKeys.add(track.key);
      aliasLookup.set(track.key, track.key);
      for (const alias of track.aliases) {
        aliasLookup.set(alias, track.key);
      }
    }

    normalized.sort((a, b) => a.label.localeCompare(b.label));
    runtimeCustomTracks = normalized;
    return getCustomTracksSnapshot();
  }

  // getCustomTracksSnapshot: handles get custom tracks snapshot.
  function getCustomTracksSnapshot() {
    return runtimeCustomTracks.map((track) => ({
      key: track.key,
      label: track.label,
      aliases: [...track.aliases],
    }));
  }

  // getApplicationTracks: handles get application tracks.
  function getApplicationTracks() {
    return [...baseTrackList, ...runtimeCustomTracks];
  }

  // getApplicationTrackKeys: handles get application track keys.
  function getApplicationTrackKeys() {
    return getApplicationTracks().map((track) => track.key);
  }

  // getTrackLookupByKey: handles get track lookup by key.
  function getTrackLookupByKey() {
    return Object.fromEntries(
      getApplicationTracks().map((track) => [track.key, track])
    );
  }

  return {
    normalizeTrackAlias,
    parseTrackAliasInput,
    buildTrackAliasLookup,
    normalizeCustomTrackDefinition,
    setCustomTracks,
    getCustomTracksSnapshot,
    getApplicationTracks,
    getApplicationTrackKeys,
    getTrackLookupByKey,
  };
}

module.exports = {
  createTrackRegistry,
};
