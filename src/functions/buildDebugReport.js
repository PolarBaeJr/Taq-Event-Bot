/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function buildDebugReport(interaction) {
  const lines = [];
  const state = readState();
  const activeChannelMap = getActiveChannelMap();
  const activeApprovedRoleMap = getActiveApprovedRoleMap();

  lines.push(`Bot User ID: ${client.user?.id || "unknown"}`);
  lines.push(`Configured Client ID: ${config.clientId || "missing"}`);
  lines.push(
    `Client ID matches bot user ID: ${client.user?.id === config.clientId ? "yes" : "no"}`
  );
  lines.push(`Interaction Guild ID: ${interaction.guildId || "none"}`);
  for (const trackKey of APPLICATION_TRACK_KEYS) {
    const trackLabel = getTrackLabel(trackKey);
    const approvedRoles = Array.isArray(activeApprovedRoleMap[trackKey])
      ? activeApprovedRoleMap[trackKey]
      : [];
    lines.push(
      `Track ${trackLabel}: channel=${activeChannelMap[trackKey] || "none"}, approvedRoles=${
        approvedRoles.length > 0 ? approvedRoles.join(",") : "none"
      }`
    );
  }
  lines.push(
    `Denied DM Template Configured: ${
      typeof state.settings?.denyDmTemplate === "string" &&
      state.settings.denyDmTemplate.trim()
        ? "state"
        : typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()
          ? "env"
          : "default"
    }`
  );
  lines.push(`Accept Announcement Channel ID: ${getActiveAcceptAnnounceChannelId() || "none"}`);
  lines.push(
    `Accept Announcement Template Configured: ${
      typeof state.settings?.acceptAnnounceTemplate === "string" &&
      state.settings.acceptAnnounceTemplate.trim()
        ? "state"
        : typeof config.acceptAnnounceTemplate === "string" &&
            config.acceptAnnounceTemplate.trim()
          ? "env"
          : "default"
    }`
  );
  lines.push(`Queued Post Jobs: ${Array.isArray(state.postJobs) ? state.postJobs.length : 0}`);

  const rest = new REST({ version: "10" }).setToken(config.botToken);
  try {
    const globals = await rest.get(Routes.applicationCommands(config.clientId));
    lines.push(`Global Commands: ${Array.isArray(globals) ? globals.length : 0}`);
  } catch (err) {
    lines.push(`Global Commands: error (${err.message})`);
  }

  if (interaction.guildId) {
    try {
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(config.clientId, interaction.guildId)
      );
      const names = Array.isArray(guildCommands)
        ? guildCommands.map((c) => c.name).sort().join(", ")
        : "";
      lines.push(
        `Guild Commands (${interaction.guildId}): ${
          Array.isArray(guildCommands) ? guildCommands.length : 0
        }`
      );
      if (names) {
        lines.push(`Guild Command Names: ${names}`);
      }
    } catch (err) {
      lines.push(`Guild Commands: error (${err.message})`);
    }
  }

  for (const trackKey of APPLICATION_TRACK_KEYS) {
    const channelId = activeChannelMap[trackKey];
    if (!channelId) {
      continue;
    }
    const trackLabel = getTrackLabel(trackKey);
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && "guild" in channel && channel.guild) {
        const me = await channel.guild.members.fetchMe();
        const channelPerms = channel.permissionsFor(me);
        const missing = REQUIRED_CHANNEL_PERMISSIONS.filter(
          ([, perm]) => !channelPerms || !channelPerms.has(perm)
        ).map(([name]) => name);
        lines.push(
          `${trackLabel} Missing Channel Perms: ${
            missing.length > 0 ? missing.join(", ") : "none"
          }`
        );
      } else {
        lines.push(`${trackLabel} Channel Check: not a guild text channel`);
      }
    } catch (err) {
      lines.push(`${trackLabel} Channel Check: error (${err.message})`);
    }
  }

  return lines.join("\n");
}

module.exports = buildDebugReport;
