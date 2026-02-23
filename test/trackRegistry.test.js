/*
  Test coverage for trackRegistry — track CRUD, alias resolution, normalization.
  Edge cases: key collisions, alias conflicts with base tracks, empty/null input,
  special characters in keys, duplicate aliasregistration.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const { createTrackRegistry } = require("../src/lib/trackRegistry");

function makeRegistry(baseTracks = []) {
  return createTrackRegistry({ baseTracks });
}

const BASE_TRACKS = [
  { key: "tester", label: "Tester", aliases: ["tester", "qa"] },
  { key: "builder", label: "Builder", aliases: ["builder", "dev"] },
];

// ── normalizeTrackAlias ───────────────────────────────────────────────────────

test("normalizeTrackAlias lowercases and trims", () => {
  const { normalizeTrackAlias } = makeRegistry();
  assert.equal(normalizeTrackAlias("  Tester  "), "tester");
  assert.equal(normalizeTrackAlias("BUILDER"), "builder");
});

test("normalizeTrackAlias collapses internal whitespace", () => {
  const { normalizeTrackAlias } = makeRegistry();
  assert.equal(normalizeTrackAlias("event  team"), "event team");
});

test("normalizeTrackAlias returns empty string for empty/null input", () => {
  const { normalizeTrackAlias } = makeRegistry();
  assert.equal(normalizeTrackAlias(""), "");
  assert.equal(normalizeTrackAlias(null), "");
  assert.equal(normalizeTrackAlias(undefined), "");
});

// ── parseTrackAliasInput ──────────────────────────────────────────────────────

test("parseTrackAliasInput splits comma-separated aliases", () => {
  const { parseTrackAliasInput } = makeRegistry();
  const result = parseTrackAliasInput("tester, qa, test");
  assert.deepEqual(result, ["tester", "qa", "test"]);
});

test("parseTrackAliasInput splits semicolon-separated aliases", () => {
  const { parseTrackAliasInput } = makeRegistry();
  const result = parseTrackAliasInput("tester;qa;test");
  assert.deepEqual(result, ["tester", "qa", "test"]);
});

test("parseTrackAliasInput handles array input", () => {
  const { parseTrackAliasInput } = makeRegistry();
  const result = parseTrackAliasInput(["tester", "qa,test"]);
  assert.deepEqual(result, ["tester", "qa", "test"]);
});

test("parseTrackAliasInput returns empty array for empty/null", () => {
  const { parseTrackAliasInput } = makeRegistry();
  assert.deepEqual(parseTrackAliasInput(""), []);
  assert.deepEqual(parseTrackAliasInput(null), []);
  assert.deepEqual(parseTrackAliasInput([]), []);
});

// ── buildTrackAliasLookup ─────────────────────────────────────────────────────

test("buildTrackAliasLookup maps track key and aliases to track key", () => {
  const { buildTrackAliasLookup } = makeRegistry();
  const lookup = buildTrackAliasLookup(BASE_TRACKS);
  assert.equal(lookup.get("tester"), "tester");
  assert.equal(lookup.get("qa"), "tester");
  assert.equal(lookup.get("builder"), "builder");
  assert.equal(lookup.get("dev"), "builder");
});

test("buildTrackAliasLookup first registration wins on conflict", () => {
  const { buildTrackAliasLookup } = makeRegistry();
  const tracks = [
    { key: "alpha", label: "Alpha", aliases: ["shared"] },
    { key: "beta", label: "Beta", aliases: ["shared"] },
  ];
  const lookup = buildTrackAliasLookup(tracks);
  assert.equal(lookup.get("shared"), "alpha");
});

test("buildTrackAliasLookup returns empty map for empty input", () => {
  const { buildTrackAliasLookup } = makeRegistry();
  const lookup = buildTrackAliasLookup([]);
  assert.equal(lookup.size, 0);
});

// ── getApplicationTracks / getApplicationTrackKeys ────────────────────────────

test("getApplicationTracks returns base tracks when no custom tracks set", () => {
  const registry = makeRegistry(BASE_TRACKS);
  const tracks = registry.getApplicationTracks();
  assert.equal(tracks.length, 2);
  assert.ok(tracks.some((t) => t.key === "tester"));
  assert.ok(tracks.some((t) => t.key === "builder"));
});

test("getApplicationTrackKeys returns keys for all tracks", () => {
  const registry = makeRegistry(BASE_TRACKS);
  const keys = registry.getApplicationTrackKeys();
  assert.deepEqual(keys.sort(), ["builder", "tester"]);
});

// ── setCustomTracks ───────────────────────────────────────────────────────────

test("setCustomTracks adds a custom track to the registry", () => {
  const registry = makeRegistry(BASE_TRACKS);
  registry.setCustomTracks([{ key: "mapper", label: "Mapper" }]);
  const keys = registry.getApplicationTrackKeys();
  assert.ok(keys.includes("mapper"));
});

test("setCustomTracks auto-generates label from key when label is absent", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "event_lead" }]);
  const tracks = registry.getApplicationTracks();
  assert.equal(tracks[0].label, "Event Lead");
});

test("setCustomTracks auto-generates aliases from key", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "event_lead", label: "Event Lead" }]);
  const snapshot = registry.getCustomTracksSnapshot();
  assert.ok(snapshot[0].aliases.includes("event_lead"));
  assert.ok(snapshot[0].aliases.includes("event lead"));
});

test("setCustomTracks silently drops a track whose key conflicts with a base track", () => {
  const registry = makeRegistry(BASE_TRACKS);
  registry.setCustomTracks([{ key: "tester", label: "Custom Tester" }]);
  const snapshot = registry.getCustomTracksSnapshot();
  assert.equal(snapshot.length, 0, "should not add custom track with base track key");
});

test("setCustomTracks silently drops duplicate custom keys", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([
    { key: "mapper", label: "Mapper" },
    { key: "mapper", label: "Mapper 2" },
  ]);
  const snapshot = registry.getCustomTracksSnapshot();
  assert.equal(snapshot.length, 1);
});

test("setCustomTracks filters aliases that conflict with base track aliases", () => {
  const registry = makeRegistry(BASE_TRACKS);
  // "qa" is already an alias of "tester" (base track)
  registry.setCustomTracks([{ key: "newtrack", aliases: ["qa", "newtrack"] }]);
  const snapshot = registry.getCustomTracksSnapshot();
  if (snapshot.length > 0) {
    assert.ok(!snapshot[0].aliases.includes("qa"), "conflicting alias 'qa' should be removed");
  }
});

test("setCustomTracks replaces previous custom tracks on subsequent call", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "alpha" }]);
  registry.setCustomTracks([{ key: "beta" }]);
  const keys = registry.getApplicationTrackKeys();
  assert.ok(!keys.includes("alpha"), "old track 'alpha' should be gone");
  assert.ok(keys.includes("beta"));
});

test("setCustomTracks handles empty array (clears custom tracks)", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "alpha" }]);
  registry.setCustomTracks([]);
  const snapshot = registry.getCustomTracksSnapshot();
  assert.equal(snapshot.length, 0);
});

test("setCustomTracks normalizes key from special characters", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "Event-Lead 2!" }]);
  const snapshot = registry.getCustomTracksSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].key, "event_lead_2");
});

test("setCustomTracks sorts custom tracks alphabetically by label", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([
    { key: "zebra", label: "Zebra" },
    { key: "alpha", label: "Alpha" },
    { key: "mango", label: "Mango" },
  ]);
  const snapshot = registry.getCustomTracksSnapshot();
  const labels = snapshot.map((t) => t.label);
  assert.deepEqual(labels, ["Alpha", "Mango", "Zebra"]);
});

// ── getCustomTracksSnapshot ───────────────────────────────────────────────────

test("getCustomTracksSnapshot returns deep copy (mutation does not affect registry)", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "mapper", label: "Mapper" }]);
  const snapshot = registry.getCustomTracksSnapshot();
  snapshot[0].label = "MUTATED";
  const snapshot2 = registry.getCustomTracksSnapshot();
  assert.equal(snapshot2[0].label, "Mapper");
});

// ── getTrackLookupByKey ───────────────────────────────────────────────────────

test("getTrackLookupByKey returns object keyed by track key", () => {
  const registry = makeRegistry(BASE_TRACKS);
  const lookup = registry.getTrackLookupByKey();
  assert.equal(lookup["tester"].label, "Tester");
  assert.equal(lookup["builder"].label, "Builder");
});

test("getTrackLookupByKey includes custom tracks", () => {
  const registry = makeRegistry(BASE_TRACKS);
  registry.setCustomTracks([{ key: "mapper", label: "Mapper" }]);
  const lookup = registry.getTrackLookupByKey();
  assert.ok("mapper" in lookup);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test("normalizeCustomTrackDefinition returns null for non-object input", () => {
  const registry = makeRegistry([]);
  assert.equal(registry.normalizeCustomTrackDefinition(null), null);
  assert.equal(registry.normalizeCustomTrackDefinition("string"), null);
  assert.equal(registry.normalizeCustomTrackDefinition(42), null);
});

test("normalizeCustomTrackDefinition returns null for empty key/label/name", () => {
  const registry = makeRegistry([]);
  assert.equal(registry.normalizeCustomTrackDefinition({ key: "" }), null);
  assert.equal(registry.normalizeCustomTrackDefinition({}), null);
});

test("setCustomTracks with null/undefined input clears custom tracks", () => {
  const registry = makeRegistry([]);
  registry.setCustomTracks([{ key: "alpha" }]);
  registry.setCustomTracks(null);
  assert.equal(registry.getCustomTracksSnapshot().length, 0);
});
