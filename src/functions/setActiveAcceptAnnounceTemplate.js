/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

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

module.exports = setActiveAcceptAnnounceTemplate;
