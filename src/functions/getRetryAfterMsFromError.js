/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getRetryAfterMsFromError(err) {
  const directRetryAfter =
    err?.rawError?.retry_after ?? err?.data?.retry_after ?? err?.retry_after;
  if (typeof directRetryAfter === "number" && Number.isFinite(directRetryAfter) && directRetryAfter >= 0) {
    if (directRetryAfter > 1000) {
      return Math.ceil(directRetryAfter);
    }
    return Math.ceil(directRetryAfter * 1000);
  }
  return null;
}

module.exports = getRetryAfterMsFromError;
