/*
  Test coverage for backup manager.test.
*/

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createBackupManager } = require("../src/lib/backupManager");

test("backup manager writes state and config backups", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taq-backup-"));
  const stateFile = path.join(root, "state.json");
  const backupDir = path.join(root, "backups");
  fs.writeFileSync(stateFile, JSON.stringify({ hello: "world" }, null, 2), "utf8");

  const manager = createBackupManager({
    enabled: true,
    stateBackupEnabled: true,
    configBackupEnabled: true,
    stateFile,
    backupDir,
    maxFiles: 2,
    exportAdminConfig: () => JSON.stringify({ settings: { enabled: true } }),
    readState: () => ({ from: "reader" }),
  });

  const summary = await manager.runBackup("test");
  assert.equal(summary.ok, true);
  assert.equal(fs.existsSync(summary.statePath), true);
  assert.equal(fs.existsSync(summary.configPath), true);
});
