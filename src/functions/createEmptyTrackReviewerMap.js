/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function createEmptyTrackReviewerMap() {
  return Object.fromEntries(
    getApplicationTrackKeys().map((trackKey) => [
      trackKey,
      { roleIds: [], userIds: [], rotationIndex: 0 },
    ])
  );
}

module.exports = createEmptyTrackReviewerMap;
