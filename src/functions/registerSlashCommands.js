/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function registerSlashCommands() {
  const commands = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(config.botToken);

  const guildId = await resolveGuildIdForCommands();
  if (guildId) {
    await registerSlashCommandsForGuild(rest, guildId, commands);
    const removed = await clearGlobalCommands(rest);
    await confirmGuildCommandSet(rest, guildId, commands);
    console.log(
      `Command scope confirmed for guild ${guildId}. Global commands removed: ${removed}.`
    );
    return;
  }

  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length > 0) {
    for (const id of guildIds) {
      await registerSlashCommandsForGuild(rest, id, commands);
      await confirmGuildCommandSet(rest, id, commands);
    }
    const removed = await clearGlobalCommands(rest);
    console.log(
      `Command scope confirmed for ${guildIds.length} guild(s). Global commands removed: ${removed}.`
    );
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log("Registered global slash commands (may take time to appear)");
}

module.exports = registerSlashCommands;
