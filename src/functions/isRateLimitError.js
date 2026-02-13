/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function isRateLimitError(err) {
  if (!err) {
    return false;
  }
  const status = Number(err.status);
  if (status === 429) {
    return true;
  }
  const code = Number(err.code);
  if (code === 429) {
    return true;
  }
  const message = String(err.message || "").toLowerCase();
  return message.includes("rate limit");
}

module.exports = isRateLimitError;
