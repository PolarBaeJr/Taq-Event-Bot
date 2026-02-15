const test = require("node:test");
const assert = require("node:assert/strict");

const { createDynamicMessageSystem } = require("../src/lib/dynamicMessageSystem");
const {
  extractTrackLabelFromMessage,
  extractApplicationIdFromMessage,
  parseSubmittedFieldsFromMessage,
  isApplicationPostMessage,
} = require("../src/lib/applicationMessageParser");

test("parser can read current embedded application payload", () => {
  const { buildApplicationMessagePayload } = createDynamicMessageSystem({
    toCodeBlock: (text) => `\`\`\`txt\n${text}\n\`\`\``,
  });
  const payload = buildApplicationMessagePayload({
    applicationId: "CMD-44",
    trackKey: "cmd",
    trackLabel: "CMD",
    applicantMention: "<@123456789012345678>",
    detailsText: "Name: Alice\n\nReason: Good moderation and communication",
  });

  assert.equal(extractTrackLabelFromMessage(payload), "cmd");
  assert.equal(extractApplicationIdFromMessage(payload), "CMD-44");
  assert.deepEqual(parseSubmittedFieldsFromMessage(payload), [
    "**Name:** Alice",
    "**Reason:** Good moderation and communication",
  ]);
  assert.equal(isApplicationPostMessage(payload), true);
});

test("parser still supports legacy markdown-only content format", () => {
  const legacyMessage = {
    content: [
      "📥 **New Application**",
      "🧭 **Track:** Tester",
      "",
      "**Application ID:** `TESTER-2`",
      "",
      "```txt",
      "Name: Bob",
      "",
      "Reason: Prior QA experience",
      "```",
    ].join("\n"),
    embeds: [],
  };

  assert.equal(extractTrackLabelFromMessage(legacyMessage), "tester");
  assert.equal(extractApplicationIdFromMessage(legacyMessage), "TESTER-2");
  assert.deepEqual(parseSubmittedFieldsFromMessage(legacyMessage), [
    "**Name:** Bob",
    "**Reason:** Prior QA experience",
  ]);
  assert.equal(isApplicationPostMessage(legacyMessage), true);
});
