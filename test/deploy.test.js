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

test("image update refuses a mode it was not given", async () => {
  await assert.rejects(() => deployer.updateImage("rm -rf /", "web:someone"), /Unknown image update mode/);
  await assert.rejects(() => deployer.updateImage("", "web:someone"), /Unknown image update mode/);
  await assert.rejects(() => deployer.updateImage("PULL", "web:someone"), /Unknown image update mode/);
});

test("image identifiers are fixed, not caller-supplied", () => {
  assert.equal(deployer.COMPOSE_SERVICE, "taq-event");
  assert.equal(deployer.IMAGE_TAG, "ghcr.io/polarbaejr/taq-event-bot:latest");
  // A tag a request could influence is the whole risk here; both are module constants.
  assert.equal(typeof deployer.IMAGE_TAG, "string");
});

test("image status answers even with no daemon", async () => {
  const status = await deployer.imageStatus();
  assert.equal(typeof status.available, "boolean");
  if (status.available) {
    assert.equal(status.service, "taq-event");
    assert.equal(typeof status.stale, "boolean");
  } else {
    assert.ok(status.error, "an unavailable daemon has to say why");
  }
});
