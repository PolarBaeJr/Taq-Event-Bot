/*
  Test coverage for application decision workflow: thread archive, reopen,
  close, already-decided guard, unknown application, and adminDone auto-set.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const { createApplicationDecisionWorkflow } = require("../src/lib/applicationDecisionWorkflow");

// buildWorkflowHarness: handles build workflow harness.
function buildWorkflowHarness() {
  const messageId = "msg-1";
  const timeline = [];
  const state = {
    applications: {
      [messageId]: {
        messageId,
        channelId: "channel-1",
        threadId: "thread-1",
        status: "pending",
        trackKey: "tester",
        applicantName: "Applicant",
      },
    },
  };

  const parentMessage = {
    embeds: [],
    async reply() {
      timeline.push("parent_reply");
    },
    async edit() {
      timeline.push("parent_edit");
    },
  };

  const parentChannel = {
    isTextBased: () => true,
    messages: {
      fetch: async () => parentMessage,
    },
  };

  const thread = {
    archived: false,
    setArchivedCalls: [],
    isTextBased: () => true,
    async send() {
      timeline.push("thread_send");
    },
    async setArchived(flag, reason) {
      this.archived = flag;
      this.setArchivedCalls.push({ flag, reason });
      timeline.push(`thread_archive_${String(flag)}`);
    },
  };

  const client = {
    user: { id: "bot-user" },
    channels: {
      fetch: async (channelId) => {
        if (channelId === "channel-1") {
          return parentChannel;
        }
        if (channelId === "thread-1") {
          return thread;
        }
        return null;
      },
    },
  };

  const { finalizeApplication, reopenApplication, closeApplication } =
    createApplicationDecisionWorkflow({
      client,
      readState: () => state,
      writeState: () => {},
      grantApprovedRoleOnAcceptance: async () => ({
        status: "granted",
        message: "Role assignment succeeded.",
        userId: "123456789012345678",
      }),
      sendAcceptedApplicationAnnouncement: async () => ({
        message: "Acceptance announcement sent.",
      }),
      sendDeniedApplicationDm: async () => ({
        message: "Denied DM sent.",
      }),
      postClosureLog: async () => {
        timeline.push("closure_log");
      },
    });

  return {
    messageId,
    state,
    thread,
    timeline,
    finalizeApplication,
    reopenApplication,
    closeApplication,
  };
}

test("finalizeApplication auto-archives thread after accept", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.finalizeApplication(
    harness.messageId,
    "accepted",
    "command",
    "actor-1"
  );

  assert.equal(result.ok, true);
  assert.equal(harness.state.applications[harness.messageId].status, "accepted");
  assert.equal(harness.thread.setArchivedCalls.length, 1);
  assert.equal(harness.thread.setArchivedCalls[0].flag, true);
  assert.match(
    String(harness.thread.setArchivedCalls[0].reason || ""),
    /accepted/i
  );
  assert.ok(harness.timeline.includes("closure_log"));
  assert.ok(harness.timeline.includes("thread_archive_true"));
  assert.ok(
    harness.timeline.indexOf("thread_archive_true") >
      harness.timeline.indexOf("closure_log")
  );
});

test("finalizeApplication auto-archives thread after deny", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.finalizeApplication(
    harness.messageId,
    "denied",
    "command",
    "actor-1"
  );

  assert.equal(result.ok, true);
  assert.equal(harness.state.applications[harness.messageId].status, "denied");
  assert.equal(harness.thread.setArchivedCalls.length, 1);
  assert.equal(harness.thread.setArchivedCalls[0].flag, true);
  assert.match(
    String(harness.thread.setArchivedCalls[0].reason || ""),
    /denied/i
  );
  assert.ok(harness.timeline.includes("closure_log"));
  assert.ok(harness.timeline.includes("thread_archive_true"));
  assert.ok(
    harness.timeline.indexOf("thread_archive_true") >
      harness.timeline.indexOf("closure_log")
  );
});

// ── finalizeApplication edge cases ───────────────────────────────────────────

test("finalizeApplication returns unknown_application for missing message id", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.finalizeApplication("nonexistent-id", "accepted", "command", "actor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_application");
});

test("finalizeApplication returns already_decided when application is already accepted", async () => {
  const harness = buildWorkflowHarness();
  await harness.finalizeApplication(harness.messageId, "accepted", "command", "actor");
  const result = await harness.finalizeApplication(harness.messageId, "denied", "command", "actor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "already_decided");
});

test("finalizeApplication sets adminDone = true on accept", async () => {
  const harness = buildWorkflowHarness();
  await harness.finalizeApplication(harness.messageId, "accepted", "command", "actor");
  assert.equal(harness.state.applications[harness.messageId].adminDone, true);
});

test("finalizeApplication sets adminDone = true on deny", async () => {
  const harness = buildWorkflowHarness();
  await harness.finalizeApplication(harness.messageId, "denied", "command", "actor");
  assert.equal(harness.state.applications[harness.messageId].adminDone, true);
});

// ── reopenApplication ─────────────────────────────────────────────────────────

test("reopenApplication resets status to pending after accept", async () => {
  const harness = buildWorkflowHarness();
  await harness.finalizeApplication(harness.messageId, "accepted", "command", "actor");
  const result = await harness.reopenApplication(harness.messageId, "actor", "reopening");
  assert.equal(result.ok, true);
  assert.equal(result.previousStatus, "accepted");
  assert.equal(harness.state.applications[harness.messageId].status, "pending");
});

test("reopenApplication clears adminDone flag", async () => {
  const harness = buildWorkflowHarness();
  await harness.finalizeApplication(harness.messageId, "denied", "command", "actor");
  await harness.reopenApplication(harness.messageId, "actor");
  assert.equal(harness.state.applications[harness.messageId].adminDone, false);
});

test("reopenApplication returns already_pending when application is still pending", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.reopenApplication(harness.messageId, "actor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "already_pending");
});

test("reopenApplication returns unknown_application for missing message id", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.reopenApplication("nonexistent-id", "actor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_application");
});

// ── closeApplication ──────────────────────────────────────────────────────────

test("closeApplication sets status to closed and adminDone to true", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.closeApplication(harness.messageId, "actor");
  assert.equal(result.ok, true);
  assert.equal(harness.state.applications[harness.messageId].status, "closed");
  assert.equal(harness.state.applications[harness.messageId].adminDone, true);
});

test("closeApplication stores closedBy and closedAt", async () => {
  const harness = buildWorkflowHarness();
  await harness.closeApplication(harness.messageId, "actor-999");
  const app = harness.state.applications[harness.messageId];
  assert.equal(app.closedBy, "actor-999");
  assert.ok(typeof app.closedAt === "string" && app.closedAt.length > 0);
});

test("closeApplication stores optional reason", async () => {
  const harness = buildWorkflowHarness();
  await harness.closeApplication(harness.messageId, "actor", "spam application");
  assert.equal(harness.state.applications[harness.messageId].closeReason, "spam application");
});

test("closeApplication returns unknown_application for missing message id", async () => {
  const harness = buildWorkflowHarness();
  const result = await harness.closeApplication("nonexistent-id", "actor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_application");
});

test("reopenApplication on a closed application resets it to pending", async () => {
  const harness = buildWorkflowHarness();
  await harness.closeApplication(harness.messageId, "actor");
  assert.equal(harness.state.applications[harness.messageId].status, "closed");
  const result = await harness.reopenApplication(harness.messageId, "actor");
  assert.equal(result.ok, true);
  assert.equal(harness.state.applications[harness.messageId].status, "pending");
  assert.equal(harness.state.applications[harness.messageId].adminDone, false);
});
