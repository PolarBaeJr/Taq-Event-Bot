/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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
  return DEFAULT_ACCEPT_ANNOUNCE_TEMPLATE;
}

module.exports = getActiveAcceptAnnounceTemplate;
