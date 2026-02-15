function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripDecorators(value) {
  return String(value || "")
    .replace(/[`*_~]/g, "")
    .replace(/^<@!?\d+>$/g, "")
    .trim();
}

function getPrimaryEmbed(message) {
  if (!message || !Array.isArray(message.embeds) || message.embeds.length === 0) {
    return null;
  }
  return message.embeds[0];
}

function extractTrackLabelFromContent(content) {
  const match = /(?:^|\n)[^\n]*\*\*Track:\*\*\s*([^\n]+)/i.exec(String(content || ""));
  if (!match) {
    return "";
  }
  return normalizeComparableText(match[1].replace(/[`*_~]/g, ""));
}

function extractTrackLabelFromEmbed(embed) {
  if (!embed || !Array.isArray(embed.fields)) {
    return "";
  }
  const field = embed.fields.find((entry) =>
    normalizeComparableText(entry?.name) === "track"
  );
  if (!field) {
    return "";
  }
  return normalizeComparableText(stripDecorators(field.value));
}

function extractTrackLabelFromMessage(message) {
  const fromContent = extractTrackLabelFromContent(message?.content);
  if (fromContent) {
    return fromContent;
  }
  return extractTrackLabelFromEmbed(getPrimaryEmbed(message));
}

function extractApplicationIdFromContent(content) {
  const match = /application\s*id[^a-z0-9]*:\s*[*_~`]*\s*`?([A-Za-z0-9]+-\d+)`?/i.exec(
    String(content || "")
  );
  return match ? String(match[1]).trim() : null;
}

function extractApplicationIdFromEmbed(embed) {
  if (!embed || !Array.isArray(embed.fields)) {
    return null;
  }
  const field = embed.fields.find((entry) =>
    normalizeComparableText(entry?.name) === "application id"
  );
  if (!field) {
    return null;
  }
  const raw = stripDecorators(field.value);
  return raw || null;
}

function extractApplicationIdFromMessage(message) {
  const fromContent = extractApplicationIdFromContent(message?.content);
  if (fromContent) {
    return fromContent;
  }

  const embed = getPrimaryEmbed(message);
  const fromEmbedField = extractApplicationIdFromEmbed(embed);
  if (fromEmbedField) {
    return fromEmbedField;
  }

  const fromEmbedDescription = extractApplicationIdFromContent(embed?.description || "");
  if (fromEmbedDescription) {
    return fromEmbedDescription;
  }

  return null;
}

function parseSubmittedFieldsFromPostContent(content) {
  const blockMatch = /```(?:\w+)?\n?([\s\S]*?)```/.exec(String(content || ""));
  if (!blockMatch) {
    return [];
  }

  const body = String(blockMatch[1] || "").replace(/\r\n/g, "\n").trim();
  if (!body) {
    return [];
  }

  const chunks = body.split(/\n\s*\n/);
  const submittedFields = [];
  for (const chunk of chunks) {
    const line = String(chunk || "").trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }

    submittedFields.push(`**${key}:** ${value}`);
  }

  return submittedFields;
}

function parseSubmittedFieldsFromEmbed(embed) {
  if (!embed || typeof embed !== "object") {
    return [];
  }

  const fromDescription = parseSubmittedFieldsFromPostContent(embed.description || "");
  if (fromDescription.length > 0) {
    return fromDescription;
  }

  if (!Array.isArray(embed.fields)) {
    return [];
  }

  const metadataNames = new Set(["track", "application id", "discord user"]);
  const submittedFields = [];
  for (const field of embed.fields) {
    const name = stripDecorators(field?.name);
    const value = stripDecorators(field?.value);
    if (!name || !value) {
      continue;
    }
    if (metadataNames.has(normalizeComparableText(name))) {
      continue;
    }
    submittedFields.push(`**${name}:** ${value}`);
  }
  return submittedFields;
}

function parseSubmittedFieldsFromMessage(message) {
  const fromContent = parseSubmittedFieldsFromPostContent(message?.content || "");
  if (fromContent.length > 0) {
    return fromContent;
  }
  return parseSubmittedFieldsFromEmbed(getPrimaryEmbed(message));
}

function isApplicationPostMessage(message) {
  const content = normalizeComparableText(message?.content || "");
  if (content.includes("new application")) {
    return true;
  }

  const embed = getPrimaryEmbed(message);
  const title = normalizeComparableText(embed?.title || "");
  if (title.includes("new application")) {
    return true;
  }

  return false;
}

module.exports = {
  normalizeComparableText,
  stripDecorators,
  getPrimaryEmbed,
  extractTrackLabelFromContent,
  extractTrackLabelFromEmbed,
  extractTrackLabelFromMessage,
  extractApplicationIdFromContent,
  extractApplicationIdFromEmbed,
  extractApplicationIdFromMessage,
  parseSubmittedFieldsFromPostContent,
  parseSubmittedFieldsFromEmbed,
  parseSubmittedFieldsFromMessage,
  isApplicationPostMessage,
};
