/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function logControlCommand(action, interaction) {
  const entry = {
    action,
    at: new Date().toISOString(),
    userId: interaction.user.id,
    username: interaction.user.username,
    globalName: interaction.user.globalName || null,
    guildId: interaction.guildId || null,
    guildName: interaction.guild?.name || null,
    channelId: interaction.channelId || null,
  };

  const state = readState();
  const existing = Array.isArray(state.controlActions) ? state.controlActions : [];
  existing.push(entry);
  if (existing.length > 200) {
    existing.splice(0, existing.length - 200);
  }
  state.controlActions = existing;
  writeState(state);

  logger.info("control_action", "Bot control action executed.", {
    action,
    userId: entry.userId,
    username: entry.username,
    guildId: entry.guildId,
    guildName: entry.guildName,
    channelId: entry.channelId,
  });

  try {
    appendControlLogToFile(entry);
  } catch (err) {
    logger.error("control_log_file_write_failed", "Failed writing control log file.", {
      action,
      error: err.message,
      controlLogFile: config.controlLogFile,
    });
  }

  if (action === "stop" || action === "restart") {
    await sendOperationalAlert({
      event: `control_${action}`,
      severity: "warning",
      title: `Bot ${action.toUpperCase()} command`,
      message: `A bot ${action} command was executed.`,
      details: {
        user: `${entry.username} (${entry.userId})`,
        guild: entry.guildName || "DM",
        guildId: entry.guildId || "n/a",
        channelId: entry.channelId || "n/a",
      },
    });
    return;
  }

  if (!interaction.guild) {
    return;
  }

  try {
    const logsChannel = await ensureBotLogsChannel(interaction.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const details = [
      `🛑 **Bot ${action.toUpperCase()} Command Executed**`,
      `**By:** ${userDisplayName(interaction.user)} (<@${interaction.user.id}>)`,
      `**User ID:** ${interaction.user.id}`,
      `**Guild:** ${interaction.guild.name} (${interaction.guild.id})`,
      `**Channel:** <#${interaction.channelId}>`,
      `**Time:** ${entry.at}`,
    ].join("\n");

    await logsChannel.send({ content: details, allowedMentions: { parse: [] } });
  } catch (err) {
    logger.error("control_log_channel_write_failed", "Failed writing control log to Discord.", {
      action,
      error: err.message,
    });
  }
}

module.exports = logControlCommand;
