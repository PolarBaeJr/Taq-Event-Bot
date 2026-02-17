/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function trimEmbedValue(value, maxLength = 1024, fallback = "n/a") {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 20))}\n...[truncated]`;
}

module.exports = trimEmbedValue;
