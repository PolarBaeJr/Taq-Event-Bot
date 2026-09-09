/*
  Test coverage for deploy.test.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const deployer = require("../web/deploy");

test("deploy targets are a fixed, frozen set", () => {
  assert.deepEqual(deployer.TARGETS, { bot: "taq-event-bot", web: "taq-web" });
  assert.ok(Object.isFrozen(deployer.TARGETS));
});

test("restart refuses a target that is not one of ours", async () => {
  await assert.rejects(
    () => deployer.restart("../../etc/passwd", "web:test(1)"),
    /Unknown restart target/
  );
  await assert.rejects(() => deployer.restart("", "web:test(1)"), /Unknown restart target/);
});

test("status reports the checked-out repository", async () => {
  const state = await deployer.status({ fetch: false });
  assert.equal(typeof state.branch, "string");
  assert.match(state.commit, /^[0-9a-f]{7,}$|^unknown$/);
  assert.equal(typeof state.dirty, "boolean");
  assert.ok(Array.isArray(state.dirtyFiles));
});
