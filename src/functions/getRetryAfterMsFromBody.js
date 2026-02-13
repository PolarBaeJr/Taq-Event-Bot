/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getRetryAfterMsFromBody(body) {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.retry_after === "number" && parsed.retry_after >= 0) {
      return Math.ceil(parsed.retry_after * 1000);
    }
  } catch {
    // ignore malformed or non-JSON bodies
  }
  return null;
}

module.exports = getRetryAfterMsFromBody;
