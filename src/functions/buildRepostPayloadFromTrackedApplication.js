/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function buildRepostPayloadFromTrackedApplication(application, normalizedTrackKey) {
  const fallback = buildRepostFallbackPayload(application, normalizedTrackKey);
  if (!isSnowflake(application?.channelId) || !isSnowflake(application?.messageId)) {
    return fallback;
  }

  try {
    const sourceChannel = await client.channels.fetch(application.channelId);
    if (
      !sourceChannel ||
      !sourceChannel.isTextBased() ||
      typeof sourceChannel.messages?.fetch !== "function"
    ) {
      return fallback;
    }
    const sourceMessage = await sourceChannel.messages.fetch(application.messageId);
    const embeds = Array.isArray(sourceMessage?.embeds)
      ? sourceMessage.embeds.map((embed) => embed.toJSON()).slice(0, 10)
      : [];
    const content = typeof sourceMessage?.content === "string" ? sourceMessage.content : "";
    if (!content && embeds.length === 0) {
      return fallback;
    }
    return {
      content: truncateContent(content, 1900),
      embeds,
      allowedMentions: { parse: [] },
    };
  } catch {
    return fallback;
  }
}

module.exports = buildRepostPayloadFromTrackedApplication;
