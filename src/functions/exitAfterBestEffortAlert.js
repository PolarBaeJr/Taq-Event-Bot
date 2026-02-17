/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function exitAfterBestEffortAlert(alertPayload) {
  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, 2500);
  if (typeof forceExitTimer.unref === "function") {
    forceExitTimer.unref();
  }
  void Promise.resolve()
    .then(() => sendOperationalAlert(alertPayload))
    .catch(() => {})
    .finally(() => {
      clearTimeout(forceExitTimer);
      process.exit(1);
    });
}

module.exports = exitAfterBestEffortAlert;
