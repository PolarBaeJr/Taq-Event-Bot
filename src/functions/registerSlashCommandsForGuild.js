/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function registerSlashCommandsForGuild(rest, guildId, commands) {
  if (await isGuildCommandSetCurrent(rest, guildId, commands)) {
    console.log(`Slash commands already up to date in guild ${guildId}`);
    return;
  }

  await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), {
    body: commands,
  });
  console.log(`Registered slash commands in guild ${guildId}`);
}

module.exports = registerSlashCommandsForGuild;
