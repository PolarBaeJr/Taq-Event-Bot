const test = require("node:test");
const assert = require("node:assert/strict");

const { createDynamicMessageSystem } = require("../src/lib/dynamicMessageSystem");

test("buildApplicationMessagePayload builds consistent embed payload", () => {
  const { buildApplicationMessagePayload } = createDynamicMessageSystem({
    toCodeBlock: (text) => `\`\`\`txt\n${text}\n\`\`\``,
  });

  const payload = buildApplicationMessagePayload({
    applicationId: "TESTER-12",
    trackKey: "tester",
    trackLabel: "Tester",
    applicantMention: "<@123456789012345678>",
    detailsText: "Name: Jane\n\nReason: Strong quality focus",
  });

  assert.equal(payload.content, "<@123456789012345678>");
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].title, "📥 New Application");
  assert.equal(payload.embeds[0].fields[0].name, "Track");
  assert.equal(payload.embeds[0].fields[0].value, "Tester");
  assert.equal(payload.embeds[0].fields[1].name, "Application ID");
  assert.equal(payload.embeds[0].fields[1].value, "`TESTER-12`");
  assert.match(payload.embeds[0].description, /^```txt/);
  assert.deepEqual(payload.allowedMentions, {
    parse: [],
    users: ["123456789012345678"],
    roles: [],
  });
});

test("buildFeedbackMessagePayload builds suggestion and bug payloads", () => {
  const { buildFeedbackMessagePayload } = createDynamicMessageSystem();

  const bugPayload = buildFeedbackMessagePayload({
    kind: "Bug Report",
    commandLabel: "Bug Report",
    reporterUserId: "123456789012345678",
    sourceChannelId: "987654321098765432",
    message: "Crash when pressing accept",
  });
  const suggestionPayload = buildFeedbackMessagePayload({
    kind: "Suggestion",
    commandLabel: "Suggestion",
    reporterUserId: "123456789012345678",
    sourceChannelId: "987654321098765432",
    message: "Add reviewer rotation panel",
  });

  assert.equal(bugPayload.embeds[0].title, "🐞 Bug Report");
  assert.equal(suggestionPayload.embeds[0].title, "💡 Suggestion");
  assert.equal(bugPayload.embeds[0].fields[0].value, "<@123456789012345678>");
  assert.equal(bugPayload.embeds[0].fields[1].value, "<#987654321098765432>");
  assert.equal(suggestionPayload.embeds[0].footer.text, "Suggestion via slash command");
});
