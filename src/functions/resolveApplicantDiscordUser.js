/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function resolveApplicantDiscordUser(channelId, headers, row) {
  const rawValue = inferApplicantDiscordValue(headers, row);
  if (!rawValue) {
    return { rawValue: null, userId: null };
  }

  const directId = extractDiscordUserId(rawValue);
  if (directId) {
    return { rawValue, userId: directId };
  }

  const query = normalizeDiscordLookupQuery(rawValue);
  if (!query) {
    return { rawValue, userId: null };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("guild" in channel) || !channel.guild) {
      return { rawValue, userId: null };
    }

    const matches = await channel.guild.members.fetch({ query, limit: 10 });
    if (!matches || matches.size === 0) {
      return { rawValue, userId: null };
    }

    const needle = query.toLowerCase();
    const exact =
      matches.find((member) => member.user.username.toLowerCase() === needle) ||
      matches.find((member) => (member.user.globalName || "").toLowerCase() === needle) ||
      matches.find((member) => (member.displayName || "").toLowerCase() === needle);
    const chosen = exact || matches.first();
    return { rawValue, userId: chosen?.id || null };
  } catch {
    return { rawValue, userId: null };
  }
}

module.exports = resolveApplicantDiscordUser;
