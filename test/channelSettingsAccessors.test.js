/*
  Test coverage for channelSettingsAccessors — per-track channel/role config,
  state vs env fallback priority, validation, and template management.
  Edge cases: missing state, invalid snowflakes, empty roles, template defaults.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const { createChannelSettingsAccessors } = require("../src/lib/channelSettingsAccessors");

// Fake snowflake validator — 17+ digit strings pass
function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

const CHANNEL_A = "111111111111111111";
const CHANNEL_B = "222222222222222222";
const CHANNEL_C = "333333333333333333";
const ROLE_A    = "444444444444444444";
const ROLE_B    = "555555555555555555";

function makeAccessors({ state = {}, config = {} } = {}) {
  let storedState = { settings: {}, ...state };
  return createChannelSettingsAccessors({
    config,
    defaultTrackKey: "tester",
    isSnowflake,
    getApplicationTrackKeys: () => ["tester", "builder"],
    normalizeTrackKey: (key) => (["tester", "builder"].includes(key) ? key : null),
    normalizeTrackMap: (value) =>
      value && typeof value === "object" ? value : { tester: null, builder: null },
    normalizeTrackRoleMap: (value) =>
      value && typeof value === "object"
        ? value
        : { tester: [], builder: [] },
    parseRoleIdList: (value) =>
      String(value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(isSnowflake),
    readState: () => storedState,
    writeState: (s) => { storedState = s; },
  });
}

// ── getActiveChannelIdFromState ───────────────────────────────────────────────

test("getActiveChannelIdFromState reads channel from state", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A } } },
  });
  assert.equal(acc.getActiveChannelId("tester"), CHANNEL_A);
});

test("getActiveChannelIdFromState returns null when no channel configured", () => {
  const acc = makeAccessors();
  assert.equal(acc.getActiveChannelId("tester"), null);
});

test("getActiveChannelIdFromState ignores invalid snowflake in state", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: "not-a-snowflake" } } },
  });
  assert.equal(acc.getActiveChannelId("tester"), null);
});

// ── setActiveChannel ──────────────────────────────────────────────────────────

test("setActiveChannel persists channel to state", () => {
  const acc = makeAccessors();
  acc.setActiveChannel("tester", CHANNEL_A);
  assert.equal(acc.getActiveChannelId("tester"), CHANNEL_A);
});

test("setActiveChannel throws for invalid track key", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveChannel("nonexistent", CHANNEL_A), /invalid track key/i);
});

test("setActiveChannel throws for invalid channel id", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveChannel("tester", "bad-id"), /invalid channel id/i);
});

test("setActiveChannel does not overwrite other track channels", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A, builder: CHANNEL_B } } },
  });
  acc.setActiveChannel("tester", CHANNEL_C);
  assert.equal(acc.getActiveChannelId("builder"), CHANNEL_B);
  assert.equal(acc.getActiveChannelId("tester"), CHANNEL_C);
});

// ── getActiveChannelMap / getAnyActiveChannelId ───────────────────────────────

test("getActiveChannelMap returns map of all track channels", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A, builder: CHANNEL_B } } },
  });
  const map = acc.getActiveChannelMap();
  assert.equal(map["tester"], CHANNEL_A);
  assert.equal(map["builder"], CHANNEL_B);
});

test("getAnyActiveChannelId returns first configured channel", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: null, builder: CHANNEL_B } } },
  });
  assert.equal(acc.getAnyActiveChannelId(), CHANNEL_B);
});

test("getAnyActiveChannelId returns null when nothing configured", () => {
  const acc = makeAccessors();
  assert.equal(acc.getAnyActiveChannelId(), null);
});

test("hasAnyActivePostChannelConfigured returns true when at least one channel set", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A } } },
  });
  assert.equal(acc.hasAnyActivePostChannelConfigured(), true);
});

test("hasAnyActivePostChannelConfigured returns false when none set", () => {
  const acc = makeAccessors();
  assert.equal(acc.hasAnyActivePostChannelConfigured(), false);
});

// ── getTrackKeyForChannelId ───────────────────────────────────────────────────

test("getTrackKeyForChannelId returns track key for known channel", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A, builder: CHANNEL_B } } },
  });
  assert.equal(acc.getTrackKeyForChannelId(CHANNEL_B), "builder");
});

test("getTrackKeyForChannelId returns null for unknown channel", () => {
  const acc = makeAccessors({
    state: { settings: { channels: { tester: CHANNEL_A } } },
  });
  assert.equal(acc.getTrackKeyForChannelId(CHANNEL_C), null);
});

test("getTrackKeyForChannelId returns null for non-snowflake input", () => {
  const acc = makeAccessors();
  assert.equal(acc.getTrackKeyForChannelId("not-a-snowflake"), null);
});

// ── logs / bug / suggestions channels ────────────────────────────────────────

test("setActiveLogsChannel persists and getActiveLogsChannelId retrieves it", () => {
  const acc = makeAccessors();
  acc.setActiveLogsChannel(CHANNEL_A);
  assert.equal(acc.getActiveLogsChannelId(), CHANNEL_A);
});

test("setActiveLogsChannel throws for invalid id", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveLogsChannel("bad"), /invalid log channel id/i);
});

test("getActiveLogsChannelId falls back to config when state is empty", () => {
  const acc = makeAccessors({ config: { logsChannelId: CHANNEL_A } });
  assert.equal(acc.getActiveLogsChannelId(), CHANNEL_A);
});

test("setActiveBugChannel persists and retrieves correctly", () => {
  const acc = makeAccessors();
  acc.setActiveBugChannel(CHANNEL_A);
  assert.equal(acc.getActiveBugChannelId(), CHANNEL_A);
});

test("setActiveSuggestionsChannel persists and retrieves correctly", () => {
  const acc = makeAccessors();
  acc.setActiveSuggestionsChannel(CHANNEL_A);
  assert.equal(acc.getActiveSuggestionsChannelId(), CHANNEL_A);
});

// ── bot logs channel fallback ─────────────────────────────────────────────────

test("getActiveBotLogsChannelId falls back to log channel when no bot log channel set", () => {
  const acc = makeAccessors({
    state: { settings: { logChannelId: CHANNEL_A } },
  });
  assert.equal(acc.getActiveBotLogsChannelId(), CHANNEL_A);
});

test("getActiveBotLogsChannelId prefers botLogChannelId over logChannelId", () => {
  const acc = makeAccessors({
    state: { settings: { logChannelId: CHANNEL_A, botLogChannelId: CHANNEL_B } },
  });
  assert.equal(acc.getActiveBotLogsChannelId(), CHANNEL_B);
});

// ── accept announce template ──────────────────────────────────────────────────

test("getActiveAcceptAnnounceTemplate returns default when nothing configured", () => {
  const acc = makeAccessors();
  const template = acc.getActiveAcceptAnnounceTemplate();
  assert.ok(typeof template === "string" && template.length > 0);
});

test("setActiveAcceptAnnounceTemplate persists custom template", () => {
  const acc = makeAccessors();
  acc.setActiveAcceptAnnounceTemplate("Welcome, {applicant}!");
  assert.equal(acc.getActiveAcceptAnnounceTemplate(), "Welcome, {applicant}!");
});

test("setActiveAcceptAnnounceTemplate throws for empty template", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveAcceptAnnounceTemplate(""), /cannot be empty/i);
  assert.throws(() => acc.setActiveAcceptAnnounceTemplate("   "), /cannot be empty/i);
});

test("getActiveAcceptAnnounceTemplate prefers state over config", () => {
  const acc = makeAccessors({ config: { acceptAnnounceTemplate: "from config" } });
  acc.setActiveAcceptAnnounceTemplate("from state");
  assert.equal(acc.getActiveAcceptAnnounceTemplate(), "from state");
});

// ── deny DM template ──────────────────────────────────────────────────────────

test("getActiveDenyDmTemplate returns default when nothing configured", () => {
  const acc = makeAccessors();
  const template = acc.getActiveDenyDmTemplate();
  assert.ok(typeof template === "string" && template.length > 0);
});

test("setActiveDenyDmTemplate persists custom template", () => {
  const acc = makeAccessors();
  acc.setActiveDenyDmTemplate("Sorry, {applicant}.");
  assert.equal(acc.getActiveDenyDmTemplate(), "Sorry, {applicant}.");
});

test("setActiveDenyDmTemplate throws for empty template", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveDenyDmTemplate(""), /cannot be empty/i);
});

// ── approved roles ────────────────────────────────────────────────────────────

test("setActiveApprovedRoles persists roles and getActiveApprovedRoleIds retrieves them", () => {
  const acc = makeAccessors();
  acc.setActiveApprovedRoles("tester", `${ROLE_A},${ROLE_B}`);
  const ids = acc.getActiveApprovedRoleIds("tester");
  assert.deepEqual(ids, [ROLE_A, ROLE_B]);
});

test("setActiveApprovedRoles throws for invalid track key", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveApprovedRoles("nonexistent", ROLE_A), /invalid track key/i);
});

test("setActiveApprovedRoles throws when no valid role ids provided", () => {
  const acc = makeAccessors();
  assert.throws(() => acc.setActiveApprovedRoles("tester", "bad-id"), /at least one/i);
});

test("setActiveApprovedRoles does not overwrite roles for other tracks", () => {
  const acc = makeAccessors();
  acc.setActiveApprovedRoles("tester", ROLE_A);
  acc.setActiveApprovedRoles("builder", ROLE_B);
  assert.deepEqual(acc.getActiveApprovedRoleIds("tester"), [ROLE_A]);
  assert.deepEqual(acc.getActiveApprovedRoleIds("builder"), [ROLE_B]);
});
