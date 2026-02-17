function createDynamicMessageSystem(options = {}) {
  const toCodeBlock = typeof options.toCodeBlock === "function"
    ? options.toCodeBlock
    : (text) => String(text || "");

  function isSnowflake(value) {
    return typeof value === "string" && /^\d{17,20}$/.test(value.trim());
  }

  function uniqueSnowflakes(values) {
    const source = Array.isArray(values) ? values : [values];
    const out = [];
    const seen = new Set();
    for (const value of source) {
      const candidate = String(value || "").trim();
      if (!isSnowflake(candidate) || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      out.push(candidate);
    }
    return out;
  }

  function parseMentionUserId(value) {
    const match = /^<@!?(\d{17,20})>$/.exec(String(value || "").trim());
    return match ? match[1] : null;
  }

  function truncate(value, maxLength) {
    const text = String(value || "");
    const cap = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 200;
    if (text.length <= cap) {
      return text;
    }
    return `${text.slice(0, Math.max(0, cap - 16))}\n...[truncated]`;
  }

  function stableColorFromKey(value, fallback = 0x2b2d31) {
    const source = String(value || "").trim().toLowerCase();
    if (!source) {
      return fallback;
    }
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) & 0xffffff;
    }
    return hash === 0 ? fallback : hash;
  }

  function resolveApplicationStatusColor(status) {
    const normalizedStatus = String(status || "").trim().toLowerCase();
    if (normalizedStatus === "accepted") {
      return 0x57f287;
    }
    if (normalizedStatus === "denied") {
      return 0xed4245;
    }
    if (normalizedStatus === "pending" || normalizedStatus === "processing") {
      return 0xfee75c;
    }
    return 0x2b2d31;
  }

  function normalizeFields(fields) {
    if (!Array.isArray(fields)) {
      return [];
    }
    return fields
      .map((field) => {
        const name = truncate(field?.name, 256).trim();
        const value = truncate(field?.value, 1024).trim();
        if (!name || !value) {
          return null;
        }
        return {
          name,
          value,
          inline: Boolean(field?.inline),
        };
      })
      .filter(Boolean)
      .slice(0, 25);
  }

  function buildMessagePayload(options = {}) {
    const title = truncate(options.title, 256).trim() || "Message";
    const descriptionText = truncate(options.description, 3800).trim();
    const description =
      options.descriptionStyle === "code" && descriptionText
        ? toCodeBlock(descriptionText)
        : descriptionText;
    const embed = {
      title,
      color: Number.isInteger(options.color)
        ? options.color
        : stableColorFromKey(options.colorKey, 0x2b2d31),
    };

    const fields = normalizeFields(options.fields);
    if (fields.length > 0) {
      embed.fields = fields;
    }
    if (description) {
      embed.description = description;
    }
    const footerText = truncate(options.footerText, 2048).trim();
    if (footerText) {
      embed.footer = { text: footerText };
    }
    if (options.timestamp !== false) {
      embed.timestamp = new Date().toISOString();
    }

    const payload = {
      content: String(options.content || ""),
      embeds: [embed],
    };

    const mentionUsers = uniqueSnowflakes(options.mentionUserIds);
    const mentionRoles = uniqueSnowflakes(options.mentionRoleIds);
    if (mentionUsers.length > 0 || mentionRoles.length > 0) {
      payload.allowedMentions = {
        parse: [],
        users: mentionUsers,
        roles: mentionRoles,
      };
    }

    return payload;
  }

  function buildApplicationMessagePayload(options = {}) {
    const applicationId = String(options.applicationId || "").trim();
    const applicantMention = String(options.applicantMention || "").trim();
    const applicantRawValue = String(options.applicantRawValue || "").trim();
    const fields = [
      {
        name: "Track",
        value: String(options.trackLabel || options.trackKey || "Unknown Track"),
        inline: true,
      },
    ];
    if (applicationId) {
      fields.push({
        name: "Application ID",
        value: `\`${applicationId}\``,
        inline: true,
      });
    }
    if (applicantMention || applicantRawValue) {
      fields.push({
        name: "Discord User",
        value: applicantMention || truncate(applicantRawValue, 256),
        inline: true,
      });
    }

    const mentionUserId = parseMentionUserId(applicantMention);

    return buildMessagePayload({
      title: "📥 New Application",
      color: resolveApplicationStatusColor(options.status || "pending"),
      fields,
      description: options.detailsText,
      descriptionStyle: "code",
      content: applicantMention || "",
      mentionUserIds: mentionUserId ? [mentionUserId] : [],
      timestamp: false,
    });
  }

  function buildFeedbackMessagePayload(options = {}) {
    const kind = String(options.kind || "").toLowerCase();
    const isBug = kind.includes("bug");
    return buildMessagePayload({
      title: isBug ? "🐞 Bug Report" : "💡 Suggestion",
      color: isBug ? 0xdb4437 : 0x0f9d58,
      fields: [
        {
          name: "From",
          value: `<@${options.reporterUserId}>`,
          inline: true,
        },
        {
          name: "Source Channel",
          value: `<#${options.sourceChannelId}>`,
          inline: true,
        },
      ],
      description: options.message,
      descriptionStyle: "plain",
      footerText: `${options.commandLabel || "Feedback"} via slash command`,
      timestamp: true,
    });
  }

  return {
    truncate,
    stableColorFromKey,
    resolveApplicationStatusColor,
    buildMessagePayload,
    buildApplicationMessagePayload,
    buildFeedbackMessagePayload,
  };
}

module.exports = {
  createDynamicMessageSystem,
};
