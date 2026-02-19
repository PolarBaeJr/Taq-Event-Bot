/*
  Test coverage for application decision workflow thread archive behavior.
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

  const { finalizeApplication } = createApplicationDecisionWorkflow({
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
