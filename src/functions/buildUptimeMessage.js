/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildUptimeMessage() {
  const nowMs = Date.now();
  const uptimeMs = Math.max(0, nowMs - botStartedAtMs);
  return [
    "⏱️ **Bot Uptime**",
    `Uptime: ${formatBotUptime(uptimeMs)}`,
    `Started: ${new Date(botStartedAtMs).toISOString()}`,
    `Now: ${new Date(nowMs).toISOString()}`,
  ].join("\n");
}

module.exports = buildUptimeMessage;
