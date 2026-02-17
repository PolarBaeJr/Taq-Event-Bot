/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function bootWithRetry() {
  const waitMs =
    Number.isFinite(config.startupRetryMs) && config.startupRetryMs > 0
      ? config.startupRetryMs
      : 15000;

  while (true) {
    try {
      await main();
      return;
    } catch (err) {
      if (!isRetryableStartupError(err)) {
        throw err;
      }

      logger.error(
        "startup_retryable_failure",
        `Startup failed (${err.code || err.name || "error"}: ${err.message}). Retrying in ${Math.ceil(
          waitMs / 1000
        )}s...`,
        {
          code: err.code || null,
          name: err.name || null,
          error: err.message,
          retryAfterMs: waitMs,
        }
      );
      if (config.alertOnRetry) {
        await sendOperationalAlert({
          event: "startup_retryable_failure",
          severity: "warning",
          title: "Startup retry scheduled",
          message: "Bot startup failed with a retryable error.",
          details: {
            code: err.code || err.name || "error",
            error: err.message,
            retryAfterSeconds: Math.ceil(waitMs / 1000),
          },
        });
      }
      try {
        client.destroy();
      } catch {
        // ignore cleanup errors between retries
      }
      await sleep(waitMs);
    }
  }
}

module.exports = bootWithRetry;
