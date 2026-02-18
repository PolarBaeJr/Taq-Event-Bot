/*
  Core module for channel settings accessors.
*/

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

  // createEmptyTrackMap: handles create empty track map.
  function createEmptyTrackMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, null]));
  }

  // createEmptyTrackRoleMap: handles create empty track role map.
  function createEmptyTrackRoleMap() {
    return Object.fromEntries(getApplicationTrackKeys().map((trackKey) => [trackKey, []]));
  }

  // getEnvChannelIdForTrack: handles get env channel id for track.
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

  // getEnvApprovedRoleIdsForTrack: handles get env approved role ids for track.
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

  // getActiveChannelIdFromState: handles get active channel id from state.
  function getActiveChannelIdFromState(state, trackKey = defaultTrackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const stateChannels = normalizeTrackMap(state?.settings?.channels);
    if (isSnowflake(stateChannels[normalized])) {
      return stateChannels[normalized];
    }
    return getEnvChannelIdForTrack(normalized);
  }

  // getActiveChannelId: handles get active channel id.
  function getActiveChannelId(trackKey = defaultTrackKey) {
    const state = readState();
    return getActiveChannelIdFromState(state, trackKey);
  }

  // getActiveChannelMap: handles get active channel map.
  function getActiveChannelMap() {
    const state = readState();
    const result = createEmptyTrackMap();
    for (const trackKey of getApplicationTrackKeys()) {
      result[trackKey] = getActiveChannelIdFromState(state, trackKey);
    }
    return result;
  }

  // getAnyActiveChannelId: handles get any active channel id.
  function getAnyActiveChannelId() {
    const channels = getActiveChannelMap();
    for (const trackKey of getApplicationTrackKeys()) {
      if (isSnowflake(channels[trackKey])) {
        return channels[trackKey];
      }
    }
    return null;
  }

  // getTrackKeyForChannelId: handles get track key for channel id.
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

  // hasAnyActivePostChannelConfigured: handles has any active post channel configured.
  function hasAnyActivePostChannelConfigured() {
    return Boolean(getAnyActiveChannelId());
  }

  // setActiveChannel: handles set active channel.
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

  // getActiveLogsChannelId: handles get active logs channel id.
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

  // setActiveLogsChannel: handles set active logs channel.
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

  // getConfiguredBotLogsChannelId: handles get configured bot logs channel id.
  function getConfiguredBotLogsChannelId(state) {
    if (isSnowflake(state?.settings?.botLogChannelId)) {
      return state.settings.botLogChannelId;
    }
    if (isSnowflake(config.botLogsChannelId)) {
      return config.botLogsChannelId;
    }
    return null;
  }

  // getActiveBotLogsChannelId: handles get active bot logs channel id.
  function getActiveBotLogsChannelId() {
    const state = readState();
    const configured = getConfiguredBotLogsChannelId(state);
    if (configured) {
      return configured;
    }
    if (isSnowflake(state?.settings?.logChannelId)) {
      return state.settings.logChannelId;
    }
    if (isSnowflake(config.logsChannelId)) {
      return config.logsChannelId;
    }
    return null;
  }

  // setActiveBotLogsChannel: handles set active bot logs channel.
  function setActiveBotLogsChannel(channelId) {
    if (!isSnowflake(channelId)) {
      throw new Error("Invalid bot log channel id.");
    }
    const state = readState();
    state.settings = state.settings && typeof state.settings === "object"
      ? state.settings
      : {};
    state.settings.botLogChannelId = channelId;
    writeState(state);
  }

  // getActiveBugChannelId: handles get active bug channel id.
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

  // setActiveBugChannel: handles set active bug channel.
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

  // getActiveSuggestionsChannelId: handles get active suggestions channel id.
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

  // setActiveSuggestionsChannel: handles set active suggestions channel.
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

  // getActiveAcceptAnnounceChannelId: handles get active accept announce channel id.
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

  // setActiveAcceptAnnounceChannel: handles set active accept announce channel.
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

  // getActiveAcceptAnnounceTemplate: handles get active accept announce template.
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

  // setActiveAcceptAnnounceTemplate: handles set active accept announce template.
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

  // getActiveDenyDmTemplate: handles get active deny dm template.
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

  // setActiveDenyDmTemplate: handles set active deny dm template.
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

  // getActiveApprovedRoleMap: handles get active approved role map.
  function getActiveApprovedRoleMap() {
    const state = readState();
    const result = createEmptyTrackRoleMap();
    for (const trackKey of getApplicationTrackKeys()) {
      result[trackKey] = getActiveApprovedRoleIdsFromState(state, trackKey);
    }
    return result;
  }

  // getActiveApprovedRoleIdsFromState: handles get active approved role ids from state.
  function getActiveApprovedRoleIdsFromState(state, trackKey = defaultTrackKey) {
    const normalized = normalizeTrackKey(trackKey) || defaultTrackKey;
    const stateRoles = normalizeTrackRoleMap(state?.settings?.approvedRoles);
    if (stateRoles[normalized].length > 0) {
      return stateRoles[normalized];
    }
    return getEnvApprovedRoleIdsForTrack(normalized);
  }

  // getActiveApprovedRoleIds: handles get active approved role ids.
  function getActiveApprovedRoleIds(trackKey = defaultTrackKey) {
    const state = readState();
    return getActiveApprovedRoleIdsFromState(state, trackKey);
  }

  // setActiveApprovedRoles: handles set active approved roles.
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
    getActiveBotLogsChannelId,
    setActiveBotLogsChannel,
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
