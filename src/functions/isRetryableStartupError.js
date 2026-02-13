/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function isRetryableStartupError(err) {
  const retryableCodes = new Set([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ]);

  const code = String(err?.code || "").toUpperCase();
  if (retryableCodes.has(code)) {
    return true;
  }

  const message = String(err?.message || "").toLowerCase();
  return (
    message.includes("getaddrinfo") ||
    message.includes("network") ||
    message.includes("timed out")
  );
}

module.exports = isRetryableStartupError;
