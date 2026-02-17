/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function createThread(channelId, messageId, name) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/threads`;
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: sanitizeThreadName(name),
        auto_archive_duration: config.threadArchiveMinutes,
      }),
    });

    if (res.ok) {
      return res.json();
    }

    const body = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterMs = getRetryAfterMsFromBody(body);
      const waitMs = Math.max(300, retryAfterMs ?? 1000) + 100;
      logger.warn("discord_thread_rate_limited", "Thread creation rate limited.", {
        channelId,
        messageId,
        waitMs,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
      });
      await sleep(waitMs);
      continue;
    }

    logger.error("discord_thread_create_failed", "Thread creation failed.", {
      channelId,
      messageId,
      status: res.status,
      attempt,
      maxAttempts,
      body,
    });
    throw new Error(`Thread creation failed (${res.status}): ${body}`);
  }
}

module.exports = createThread;
