/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function main() {
  await client.login(config.botToken);
  await auditBotPermissions();
  await registerSlashCommands();

  try {
    const activeChannelId = getAnyActiveChannelId();
    if (!activeChannelId) {
      console.log("No active application channels configured yet. Use /setchannel.");
    } else {
      const channel = await client.channels.fetch(activeChannelId);
      if (channel && "guild" in channel && channel.guild) {
        await ensureLogsChannel(channel.guild);
      }
    }
  } catch (err) {
    console.error("Failed ensuring logs channel on startup:", err.message);
  }

  console.log("Bot started. Polling for Google Form responses...");
  await pollOnce().catch((err) => {
    console.error("Initial poll failed:", err.message);
  });

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error("Poll failed:", err.message);
    }
  }, config.pollIntervalMs);
}

module.exports = main;
