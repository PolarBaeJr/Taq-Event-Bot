const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  rotateFileBySize,
  pruneFilesByAge,
} = require("../src/lib/maintenanceManager");

test("rotateFileBySize rotates oversized control log", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taq-rotate-"));
  const target = path.join(dir, "control.log");
  fs.writeFileSync(target, "x".repeat(64), "utf8");

  const rotated = rotateFileBySize(target, 10, 3);
  assert.equal(rotated, true);
  assert.equal(fs.existsSync(`${target}.1`), true);
  assert.equal(fs.readFileSync(target, "utf8"), "");
});

test("pruneFilesByAge removes old files only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taq-prune-"));
  const oldFile = path.join(dir, "crash-old.log");
  const newFile = path.join(dir, "crash-new.log");
  fs.writeFileSync(oldFile, "old", "utf8");
  fs.writeFileSync(newFile, "new", "utf8");

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, twoDaysAgo, twoDaysAgo);

  const removed = pruneFilesByAge(dir, 1, /^crash-.*\.log$/);
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(newFile), true);
});
