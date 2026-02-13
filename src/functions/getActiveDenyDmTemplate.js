/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getActiveDenyDmTemplate() {
  const state = readState();
  const fromState = state?.settings?.denyDmTemplate;
  if (typeof fromState === "string" && fromState.trim()) {
    return fromState;
  }
  if (typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()) {
    return config.denyDmTemplate;
  }
  return DEFAULT_DENY_DM_TEMPLATE;
}

module.exports = getActiveDenyDmTemplate;
