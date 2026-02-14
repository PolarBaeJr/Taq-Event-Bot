/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function resolveMessageIdForCommand(interaction) {
  function resolveUniqueMatch(matches) {
    if (matches.length === 1) {
      return matches[0].messageId;
    }

    if (interaction.channel) {
      const threadScoped = matches.filter(
        (match) => match.application?.threadId === interaction.channel.id
      );
      if (threadScoped.length === 1) {
        return threadScoped[0].messageId;
      }

      const channelScoped = matches.filter(
        (match) => match.application?.channelId === interaction.channel.id
      );
      if (channelScoped.length === 1) {
        return channelScoped[0].messageId;
      }
    }

    return null;
  }

  function resolveByApplicationId(state, rawApplicationId) {
    const needle = normalizeApplicationIdForLookup(rawApplicationId);
    if (!needle) {
      return null;
    }
    const matches = [];
    for (const [messageId, application] of Object.entries(state.applications || {})) {
      const candidate = normalizeApplicationIdForLookup(
        getApplicationDisplayId(application, messageId)
      );
      if (candidate === needle) {
        matches.push({ messageId, application });
      }
    }
    return resolveUniqueMatch(matches);
  }

  function resolveByJobId(state, rawJobId) {
    const needle = normalizeJobIdForLookup(rawJobId);
    if (!needle) {
      return null;
    }
    const matches = [];
    for (const [messageId, application] of Object.entries(state.applications || {})) {
      if (normalizeJobIdForLookup(application?.jobId) === needle) {
        matches.push({ messageId, application });
      }
    }
    return resolveUniqueMatch(matches);
  }

  const explicitMessageId = interaction.options.getString("message_id");
  if (explicitMessageId) {
    const trimmedMessageId = explicitMessageId.trim();
    if (isSnowflake(trimmedMessageId)) {
      return trimmedMessageId;
    }

    const state = readState();
    const compatibilityMatch =
      resolveByApplicationId(state, trimmedMessageId) ||
      resolveByJobId(state, trimmedMessageId);
    return compatibilityMatch;
  }

  const explicitApplicationId = interaction.options.getString("application_id");
  if (explicitApplicationId) {
    const state = readState();
    return resolveByApplicationId(state, explicitApplicationId);
  }

  const explicitJobId = interaction.options.getString("job_id");
  if (explicitJobId) {
    const state = readState();
    return resolveByJobId(state, explicitJobId);
  }

  if (interaction.channel && interaction.channel.type === ChannelType.PublicThread) {
    const state = readState();
    return state.threads[interaction.channel.id] || null;
  }

  return null;
}

module.exports = resolveMessageIdForCommand;
