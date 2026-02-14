function toCodeBlock(text) {
  const safe = String(text || "").replace(/```/g, "``\u200b`");
  return `\`\`\`txt\n${safe}\n\`\`\``;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTemplatePlaceholders(template, replacements) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(replacements || {})) {
    const safeKey = escapeRegExp(String(key));
    const regex = new RegExp(`\\{${safeKey}\\}`, "g");
    output = output.replace(regex, String(value ?? ""));
  }
  return output;
}

function splitMessageByLength(text, maxLength = 1900) {
  const lines = String(text || "").split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [""];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMsFromBody(body) {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.retry_after === "number" && parsed.retry_after >= 0) {
      return Math.ceil(parsed.retry_after * 1000);
    }
  } catch {
    // ignore malformed or non-JSON bodies
  }
  return null;
}

function getRetryAfterMsFromError(err) {
  const directRetryAfter =
    err?.rawError?.retry_after ?? err?.data?.retry_after ?? err?.retry_after;
  if (typeof directRetryAfter === "number" && Number.isFinite(directRetryAfter) && directRetryAfter >= 0) {
    if (directRetryAfter > 1000) {
      return Math.ceil(directRetryAfter);
    }
    return Math.ceil(directRetryAfter * 1000);
  }
  return null;
}

function isRateLimitError(err) {
  if (!err) {
    return false;
  }
  const status = Number(err.status);
  if (status === 429) {
    return true;
  }
  const code = Number(err.code);
  if (code === 429) {
    return true;
  }
  const message = String(err.message || "").toLowerCase();
  return message.includes("rate limit");
}

async function withRateLimitRetry(label, run, options = {}) {
  const maxAttempts =
    Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
      ? options.maxAttempts
      : 6;
  const minimumWaitMs =
    Number.isInteger(options.minimumWaitMs) && options.minimumWaitMs >= 0
      ? options.minimumWaitMs
      : 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const retryAfterMs = getRetryAfterMsFromError(err);
      const waitMs = Math.max(minimumWaitMs, retryAfterMs ?? 1000) + 100;
      console.warn(
        `${label} rate limited. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts}).`
      );
      await sleep(waitMs);
    }
  }
}

module.exports = {
  toCodeBlock,
  applyTemplatePlaceholders,
  splitMessageByLength,
  sleep,
  getRetryAfterMsFromBody,
  getRetryAfterMsFromError,
  isRateLimitError,
  withRateLimitRetry,
};
