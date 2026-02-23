/*
  Test coverage for messageAndRetryUtils — pure utility functions.
  Covers: toCodeBlock, applyTemplatePlaceholders, splitMessageByLength,
          getRetryAfterMsFromBody, getRetryAfterMsFromError,
          isRateLimitError, withRateLimitRetry.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  toCodeBlock,
  applyTemplatePlaceholders,
  splitMessageByLength,
  getRetryAfterMsFromBody,
  getRetryAfterMsFromError,
  isRateLimitError,
  withRateLimitRetry,
} = require("../src/lib/messageAndRetryUtils");

// ── toCodeBlock ───────────────────────────────────────────────────────────────

test("toCodeBlock wraps text in a txt code block", () => {
  const result = toCodeBlock("hello world");
  assert.equal(result, "```txt\nhello world\n```");
});

test("toCodeBlock escapes triple backticks inside content", () => {
  const result = toCodeBlock("before ```code``` after");
  assert.ok(!result.includes("```code```"), "should not contain unescaped triple backtick block");
  assert.ok(result.startsWith("```txt\n"), "should still open correctly");
  assert.ok(result.endsWith("\n```"), "should still close correctly");
});

test("toCodeBlock handles empty string", () => {
  const result = toCodeBlock("");
  assert.equal(result, "```txt\n\n```");
});

test("toCodeBlock handles null/undefined gracefully", () => {
  assert.equal(toCodeBlock(null), "```txt\n\n```");
  assert.equal(toCodeBlock(undefined), "```txt\n\n```");
});

// ── applyTemplatePlaceholders ─────────────────────────────────────────────────

test("applyTemplatePlaceholders substitutes a single placeholder", () => {
  const result = applyTemplatePlaceholders("Hello {name}!", { name: "World" });
  assert.equal(result, "Hello World!");
});

test("applyTemplatePlaceholders substitutes multiple placeholders", () => {
  const result = applyTemplatePlaceholders("{a} and {b} and {a}", { a: "X", b: "Y" });
  assert.equal(result, "X and Y and X");
});

test("applyTemplatePlaceholders leaves unknown placeholders intact", () => {
  const result = applyTemplatePlaceholders("Hello {unknown}!", { name: "World" });
  assert.equal(result, "Hello {unknown}!");
});

test("applyTemplatePlaceholders treats null value as empty string", () => {
  const result = applyTemplatePlaceholders("Value: {x}", { x: null });
  assert.equal(result, "Value: ");
});

test("applyTemplatePlaceholders handles keys with regex special chars", () => {
  // If the key had regex special chars and wasn't escaped, this would throw
  const result = applyTemplatePlaceholders("test {user.name}", { "user.name": "Alice" });
  assert.equal(result, "test Alice");
});

test("applyTemplatePlaceholders returns empty string for null template", () => {
  const result = applyTemplatePlaceholders(null, { name: "x" });
  assert.equal(result, "");
});

test("applyTemplatePlaceholders returns template unchanged for empty replacements", () => {
  const result = applyTemplatePlaceholders("Hello {name}!", {});
  assert.equal(result, "Hello {name}!");
});

// ── splitMessageByLength ──────────────────────────────────────────────────────

test("splitMessageByLength returns single chunk for short text", () => {
  const chunks = splitMessageByLength("short text");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], "short text");
});

test("splitMessageByLength splits on line boundaries when over limit", () => {
  const lines = Array.from({ length: 5 }, (_, i) => `Line ${i + 1} — ${"-".repeat(10)}`);
  const text = lines.join("\n");
  const chunks = splitMessageByLength(text, 30);
  assert.ok(chunks.length > 1, "should produce multiple chunks");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 30, `chunk too long: ${chunk.length}`);
  }
  // Reassembly should recover the full text
  assert.equal(chunks.join("\n"), text);
});

test("splitMessageByLength force-splits a single line longer than maxLength", () => {
  const longLine = "X".repeat(200);
  const chunks = splitMessageByLength(longLine, 50);
  assert.ok(chunks.length === 4, `expected 4 chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 50);
  }
});

test("splitMessageByLength returns [''] for empty input", () => {
  const chunks = splitMessageByLength("");
  assert.deepEqual(chunks, [""]);
});

test("splitMessageByLength handles null input", () => {
  const chunks = splitMessageByLength(null);
  assert.deepEqual(chunks, [""]);
});

test("splitMessageByLength respects exact boundary (text fits exactly)", () => {
  const text = "A".repeat(1900);
  const chunks = splitMessageByLength(text, 1900);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, 1900);
});

// ── getRetryAfterMsFromBody ───────────────────────────────────────────────────

test("getRetryAfterMsFromBody parses retry_after in seconds from JSON body", () => {
  const ms = getRetryAfterMsFromBody(JSON.stringify({ retry_after: 1.5 }));
  assert.equal(ms, 1500);
});

test("getRetryAfterMsFromBody returns null for missing retry_after field", () => {
  const ms = getRetryAfterMsFromBody(JSON.stringify({ code: 429 }));
  assert.equal(ms, null);
});

test("getRetryAfterMsFromBody returns null for malformed JSON", () => {
  const ms = getRetryAfterMsFromBody("not json {");
  assert.equal(ms, null);
});

test("getRetryAfterMsFromBody returns null for null/empty body", () => {
  assert.equal(getRetryAfterMsFromBody(null), null);
  assert.equal(getRetryAfterMsFromBody(""), null);
});

test("getRetryAfterMsFromBody returns null for negative retry_after", () => {
  const ms = getRetryAfterMsFromBody(JSON.stringify({ retry_after: -1 }));
  assert.equal(ms, null);
});

// ── getRetryAfterMsFromError ──────────────────────────────────────────────────

test("getRetryAfterMsFromError reads rawError.retry_after (seconds)", () => {
  const err = { rawError: { retry_after: 2 } };
  assert.equal(getRetryAfterMsFromError(err), 2000);
});

test("getRetryAfterMsFromError reads data.retry_after (seconds)", () => {
  const err = { data: { retry_after: 0.5 } };
  assert.equal(getRetryAfterMsFromError(err), 500);
});

test("getRetryAfterMsFromError treats large values as already milliseconds", () => {
  const err = { retry_after: 5000 };
  assert.equal(getRetryAfterMsFromError(err), 5000);
});

test("getRetryAfterMsFromError returns null when no retry_after present", () => {
  assert.equal(getRetryAfterMsFromError({}), null);
  assert.equal(getRetryAfterMsFromError(null), null);
});

// ── isRateLimitError ──────────────────────────────────────────────────────────

test("isRateLimitError returns true for HTTP 429 status", () => {
  assert.equal(isRateLimitError({ status: 429 }), true);
  assert.equal(isRateLimitError({ status: "429" }), true);
});

test("isRateLimitError returns true for error code 429", () => {
  assert.equal(isRateLimitError({ code: 429 }), true);
});

test("isRateLimitError returns true when message includes 'rate limit'", () => {
  assert.equal(isRateLimitError({ message: "You are being Rate Limited." }), true);
  assert.equal(isRateLimitError({ message: "rate limit exceeded" }), true);
});

test("isRateLimitError returns false for non-rate-limit errors", () => {
  assert.equal(isRateLimitError({ status: 500, message: "Internal error" }), false);
  assert.equal(isRateLimitError({ code: 10007, message: "Unknown Member" }), false);
});

test("isRateLimitError returns false for null/undefined", () => {
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
});

// ── withRateLimitRetry ────────────────────────────────────────────────────────

test("withRateLimitRetry returns result on first success", async () => {
  const result = await withRateLimitRetry("test", async () => 42, {
    maxAttempts: 3,
    minimumWaitMs: 0,
  });
  assert.equal(result, 42);
});

test("withRateLimitRetry retries on rate limit error then succeeds", async () => {
  let calls = 0;
  const rateLimitErr = Object.assign(new Error("rate limit"), { status: 429, retry_after: 0 });
  const result = await withRateLimitRetry(
    "test",
    async () => {
      calls += 1;
      if (calls < 3) throw rateLimitErr;
      return "ok";
    },
    { maxAttempts: 5, minimumWaitMs: 0 }
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRateLimitRetry throws immediately on non-rate-limit error", async () => {
  let calls = 0;
  const nonRateErr = new Error("Unknown Member");
  await assert.rejects(
    async () => {
      await withRateLimitRetry(
        "test",
        async () => {
          calls += 1;
          throw nonRateErr;
        },
        { maxAttempts: 5, minimumWaitMs: 0 }
      );
    },
    (err) => err === nonRateErr
  );
  assert.equal(calls, 1, "should not retry non-rate-limit errors");
});

test("withRateLimitRetry exhausts retries and rethrows the rate-limit error", async () => {
  let calls = 0;
  const rateLimitErr = Object.assign(new Error("rate limit"), { status: 429, retry_after: 0 });
  await assert.rejects(
    async () => {
      await withRateLimitRetry(
        "test",
        async () => {
          calls += 1;
          throw rateLimitErr;
        },
        { maxAttempts: 3, minimumWaitMs: 0 }
      );
    },
    (err) => err === rateLimitErr
  );
  assert.equal(calls, 3);
});
