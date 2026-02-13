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

  console.log(
    `[CONTROL] ${action} by ${entry.username} (${entry.userId}) in ${entry.guildName || "DM"} (${entry.guildId || "n/a"})`
  );

  try {
    appendControlLogToFile(entry);
  } catch (err) {
    console.error(`Failed writing ${action} control log file:`, err.message);
  }

  if (action === "stop" || action === "restart") {
    return;
  }

  if (!interaction.guild) {
    return;
  }

  try {
    const logsChannel = await ensureLogsChannel(interaction.guild);
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
    console.error(`Failed writing ${action} control log:`, err.message);
  }
}

module.exports = logControlCommand;
