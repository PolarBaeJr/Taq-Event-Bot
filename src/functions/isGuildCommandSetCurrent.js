/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function isGuildCommandSetCurrent(rest, guildId, commands) {
  const existing = await rest.get(
    Routes.applicationGuildCommands(config.clientId, guildId)
  );

  const normalizeCommand = (command) => ({
    name: command.name || "",
    description: command.description || "",
    type: command.type || 1,
    options: Array.isArray(command.options) ? command.options : [],
    default_member_permissions: command.default_member_permissions || null,
    dm_permission:
      typeof command.dm_permission === "boolean" ? command.dm_permission : null,
    nsfw: typeof command.nsfw === "boolean" ? command.nsfw : false,
  });

  const normalizeSet = (items) =>
    items
      .map(normalizeCommand)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => JSON.stringify(item))
      .join("\n");

  return normalizeSet(existing) === normalizeSet(commands);
}

module.exports = isGuildCommandSetCurrent;
