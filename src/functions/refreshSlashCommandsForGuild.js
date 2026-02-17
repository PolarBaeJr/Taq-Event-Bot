/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function refreshSlashCommandsForGuild(guildId) {
  if (!isSnowflake(guildId)) {
    return;
  }

  const commands = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(config.botToken);
  await registerSlashCommandsForGuild(rest, guildId, commands);
}

module.exports = refreshSlashCommandsForGuild;
