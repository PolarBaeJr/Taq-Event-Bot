/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function maybeSendDailyDigest() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (!settings.dailyDigest.enabled) {
    return;
  }

  const now = new Date();
  const currentUtcHour = now.getUTCHours();
  if (currentUtcHour < settings.dailyDigest.hourUtc) {
    return;
  }

  const targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const targetDateKey = formatUtcDateKey(targetDate);
  if (settings.dailyDigest.lastDigestDate === targetDateKey) {
    return;
  }

  const trackKeys = getApplicationTrackKeys();
  const createdByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));
  const acceptedByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));
  const deniedByTrack = Object.fromEntries(trackKeys.map((trackKey) => [trackKey, 0]));

  for (const application of Object.values(state.applications || {})) {
    const trackKey = normalizeTrackKey(application?.trackKey) || DEFAULT_TRACK_KEY;
    const createdKey = formatUtcDateKey(new Date(application?.createdAt || 0));
    const decidedKey = formatUtcDateKey(new Date(application?.decidedAt || 0));

    if (createdKey === targetDateKey && Object.prototype.hasOwnProperty.call(createdByTrack, trackKey)) {
      createdByTrack[trackKey] += 1;
    }

    if (application?.status === STATUS_ACCEPTED && decidedKey === targetDateKey) {
      if (Object.prototype.hasOwnProperty.call(acceptedByTrack, trackKey)) {
        acceptedByTrack[trackKey] += 1;
      }
    }
    if (application?.status === STATUS_DENIED && decidedKey === targetDateKey) {
      if (Object.prototype.hasOwnProperty.call(deniedByTrack, trackKey)) {
        deniedByTrack[trackKey] += 1;
      }
    }
  }

  const staleThresholdMs = settings.reminders.thresholdHours * 60 * 60 * 1000;
  const stalePending = Object.values(state.applications || {}).filter((application) => {
    if (!application || application.status !== STATUS_PENDING) {
      return false;
    }
    const createdAtMs = parseIsoTimeMs(application.createdAt);
    return Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= staleThresholdMs;
  });

  const lines = [
    `🗓️ **Daily Application Summary (${targetDateKey} UTC)**`,
  ];
  for (const trackKey of trackKeys) {
    lines.push(
      `${getTrackLabel(trackKey)}: new=${createdByTrack[trackKey]} | accepted=${acceptedByTrack[trackKey]} | denied=${deniedByTrack[trackKey]}`
    );
  }
  lines.push(`Stale Pending (>=${settings.reminders.thresholdHours}h): ${stalePending.length}`);

  const digestChannelId = getActiveLogsChannelId() || getAnyActiveChannelId();
  if (!digestChannelId) {
    return;
  }

  await sendChannelMessage(digestChannelId, lines.join("\n"), { parse: [] });
  settings.dailyDigest.lastDigestDate = targetDateKey;
  writeState(state);
}

module.exports = maybeSendDailyDigest;
