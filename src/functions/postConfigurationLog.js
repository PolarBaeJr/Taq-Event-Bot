/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function postConfigurationLog(interaction, title, detailLines = []) {
  if (!interaction?.guild) {
    return;
  }

  try {
    const logsChannel = await ensureBotLogsChannel(interaction.guild);
    if (!logsChannel || !logsChannel.isTextBased()) {
      return;
    }

    const lines = [
      `⚙️ **${title}**`,
      `**By:** ${userDisplayName(interaction.user)} (<@${interaction.user.id}>)`,
      `**Guild:** ${interaction.guild.name} (${interaction.guild.id})`,
      `**Source Channel:** <#${interaction.channelId}>`,
      `**Time:** ${new Date().toISOString()}`,
      ...detailLines,
    ];

    await logsChannel.send({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error(`Failed posting configuration log (${title}):`, err.message);
  }
}

module.exports = postConfigurationLog;
