/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveSheetSource() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  return getActiveSheetSourceFromSettings(settings);
}

module.exports = getActiveSheetSource;
