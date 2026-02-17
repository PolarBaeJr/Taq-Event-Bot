const test = require("node:test");
const assert = require("node:assert/strict");

const { createPollingPipeline } = require("../src/lib/pollingPipeline");

function normalizeTrackKeys(values, { fallback = [] } = {}) {
  const primary = Array.isArray(values) ? values : [values];
  const source = primary.some((value) => Boolean(value)) ? primary : fallback;
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

test("processQueuedPostJobs continues after one job fails", async () => {
  const state = {
    applications: {},
    threads: {},
    postJobs: [
      {
        jobId: "job-1",
        rowIndex: 7,
        trackKeys: ["artist"],
        postedTrackKeys: [],
        headers: ["Name"],
        row: ["Artist Applicant"],
        createdAt: "2026-02-17T00:00:00.000Z",
      },
      {
        jobId: "job-2",
        rowIndex: 8,
        trackKeys: ["cmd"],
        postedTrackKeys: [],
        headers: ["Name"],
        row: ["CMD Applicant"],
        createdAt: "2026-02-17T00:01:00.000Z",
      },
    ],
  };
  const infoEvents = [];
  const errorEvents = [];
  let messageCounter = 0;

  const { processQueuedPostJobs } = createPollingPipeline({
    readState: () => state,
    writeState: () => {},
    inferApplicationTracks: () => [],
    normalizeTrackKeys,
    getActiveChannelId: (trackKey) =>
      trackKey === "cmd" ? "1471675381554610313" : null,
    getTrackLabel: (trackKey) =>
      trackKey === "artist" ? "Artist" : trackKey === "cmd" ? "CMD" : trackKey,
    inferApplicantName: () => "Debug Applicant",
    resolveApplicantDiscordUser: async () => ({ rawValue: null, userId: null }),
    buildApplicationId: (trackKey, jobId) => `${String(trackKey || "").toUpperCase()}-${jobId}`,
    makeApplicationPostContent: () => "test payload",
    sendChannelMessage: async (channelId) => {
      messageCounter += 1;
      return {
        id: `message-${messageCounter}`,
        channelId,
      };
    },
    withRateLimitRetry: async (_label, run) => run(),
    addReaction: async () => {},
    createThread: async (_channelId, messageId) => ({ id: `thread-${messageId}` }),
    extractAnsweredFields: (headers, row) =>
      headers.map((header, index) => ({
        key: header,
        value: row[index] || "",
      })),
    buildResponseKey: (_headers, row) => row.join("|"),
    buildResponseKeyFromApplication: () => null,
    client: null,
    statusPending: "pending",
    acceptEmoji: "✅",
    denyEmoji: "❌",
    formatTrackLabels: (trackKeys) => trackKeys.join(","),
    sortPostJobsInPlace: (jobs) => jobs.sort((a, b) => a.jobId.localeCompare(b.jobId)),
    hasAnyActivePostChannelConfigured: () => true,
    readAllResponses: async () => [],
    buildTrackedResponseKeySet: () => new Set(),
    buildTrackedRowSet: () => new Set(),
    autoRegisterTracksFromFormRow: () => [],
    createPostJob: () => null,
    findDuplicateApplications: () => [],
    postDuplicateWarning: async () => {},
    announceReviewerAssignment: async () => {},
    logger: {
      info(event, message, context) {
        infoEvents.push({ event, message, context });
      },
      error(event, message, context) {
        errorEvents.push({ event, message, context });
      },
    },
  });

  const result = await processQueuedPostJobs();
  assert.equal(result.queuedBefore, 2);
  assert.equal(result.posted, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(result.failedJobId, "job-1");
  assert.equal(state.postJobs.length, 1);
  assert.equal(state.postJobs[0].jobId, "job-1");
  assert.equal(state.postJobs[0].attempts, 1);
  assert.ok(String(state.postJobs[0].lastError || "").includes("Missing post channels"));
  assert.equal(Object.keys(state.applications).length, 1);
  assert.ok(infoEvents.some((entry) => entry.event === "queue_job_posted"));
  assert.ok(errorEvents.some((entry) => entry.event === "queue_job_failed"));
});
