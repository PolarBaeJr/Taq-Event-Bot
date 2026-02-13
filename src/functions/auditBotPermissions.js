/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function auditBotPermissions() {
  const channelMap = getActiveChannelMap();
  const configuredEntries = Object.entries(channelMap).filter(([, channelId]) =>
    isSnowflake(channelId)
  );
  if (configuredEntries.length === 0) {
    console.log("Permission audit skipped: no active channel set. Use /setchannel.");
    return;
  }

  const issues = [];
  for (const [trackKey, channelId] of configuredEntries) {
    const trackLabel = getTrackLabel(trackKey);
    let channel = null;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      issues.push(`${trackLabel}: failed to fetch channel ${channelId} (${err.message})`);
      continue;
    }

    if (!channel || !("guild" in channel) || !channel.guild) {
      issues.push(`${trackLabel}: channel ${channelId} is not a guild text channel.`);
      continue;
    }

    const guild = channel.guild;
    const me = await guild.members.fetchMe();
    const missingGuildPerms = REQUIRED_GUILD_PERMISSIONS.filter(
      ([, perm]) => !me.permissions.has(perm)
    ).map(([name]) => name);
    const channelPerms = channel.permissionsFor(me);
    const missingChannelPerms = REQUIRED_CHANNEL_PERMISSIONS.filter(
      ([, perm]) => !channelPerms || !channelPerms.has(perm)
    ).map(([name]) => name);

    if (missingGuildPerms.length > 0) {
      issues.push(`${trackLabel}: missing guild perms: ${missingGuildPerms.join(", ")}`);
    }
    if (missingChannelPerms.length > 0) {
      issues.push(
        `${trackLabel}: missing channel perms in <#${channelId}>: ${missingChannelPerms.join(", ")}`
      );
    }
  }

  if (issues.length === 0) {
    console.log(`Permission audit passed for ${configuredEntries.length} channel(s).`);
    return;
  }

  for (const issue of issues) {
    console.error(issue);
  }
  throw new Error("Permission audit failed. Grant missing permissions and check overrides.");
}

module.exports = auditBotPermissions;
