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
      logger.error("uncaught_exception_crashlog_written", "Uncaught exception crash log written.", {
        crashPath,
      });
    } catch (logErr) {
      logger.error(
        "uncaught_exception_crashlog_failed",
        "Failed writing uncaught exception crash log.",
        {
          error: logErr.message,
        }
      );
    }
    logger.error("uncaught_exception", "Uncaught exception.", {
      error: serializeError(err),
    });
    if (config.alertOnCrash) {
      exitAfterBestEffortAlert({
        event: "uncaught_exception",
        severity: "critical",
        title: "Bot crashed (uncaught exception)",
        message: "Process is exiting due to uncaught exception.",
        details: {
          error: err?.message || String(err),
          pid: process.pid,
        },
      });
      return;
    }
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      const crashPath = writeCrashLog("unhandledRejection", reason);
      logger.error("unhandled_rejection_crashlog_written", "Unhandled rejection crash log written.", {
        crashPath,
      });
    } catch (logErr) {
      logger.error(
        "unhandled_rejection_crashlog_failed",
        "Failed writing unhandled rejection crash log.",
        {
          error: logErr.message,
        }
      );
    }
    logger.error("unhandled_rejection", "Unhandled rejection.", {
      reason: serializeError(reason),
    });
    if (config.alertOnCrash) {
      exitAfterBestEffortAlert({
        event: "unhandled_rejection",
        severity: "critical",
        title: "Bot crashed (unhandled rejection)",
        message: "Process is exiting due to unhandled promise rejection.",
        details: {
          reason:
            reason && typeof reason === "object" && "message" in reason
              ? reason.message
              : String(reason),
          pid: process.pid,
        },
      });
      return;
    }
    process.exit(1);
  });
}

module.exports = installCrashHandlers;
