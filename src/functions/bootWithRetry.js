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

      console.error(
        `Startup failed (${err.code || err.name || "error"}: ${err.message}). Retrying in ${Math.ceil(
          waitMs / 1000
        )}s...`
      );
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
