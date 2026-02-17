/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildDashboardMessage() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  const nowMs = Date.now();
  const trackKeys = getApplicationTrackKeys();
  const header = [
    "📊 **Application Dashboard**",
    `Generated: ${new Date().toISOString()}`,
  ];

  const lines = [];
  for (const trackKey of trackKeys) {
    const trackLabel = getTrackLabel(trackKey);
    const apps = Object.values(state.applications || {}).filter(
      (application) => String(application?.trackKey || "").toLowerCase() === trackKey
    );
    const pending = apps.filter((application) => application.status === STATUS_PENDING);
    const accepted = apps.filter((application) => application.status === STATUS_ACCEPTED);
    const denied = apps.filter((application) => application.status === STATUS_DENIED);

    let oldestPendingAge = "n/a";
    if (pending.length > 0) {
      const oldestPendingMs = Math.min(
        ...pending
          .map((application) => parseIsoTimeMs(application.createdAt))
          .filter((value) => Number.isFinite(value))
      );
      if (Number.isFinite(oldestPendingMs)) {
        oldestPendingAge = formatDurationHours(nowMs - oldestPendingMs);
      }
    }

    const voteRule = settings.voteRules[trackKey] || DEFAULT_VOTE_RULE;
    lines.push(
      [
        `**${trackLabel}**`,
        `pending=${pending.length}`,
        `accepted=${accepted.length}`,
        `denied=${denied.length}`,
        `oldest_pending=${oldestPendingAge}`,
        `vote_rule=${formatVoteRule(voteRule)}`,
      ].join(" | ")
    );
  }

  if (lines.length === 0) {
    lines.push("No tracks configured.");
  }

  return [...header, ...lines].join("\n");
}

module.exports = buildDashboardMessage;
