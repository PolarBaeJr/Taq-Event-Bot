/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function addReaction(channelId, messageId, emoji) {
  const encodedEmoji = encodeURIComponent(emoji);
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`;
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${config.botToken}`,
      },
    });

    if (res.ok) {
      return;
    }

    const body = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterMs = getRetryAfterMsFromBody(body);
      const waitMs = Math.max(300, retryAfterMs ?? 1000) + 100;
      logger.warn("discord_reaction_rate_limited", "Reaction add rate limited.", {
        channelId,
        messageId,
        emoji,
        waitMs,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
      });
      await sleep(waitMs);
      continue;
    }

    logger.error("discord_reaction_failed", "Failed adding reaction.", {
      channelId,
      messageId,
      emoji,
      status: res.status,
      attempt,
      maxAttempts,
      body,
    });
    throw new Error(`Failed adding reaction ${emoji} (${res.status}): ${body}`);
  }
}

module.exports = addReaction;
