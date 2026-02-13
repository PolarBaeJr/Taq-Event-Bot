/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function getApplicationDisplayId(application, fallbackMessageId = null) {
  const derived = buildApplicationId(application?.trackKey, application?.jobId);
  if (derived) {
    return derived;
  }

  const explicit = String(application?.applicationId || "").trim();
  if (explicit) {
    return explicit;
  }

  const messageId = String(application?.messageId || fallbackMessageId || "").trim();
  return messageId || "Unknown";
}

module.exports = getApplicationDisplayId;
