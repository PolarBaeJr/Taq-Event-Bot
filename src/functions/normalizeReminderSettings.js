/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function normalizeReminderSettings(rawReminder) {
  const source = rawReminder && typeof rawReminder === "object" ? rawReminder : {};
  return {
    enabled: source.enabled !== false,
    thresholdHours: clampNumber(source.thresholdHours, {
      min: 0.25,
      max: 720,
      fallback: DEFAULT_REMINDER_SETTINGS.thresholdHours,
    }),
    repeatHours: clampNumber(source.repeatHours, {
      min: 0.25,
      max: 720,
      fallback: DEFAULT_REMINDER_SETTINGS.repeatHours,
    }),
  };
}

module.exports = normalizeReminderSettings;
