/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function defaultState() {
  return {
    lastRow: 1,
    applications: {},
    threads: {},
    controlActions: [],
    nextJobId: 1,
    postJobs: [],
    settings: {
      channels: createEmptyTrackMap(),
      logChannelId: null,
      bugChannelId: null,
      suggestionsChannelId: null,
      approvedRoles: createEmptyTrackRoleMap(),
      acceptAnnounceChannelId: null,
      acceptAnnounceTemplate: null,
      denyDmTemplate: null,
      customTracks: getCustomTracksSnapshot(),
    },
  };
}

module.exports = defaultState;
