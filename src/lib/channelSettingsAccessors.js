function createChannelSettingsAccessors(options = {}) {
  const config = options.config && typeof options.config === "object"
    ? options.config
    : {};
  const defaultTrackKey = String(options.defaultTrackKey || "tester");
  const baseTrackEnvOverrides = options.baseTrackEnvOverrides || {};
  const defaultAcceptAnnounceTemplate = String(
    options.defaultAcceptAnnounceTemplate ||
      "Welcome to {track} team, if you need any information please contact administrators."
  );
  const defaultDenyDmTemplate = String(
    options.defaultDenyDmTemplate || "Your application has been denied."
  );
  const readState = typeof options.readState === "function"
    ? options.readState
    : () => ({ settings: {} });
  const writeState = typeof options.writeState === "function"
    ? options.writeState
    : () => {};
  const normalizeTrackKey = typeof options.normalizeTrackKey === "function"
    ? options.normalizeTrackKey
    : () => null;
  const normalizeTrackMap = typeof options.normalizeTrackMap === "function"
    ? options.normalizeTrackMap
    : (value) => value || {};
  const normalizeTrackRoleMap = typeof options.normalizeTrackRoleMap === "function"
    ? options.normalizeTrackRoleMap
    : (value) => value || {};
  const parseRoleIdList = typeof options.parseRoleIdList === "function"
    ? options.parseRoleIdList
    : () => [];
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : () => false;
  const getApplicationTrackKeys = typeof options.getApplicationTrackKeys === "function"
    ? options.getApplicationTrackKeys
    : () => [];

  function createEmptyTrackMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, null]));
  }

  function createEmptyTrackRoleMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, []]));
  }

  function getEnvChannelIdForTrack(trackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const envOverride = baseTrackEnvOverrides[normalized];
    if (!envOverride) {
      return null;
    }

    for (const key of envOverride.channelKeys || []) {
      const value = config[key];
      if (isSnowflake(value)) {
        return value;
      }
    }

    return null;
  }

  function getEnvApprovedRoleIdsForTrack(trackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const envOverride = baseTrackEnvOverrides[normalized];
    if (!envOverride) {
      return [];
    }

    for (const key of envOverride.approvedRoleListKeys || []) {
      const fromList = parseRoleIdList(config[key]);
      if (fromList.length > 0) {
        return fromList;
      }
    }

    for (const key of envOverride.approvedRoleSingleKeys || []) {
      const value = config[key];
      if (isSnowflake(value)) {
        return [value];
      }
    }

    return [];
  }

  function getActiveChannelIdFromState(state, trackKey = defaultTrackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const stateChannels = normalizeTrackMap(state?.settings?.channels);
    if (isSnowflake(stateChannels[normalized])) {
      return stateChannels[normalized];
    }
    return getEnvChannelIdForTrack(normalized);
  }

  function getActiveChannelId(trackKey = defaultTrackKey) {
    const state = readState();
    return getActiveChannelIdFromState(state, trackKey);
  }

  function getActiveChannelMap() {
    const state = readState();
    const result = createEmptyTrackMap();
    for (const trackKey of getApplicationTrackKeys()) {
      result[trackKey] = getActiveChannelIdFromState(state, trackKey);
    }
    return result;
  }

  function getAnyActiveChannelId() {
    const channels = getActiveChannelMap();
    for (const trackKey of getApplicationTrackKeys()) {
      if (isSnowflake(channels[trackKey])) {
        return channels[trackKey];
      }
    }
    return null;
  }

  function getTrackKeyForChannelId(channelId) {
    if (!isSnowflake(channelId)) {
      return null;
    }
    const channels = getActiveChannelMap();
    for (const trackKey of getApplicationTrackKeys()) {
      if (channels[trackKey] === channelId) {
        return trackKey;
      }
    }
    return null;
  }

  function hasAnyActivePostChannelConfigured() {
    return Boolean(getAnyActiveChannelId());
  }

  function setActiveChannel(trackKey, channelId) {
    const normalized = normalizeTrackKey(trackKey);
    if (!normalized) {
      throw new Error("Invalid track key.");
    }
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.channels = normalizeTrackMap(state.settings.channels);
    state.settings.channels[normalized] = channelId;
    writeState(state);
  }

  function getActiveLogsChannelId() {
    const state = readState();
    if (isSnowflake(state.settings.logChannelId)) {
      return state.settings.logChannelId;
    }
    if (isSnowflake(config.logsChannelId)) {
      return config.logsChannelId;
    }
    return null;
  }

  function setActiveLogsChannel(channelId) {
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid log channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.logChannelId = channelId;
    writeState(state);
  }

  function getActiveBugChannelId() {
    const state = readState();
    if (isSnowflake(state?.settings?.bugChannelId)) {
      return state.settings.bugChannelId;
    }
    if (isSnowflake(config.bugChannelId)) {
      return config.bugChannelId;
    }
    return null;
  }

  function setActiveBugChannel(channelId) {
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid bug channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.bugChannelId = channelId;
    writeState(state);
  }

  function getActiveSuggestionsChannelId() {
    const state = readState();
    if (isSnowflake(state?.settings?.suggestionsChannelId)) {
      return state.settings.suggestionsChannelId;
    }
    if (isSnowflake(config.suggestionsChannelId)) {
      return config.suggestionsChannelId;
    }
    return null;
  }

  function setActiveSuggestionsChannel(channelId) {
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid suggestions channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.suggestionsChannelId = channelId;
    writeState(state);
  }

  function getActiveAcceptAnnounceChannelId() {
    const state = readState();
    if (isSnowflake(state?.settings?.acceptAnnounceChannelId)) {
      return state.settings.acceptAnnounceChannelId;
    }
    if (isSnowflake(config.acceptAnnounceChannelId)) {
      return config.acceptAnnounceChannelId;
    }
    return null;
  }

  function setActiveAcceptAnnounceChannel(channelId) {
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid accept announce channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.acceptAnnounceChannelId = channelId;
    writeState(state);
  }

  function getActiveAcceptAnnounceTemplate() {
    const state = readState();
    const fromState = state?.settings?.acceptAnnounceTemplate;
    if (typeof fromState === "string" && fromState.trim()) {
      return fromState;
    }
    if (
      typeof config.acceptAnnounceTemplate === "string" &&
      config.acceptAnnounceTemplate.trim()
    ) {
      return config.acceptAnnounceTemplate;
    }
    return defaultAcceptAnnounceTemplate;
  }

  function setActiveAcceptAnnounceTemplate(template) {
    const value = String(template || "").trim();
    if (!value) {
      throw new Error("Accept announcement template cannot be empty.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.acceptAnnounceTemplate = value;
    writeState(state);
  }

  function getActiveDenyDmTemplate() {
    const state = readState();
    const fromState = state?.settings?.denyDmTemplate;
    if (typeof fromState === "string" && fromState.trim()) {
      return fromState;
    }
    if (typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()) {
      return config.denyDmTemplate;
    }
    return defaultDenyDmTemplate;
  }

  function setActiveDenyDmTemplate(template) {
    const value = String(template || "").trim();
    if (!value) {
      throw new Error("Deny DM template cannot be empty.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.denyDmTemplate = value;
    writeState(state);
  }

  function getActiveApprovedRoleMap() {
    const state = readState();
    const result = createEmptyTrackRoleMap();
    for (const trackKey of getApplicationTrackKeys()) {
      result[trackKey] = getActiveApprovedRoleIdsFromState(state, trackKey);
    }
    return result;
  }

  function getActiveApprovedRoleIdsFromState(state, trackKey = defaultTrackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const stateRoles = normalizeTrackRoleMap(state?.settings?.approvedRoles);
    if (stateRoles[normalized].length > 0) {
      return stateRoles[normalized];
    }
    return getEnvApprovedRoleIdsForTrack(normalized);
  }

  function getActiveApprovedRoleIds(trackKey = defaultTrackKey) {
    const state = readState();
    return getActiveApprovedRoleIdsFromState(state, trackKey);
  }

  function setActiveApprovedRoles(trackKey, roleIds) {
    const normalized = normalizeTrackKey(trackKey);
    if (!normalized) {
      throw new Error("Invalid track key.");
    }
    const normalizedRoleIds = parseRoleIdList(roleIds);
    if (normalizedRoleIds.length === 0) {
      throw new Error("At least one valid approved role id is required.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.approvedRoles = normalizeTrackRoleMap(state.settings.approvedRoles);
    state.settings.approvedRoles[normalized] = normalizedRoleIds;
    writeState(state);
    return {
      replaced: true,
      roleIds: state.settings.approvedRoles[normalized],
    };
  }

  return {
    getEnvChannelIdForTrack,
    getEnvApprovedRoleIdsForTrack,
    getActiveChannelIdFromState,
    getActiveChannelId,
    getActiveChannelMap,
    getAnyActiveChannelId,
    getTrackKeyForChannelId,
    hasAnyActivePostChannelConfigured,
    setActiveChannel,
    getActiveLogsChannelId,
    setActiveLogsChannel,
    getActiveBugChannelId,
    setActiveBugChannel,
    getActiveSuggestionsChannelId,
    setActiveSuggestionsChannel,
    getActiveAcceptAnnounceChannelId,
    setActiveAcceptAnnounceChannel,
    getActiveAcceptAnnounceTemplate,
    setActiveAcceptAnnounceTemplate,
    getActiveDenyDmTemplate,
    setActiveDenyDmTemplate,
    getActiveApprovedRoleMap,
    getActiveApprovedRoleIdsFromState,
    getActiveApprovedRoleIds,
    setActiveApprovedRoles,
  };
}

module.exports = {
  createChannelSettingsAccessors,
};
