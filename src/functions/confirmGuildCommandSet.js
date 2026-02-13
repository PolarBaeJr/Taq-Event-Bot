/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function confirmGuildCommandSet(rest, guildId, commands) {
  const existing = await rest.get(
    Routes.applicationGuildCommands(config.clientId, guildId)
  );
  const existingNames = new Set(existing.map((cmd) => cmd.name));
  const desiredNames = new Set(commands.map((cmd) => cmd.name));

  if (existingNames.size !== desiredNames.size) {
    throw new Error(
      `Guild ${guildId} command set mismatch after sync. Expected ${desiredNames.size}, got ${existingNames.size}.`
    );
  }
  for (const name of desiredNames) {
    if (!existingNames.has(name)) {
      throw new Error(`Guild ${guildId} missing expected command: ${name}`);
    }
  }
}

module.exports = confirmGuildCommandSet;
