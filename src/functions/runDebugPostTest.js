/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function runDebugPostTest(interaction) {
  const requestedTrack = normalizeTrackKey(interaction.options.getString("track"));
  const currentChatIsGuildText =
    interaction.inGuild() && interaction.channel?.type === ChannelType.GuildText;
  const mappedTrackFromChat = getTrackKeyForChannelId(interaction.channelId || "");

  let selectedTrack = mappedTrackFromChat || requestedTrack || DEFAULT_TRACK_KEY;
  let targetChannelId = null;
  let channelSourceLabel = "";

  if (currentChatIsGuildText) {
    targetChannelId = interaction.channelId;
    channelSourceLabel = "current_chat";
  } else {
    targetChannelId = getActiveChannelId(selectedTrack);
    channelSourceLabel = "configured_track_channel";
  }

  if (!targetChannelId) {
    const trackLabel = getTrackLabel(selectedTrack);
    throw new Error(
      `No active channel configured for ${trackLabel}. Run /setchannel first.`
    );
  }
  const trackLabel = getTrackLabel(selectedTrack);

  const triggeredAt = new Date().toISOString();
  const content = [
    "🧪 **Debug Application Post Test**",
    "This is a live test post from `/debug mode:post_test`.",
    `**Triggered By:** <@${interaction.user.id}>`,
    `**Triggered At:** ${triggeredAt}`,
    `**Target Channel:** <#${targetChannelId}>`,
    `**Channel Source:** ${channelSourceLabel === "current_chat" ? "Current Chat" : "Configured Track Channel"}`,
    "",
    `**Track:** ${trackLabel}`,
    "**Example Fields:**",
    "**Name:** Debug Applicant",
    "**Discord Name:** debug-user",
    "**Reason:** Validate direct bot post flow end-to-end",
  ].join("\n");

  const msg = await sendChannelMessage(targetChannelId, content);
  const postedChannelId = msg.channelId || targetChannelId;

  const warnings = [];

  try {
    await addReaction(postedChannelId, msg.id, ACCEPT_EMOJI);
    await addReaction(postedChannelId, msg.id, DENY_EMOJI);
  } catch (err) {
    warnings.push(`Reaction setup failed: ${err.message}`);
  }

  let threadId = null;
  try {
    const thread = await createThread(postedChannelId, msg.id, "Debug Application Test");
    threadId = thread.id || null;
    if (threadId) {
      const threadChannel = await client.channels.fetch(threadId);
      if (threadChannel && threadChannel.isTextBased()) {
        await threadChannel.send({
          content:
            "This is a debug discussion thread test. No application state was changed.",
          allowedMentions: { parse: [] },
        });
      }
    }
  } catch (err) {
    warnings.push(`Thread creation failed: ${err.message}`);
  }

  let guildId = interaction.guildId || null;
  if (!guildId) {
    const channel = await client.channels.fetch(postedChannelId);
    if (channel && "guildId" in channel && channel.guildId) {
      guildId = channel.guildId;
    }
  }

  return {
    trackKey: selectedTrack,
    trackLabel,
    channelId: postedChannelId,
    messageId: msg.id,
    threadId,
    messageUrl: guildId
      ? makeMessageUrl(guildId, postedChannelId, msg.id)
      : null,
    threadUrl: guildId && threadId ? makeMessageUrl(guildId, threadId, threadId) : null,
    warnings,
  };
}

module.exports = runDebugPostTest;
