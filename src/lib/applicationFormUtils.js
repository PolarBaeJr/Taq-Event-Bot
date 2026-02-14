function createApplicationFormUtils(options = {}) {
  const client = options.client;
  const getTrackLabel = typeof options.getTrackLabel === "function"
    ? options.getTrackLabel
    : (trackKey) => String(trackKey || "");
  const toCodeBlock = typeof options.toCodeBlock === "function"
    ? options.toCodeBlock
    : (text) => String(text || "");
  const splitMessageByLength = typeof options.splitMessageByLength === "function"
    ? options.splitMessageByLength
    : (text) => [String(text || "")];
  const getApplicationTracks = typeof options.getApplicationTracks === "function"
    ? options.getApplicationTracks
    : () => [];
  const normalizeTrackKeys = typeof options.normalizeTrackKeys === "function"
    ? options.normalizeTrackKeys
    : (values) => (Array.isArray(values) ? values : [values]).filter(Boolean);
  const defaultTrackKey = String(options.defaultTrackKey || "tester");
  const formatJobId = typeof options.formatJobId === "function"
    ? options.formatJobId
    : (sequence) => String(sequence || "");
  const jobTypePostApplication = String(
    options.jobTypePostApplication || "post_application"
  );
  const normalizeCell = typeof options.normalizeCell === "function"
    ? options.normalizeCell
    : (value) => String(value ?? "");

  function sanitizeThreadName(name) {
    return (
      name.replace(/[^\p{L}\p{N}\s\-_]/gu, "").trim().slice(0, 90) ||
      "Application Discussion"
    );
  }

  function isAnsweredValue(value) {
    if (value === undefined || value === null) {
      return false;
    }
    return String(value).trim().length > 0;
  }

  function extractAnsweredFields(headers, row) {
    const headerList = Array.isArray(headers) ? headers : [];
    const rowList = Array.isArray(row) ? row : [];
    const count = Math.max(headerList.length, rowList.length);
    const fields = [];

    for (let i = 0; i < count; i += 1) {
      const rawValue = rowList[i];
      if (!isAnsweredValue(rawValue)) {
        continue;
      }

      const key = String(headerList[i] || `Field ${i + 1}`).trim() || `Field ${i + 1}`;
      const value = String(rawValue).trim();
      fields.push({ key, value });
    }

    return fields;
  }

  function makeApplicationContent(headers, row) {
    const answered = extractAnsweredFields(headers, row);
    if (answered.length === 0) {
      return "No answered questions.";
    }
    return answered.map(({ key, value }) => `${key}: ${value}`).join("\n\n");
  }

  function inferApplicantDiscordValue(headers, row) {
    let fallback = null;
    for (let i = 0; i < headers.length; i += 1) {
      const value = String(row[i] || "").trim();
      if (!value) {
        continue;
      }
      const header = String(headers[i] || "").toLowerCase();
      const isDiscordId = header.includes("discord") && header.includes("id");
      if (isDiscordId) {
        return value;
      }
      const isDiscordField = header.includes("discord");
      if (isDiscordField && !fallback) {
        fallback = value;
      }
      const isUserId =
        (header.includes("user") || header.includes("member")) &&
        header.includes("id");
      if (isUserId && !fallback) {
        fallback = value;
      }
    }
    return fallback;
  }

  function extractDiscordUserId(value) {
    if (!value) {
      return null;
    }
    const raw = String(value).trim();
    const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch) {
      return mentionMatch[1];
    }
    const snowflakeMatch = raw.match(/\b(\d{17,20})\b/);
    if (snowflakeMatch) {
      return snowflakeMatch[1];
    }
    return null;
  }

  function normalizeDiscordLookupQuery(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }
    return raw.replace(/^@/, "").trim() || null;
  }

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

  function makeApplicationPostContent({
    applicationId,
    trackKey,
    applicantMention,
    applicantRawValue,
    headers,
    row,
  }) {
    const lines = ["📥 **New Application**"];
    lines.push(`🧭 **Track:** ${getTrackLabel(trackKey)}`);
    if (applicationId) {
      lines.push(`🧩 **Application ID:** \`${applicationId}\``);
    }
    if (applicantMention) {
      lines.push(`👤 **Discord User:** ${applicantMention}`);
    } else if (applicantRawValue) {
      lines.push(`👤 **Discord User:** ${applicantRawValue}`);
    }
    lines.push("", toCodeBlock(makeApplicationContent(headers, row)));
    return lines.join("\n");
  }

  async function sendDebugDm(user, text) {
    const chunks = splitMessageByLength(text);
    for (const chunk of chunks) {
      await user.send(chunk);
    }
  }

  function inferApplicantName(headers, row) {
    const candidates = ["name", "full name", "applicant", "discord name"];
    for (let i = 0; i < headers.length; i += 1) {
      const h = String(headers[i] || "").toLowerCase();
      if (candidates.some((c) => h.includes(c)) && row[i]) {
        return String(row[i]);
      }
    }
    return "Applicant";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function detectTracksFromText(value) {
    const text = String(value || "").toLowerCase();
    if (!text.trim()) {
      return new Set();
    }

    const matched = new Set();
    for (const track of getApplicationTracks()) {
      for (const alias of track.aliases) {
        const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
        if (pattern.test(text)) {
          matched.add(track.key);
        }
      }
    }

    return matched;
  }

  function inferApplicationTracks(headers, row) {
    const explicitSelectionHeaderHints = [
      "what are you applying for",
    ];
    const primaryHeaderHints = [
      "applying for",
      "apply for",
      "application for",
      "track",
      "position",
      "role",
    ];
    const secondaryHeaderHints = [
      "department",
      "team",
      "type",
    ];

    const collectMatchesFromHeaders = (hints) => {
      const matches = new Set();
      for (let i = 0; i < headers.length; i += 1) {
        const header = String(headers[i] || "").toLowerCase();
        if (!hints.some((hint) => header.includes(hint))) {
          continue;
        }
        const value = String(row[i] || "").trim();
        if (!value) {
          continue;
        }
        const detected = detectTracksFromText(value);
        for (const key of detected) {
          matches.add(key);
        }
      }
      return matches;
    };

    const explicitSelectionMatches = collectMatchesFromHeaders(
      explicitSelectionHeaderHints
    );
    if (explicitSelectionMatches.size > 0) {
      return normalizeTrackKeys([...explicitSelectionMatches]);
    }

    const primaryMatches = collectMatchesFromHeaders(primaryHeaderHints);
    if (primaryMatches.size > 0) {
      return normalizeTrackKeys([...primaryMatches]);
    }

    const secondaryMatches = collectMatchesFromHeaders(secondaryHeaderHints);
    if (secondaryMatches.size > 0) {
      return normalizeTrackKeys([...secondaryMatches]);
    }

    const found = new Set();
    for (const cell of row) {
      const value = String(cell || "").trim();
      if (!value) {
        continue;
      }
      const detected = detectTracksFromText(value);
      for (const key of detected) {
        found.add(key);
      }
    }

    return normalizeTrackKeys([...found], {
      fallback: [defaultTrackKey],
    });
  }

  function inferApplicationTrack(headers, row) {
    return inferApplicationTracks(headers, row)[0] || defaultTrackKey;
  }

  function extractCellByHeaderHints(headers, row, hintSets) {
    for (let i = 0; i < headers.length; i += 1) {
      const header = String(headers[i] || "").toLowerCase();
      for (const hints of hintSets) {
        if (!Array.isArray(hints) || hints.length === 0) {
          continue;
        }
        if (hints.every((hint) => header.includes(String(hint).toLowerCase()))) {
          return String(row[i] || "").trim();
        }
      }
    }
    return "";
  }

  function buildResponseKey(headers, row) {
    const timestamp = extractCellByHeaderHints(headers, row, [["timestamp"]]);
    const discordId = extractCellByHeaderHints(headers, row, [
      ["discord", "id"],
      ["user", "id"],
      ["member", "id"],
    ]);
    const discordUserName = extractCellByHeaderHints(headers, row, [
      ["discord", "user", "name"],
      ["discord", "name"],
    ]);
    const inGameUserName = extractCellByHeaderHints(headers, row, [
      ["ingame", "user", "name"],
      ["ingame", "user", "name"],
      ["in game", "user", "name"],
      ["ingame", "name"],
    ]);
    const applyingFor = extractCellByHeaderHints(headers, row, [
      ["what are you applying for"],
      ["applying for"],
      ["application for"],
      ["track"],
      ["position"],
      ["role"],
    ]);
    if (timestamp) {
      return [
        `ts:${timestamp.toLowerCase()}`,
        `id:${discordId.toLowerCase()}`,
        `dname:${discordUserName.toLowerCase()}`,
        `ign:${inGameUserName.toLowerCase()}`,
        `apply:${applyingFor.toLowerCase()}`,
      ].join("|");
    }

    const normalizedCells = (Array.isArray(row) ? row : [])
      .map(normalizeCell)
      .map((value) => value.trim())
      .filter(Boolean);
    if (normalizedCells.length === 0) {
      return null;
    }
    return `row:${normalizedCells.join("\u241f").toLowerCase()}`;
  }

  function extractSubmittedFieldValue(submittedFields, hintSets) {
    if (!Array.isArray(submittedFields)) {
      return "";
    }
    for (const rawLine of submittedFields) {
      const line = String(rawLine || "");
      const match = /^\*\*(.+?):\*\*\s*(.*)$/.exec(line);
      if (!match) {
        continue;
      }
      const key = String(match[1] || "").toLowerCase();
      const value = String(match[2] || "").trim();
      if (!value) {
        continue;
      }
      for (const hints of hintSets) {
        if (!Array.isArray(hints) || hints.length === 0) {
          continue;
        }
        if (hints.every((hint) => key.includes(String(hint).toLowerCase()))) {
          return value;
        }
      }
    }
    return "";
  }

  function buildResponseKeyFromApplication(application) {
    if (!application || typeof application !== "object") {
      return null;
    }
    const explicit = String(application.responseKey || "").trim();
    if (explicit) {
      return explicit;
    }

    const timestamp = extractSubmittedFieldValue(application.submittedFields, [
      ["timestamp"],
    ]);
    const discordId = extractSubmittedFieldValue(application.submittedFields, [
      ["discord", "id"],
      ["user", "id"],
      ["member", "id"],
    ]);
    const discordUserName = extractSubmittedFieldValue(application.submittedFields, [
      ["discord", "user", "name"],
      ["discord", "name"],
    ]);
    const inGameUserName = extractSubmittedFieldValue(application.submittedFields, [
      ["ingame", "user", "name"],
      ["ingame", "user", "name"],
      ["in game", "user", "name"],
      ["ingame", "name"],
    ]);
    const applyingFor = extractSubmittedFieldValue(application.submittedFields, [
      ["what are you applying for"],
      ["applying for"],
      ["application for"],
      ["track"],
      ["position"],
      ["role"],
    ]);
    if (timestamp) {
      return [
        `ts:${timestamp.toLowerCase()}`,
        `id:${discordId.toLowerCase()}`,
        `dname:${discordUserName.toLowerCase()}`,
        `ign:${inGameUserName.toLowerCase()}`,
        `apply:${applyingFor.toLowerCase()}`,
      ].join("|");
    }
    return null;
  }

  function requiredVotesCount(eligibleCount) {
    return Math.ceil((eligibleCount * 2) / 3);
  }

  function allocateNextJobId(state) {
    if (!Number.isInteger(state.nextJobId) || state.nextJobId < 1) {
      state.nextJobId = 1;
    }
    const jobId = formatJobId(state.nextJobId);
    state.nextJobId += 1;
    return jobId;
  }

  function buildTrackedRowSet(state) {
    const trackedRows = new Set();

    if (Array.isArray(state.postJobs)) {
      for (const job of state.postJobs) {
        if (Number.isInteger(job?.rowIndex) && job.rowIndex >= 2) {
          trackedRows.add(job.rowIndex);
        }
      }
    }

    for (const application of Object.values(state.applications || {})) {
      if (Number.isInteger(application?.rowIndex) && application.rowIndex >= 2) {
        trackedRows.add(application.rowIndex);
      }
    }

    return trackedRows;
  }

  function buildTrackedResponseKeySet(state) {
    const trackedKeys = new Set();

    if (Array.isArray(state.postJobs)) {
      for (const job of state.postJobs) {
        const explicit = String(job?.responseKey || "").trim();
        if (explicit) {
          trackedKeys.add(explicit);
          continue;
        }
        const inferred = buildResponseKey(
          Array.isArray(job?.headers) ? job.headers : [],
          Array.isArray(job?.row) ? job.row : []
        );
        if (inferred) {
          trackedKeys.add(inferred);
        }
      }
    }

    for (const application of Object.values(state.applications || {})) {
      const key = buildResponseKeyFromApplication(application);
      if (key) {
        trackedKeys.add(key);
      }
    }

    return trackedKeys;
  }

  function createPostJob(state, headers, row, rowIndex) {
    const normalizedHeaders = (Array.isArray(headers) ? headers : []).map(normalizeCell);
    const normalizedRow = (Array.isArray(row) ? row : []).map(normalizeCell);
    const trackKeys = inferApplicationTracks(normalizedHeaders, normalizedRow);
    return {
      jobId: allocateNextJobId(state),
      type: jobTypePostApplication,
      rowIndex,
      trackKeys,
      postedTrackKeys: [],
      responseKey: buildResponseKey(normalizedHeaders, normalizedRow),
      headers: normalizedHeaders,
      row: normalizedRow,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    };
  }

  return {
    sanitizeThreadName,
    makeApplicationContent,
    inferApplicantDiscordValue,
    extractDiscordUserId,
    normalizeDiscordLookupQuery,
    resolveApplicantDiscordUser,
    makeApplicationPostContent,
    isAnsweredValue,
    extractAnsweredFields,
    sendDebugDm,
    inferApplicantName,
    detectTracksFromText,
    inferApplicationTracks,
    inferApplicationTrack,
    extractCellByHeaderHints,
    buildResponseKey,
    extractSubmittedFieldValue,
    buildResponseKeyFromApplication,
    requiredVotesCount,
    allocateNextJobId,
    buildTrackedRowSet,
    buildTrackedResponseKeySet,
    createPostJob,
  };
}

module.exports = {
  createApplicationFormUtils,
};
