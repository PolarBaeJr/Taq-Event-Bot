/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function clearGlobalCommands(rest) {
  const existing = await rest.get(Routes.applicationCommands(config.clientId));
  if (Array.isArray(existing) && existing.length > 0) {
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log("Cleared global slash commands to avoid duplicate command entries.");
    return existing.length;
  }
  return 0;
}

module.exports = clearGlobalCommands;
