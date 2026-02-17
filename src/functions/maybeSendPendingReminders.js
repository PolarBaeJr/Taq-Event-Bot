/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function maybeSendPendingReminders() {
  const state = readState();
  const settings = ensureExtendedSettingsContainers(state);
  if (!settings.reminders.enabled) {
    return;
  }

  const thresholdMs = settings.reminders.thresholdHours * 60 * 60 * 1000;
  const repeatMs = settings.reminders.repeatHours * 60 * 60 * 1000;
  const nowMs = Date.now();
  let stateChanged = false;

  for (const application of Object.values(state.applications || {})) {
    if (!application || application.status !== STATUS_PENDING) {
      continue;
    }

    const createdAtMs = parseIsoTimeMs(application.createdAt);
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }
    const ageMs = nowMs - createdAtMs;
    if (ageMs < thresholdMs) {
      continue;
    }

    const lastReminderMs = parseIsoTimeMs(application.lastReminderAt);
    if (Number.isFinite(lastReminderMs) && nowMs - lastReminderMs < repeatMs) {
      continue;
    }

    const reviewerConfig = getReviewerMentionsForTrackFromState(state, application.trackKey);
    const targetChannelId = application.threadId || application.channelId;
    if (!targetChannelId) {
      continue;
    }

    const mentionSummary = summarizeReviewerMentions(reviewerConfig);
    const content = [
      "⏰ **Pending Application Reminder**",
      `Track: ${getTrackLabel(application.trackKey)}`,
      `Application ID: \`${getApplicationDisplayId(application)}\``,
      `Age: ${formatDurationHours(ageMs)}`,
      `Reviewers: ${mentionSummary}`,
    ].join("\n");
    const allowedMentions = getReviewerAllowedMentions(reviewerConfig);

    try {
      await sendChannelMessage(targetChannelId, content, allowedMentions);
      application.lastReminderAt = new Date(nowMs).toISOString();
      application.reminderCount = clampInteger(application.reminderCount, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        fallback: 0,
      }) + 1;
      stateChanged = true;
    } catch (err) {
      console.error(
        `Failed sending reminder for application ${application.messageId || "unknown"}:`,
        err.message
      );
    }
  }

  if (stateChanged) {
    writeState(state);
  }
}

module.exports = maybeSendPendingReminders;
