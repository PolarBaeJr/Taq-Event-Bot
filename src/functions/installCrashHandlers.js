/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function installCrashHandlers() {
  if (crashHandlersInstalled) {
    return;
  }
  crashHandlersInstalled = true;

  process.on("uncaughtException", (err) => {
    try {
      const crashPath = writeCrashLog("uncaughtException", err);
      console.error(`Uncaught exception. Crash log written to ${crashPath}`);
    } catch (logErr) {
      console.error("Failed writing uncaught exception crash log:", logErr.message);
    }
    console.error("Uncaught exception:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      const crashPath = writeCrashLog("unhandledRejection", reason);
      console.error(`Unhandled rejection. Crash log written to ${crashPath}`);
    } catch (logErr) {
      console.error("Failed writing unhandled rejection crash log:", logErr.message);
    }
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  });
}

module.exports = installCrashHandlers;
