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

    const embed = {
      title: `⚙️ ${String(title || "Configuration Update").trim() || "Configuration Update"}`,
      color: LOG_EMBED_COLOR,
      description: joinEmbedDescription(detailLines, 3000),
      fields: [
        {
          name: "By",
          value: trimEmbedValue(
            `${userDisplayName(interaction.user)} (<@${interaction.user.id}>)`
          ),
          inline: false,
        },
        {
          name: "Guild",
          value: trimEmbedValue(`${interaction.guild.name} (${interaction.guild.id})`),
          inline: false,
        },
        {
          name: "Source Channel",
          value: trimEmbedValue(`<#${interaction.channelId}>`),
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    await logsChannel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error(`Failed posting configuration log (${title}):`, err.message);
  }
}

module.exports = postConfigurationLog;
