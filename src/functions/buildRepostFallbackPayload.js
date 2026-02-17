/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildRepostFallbackPayload(application, normalizedTrackKey) {
  const trackLabel = getTrackLabel(normalizedTrackKey);
  const submitted = Array.isArray(application?.submittedFields)
    ? application.submittedFields
        .map((line) => truncateContent(line, 180))
        .filter(Boolean)
    : [];
  const submittedPreview = submitted.slice(0, 12);
  if (submitted.length > submittedPreview.length) {
    submittedPreview.push(`...and ${submitted.length - submittedPreview.length} more field(s).`);
  }

  const lines = [
    "♻️ **Reposted Historical Application**",
    `🧭 **Track:** ${trackLabel}`,
    `🆔 **Application ID:** ${getApplicationDisplayId(application, application?.messageId || "")}`,
    `👤 **Applicant:** ${application?.applicantName || "Unknown"}`,
    `📄 **Original Message ID:** ${application?.messageId || "Unknown"}`,
    `📊 **Original Status:** ${String(application?.status || STATUS_PENDING).toUpperCase()}`,
    `🗂️ **Row:** ${Number.isInteger(application?.rowIndex) ? application.rowIndex : "Unknown"}`,
    "",
    "**Submitted Fields:**",
    ...(submittedPreview.length > 0 ? submittedPreview : ["_No answered fields stored_"]),
  ];
  return {
    content: truncateContent(lines.join("\n"), 1900),
    allowedMentions: { parse: [] },
  };
}

module.exports = buildRepostFallbackPayload;
