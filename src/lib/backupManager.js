const fs = require("node:fs");
const path = require("node:path");

function toBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDirectory(dirPath) {
  if (!dirPath) {
    return;
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function listFilesByPrefix(directory, prefix) {
  if (!directory || !fs.existsSync(directory)) {
    return [];
  }
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function pruneOldBackupsByCount(directory, prefix, maxFiles) {
  const keep = Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : 60;
  const files = listFilesByPrefix(directory, prefix);
  const removed = [];
  for (let i = keep; i < files.length; i += 1) {
    fs.unlinkSync(files[i].path);
    removed.push(files[i].path);
  }
  return removed;
}

function createBackupManager(options = {}) {
  const enabled = options.enabled !== false;
  const stateBackupEnabled = options.stateBackupEnabled !== false;
  const configBackupEnabled = options.configBackupEnabled !== false;
  const backupDir = path.resolve(options.backupDir || "backups");
  const stateFilePathResolver =
    typeof options.getStateFilePath === "function"
      ? () => path.resolve(options.getStateFilePath() || ".bot-state.json")
      : () => path.resolve(options.stateFile || ".bot-state.json");
  const readState =
    typeof options.readState === "function"
      ? options.readState
      : () => ({});
  const exportAdminConfig =
    typeof options.exportAdminConfig === "function"
      ? options.exportAdminConfig
      : () => "{}";
  const maxFiles =
    Number.isInteger(options.maxFiles) && options.maxFiles > 0 ? options.maxFiles : 60;
  const logger =
    options.logger &&
    typeof options.logger.info === "function" &&
    typeof options.logger.warn === "function" &&
    typeof options.logger.error === "function"
      ? options.logger
      : null;

  async function runBackup(reason = "scheduled") {
    if (!enabled) {
      return {
        ok: false,
        reason: "disabled",
      };
    }

    ensureDirectory(backupDir);
    const stamp = toBackupTimestamp();
    const summary = {
      ok: true,
      reason,
      backupDir,
      statePath: null,
      configPath: null,
      removedStateBackups: 0,
      removedConfigBackups: 0,
    };

    try {
      if (stateBackupEnabled) {
        const stateFile = stateFilePathResolver();
        const stateBackupPath = path.join(backupDir, `state-${stamp}.json`);
        if (fs.existsSync(stateFile)) {
          fs.copyFileSync(stateFile, stateBackupPath);
        } else {
          fs.writeFileSync(
            stateBackupPath,
            `${JSON.stringify(readState(), null, 2)}\n`,
            "utf8"
          );
        }
        summary.statePath = stateBackupPath;
      }

      if (configBackupEnabled) {
        const configBackupPath = path.join(backupDir, `config-${stamp}.json`);
        const configText = String(exportAdminConfig() || "{}").trim() || "{}";
        fs.writeFileSync(configBackupPath, `${configText}\n`, "utf8");
        summary.configPath = configBackupPath;
      }

      const removedState = pruneOldBackupsByCount(backupDir, "state-", maxFiles);
      const removedConfig = pruneOldBackupsByCount(backupDir, "config-", maxFiles);
      summary.removedStateBackups = removedState.length;
      summary.removedConfigBackups = removedConfig.length;

      if (logger) {
        logger.info("backup_completed", "Backup completed.", summary);
      }
      return summary;
    } catch (err) {
      if (logger) {
        logger.error("backup_failed", "Backup failed.", {
          reason,
          backupDir,
          error: err?.message || String(err),
        });
      }
      return {
        ok: false,
        reason,
        error: err?.message || String(err),
      };
    }
  }

  return {
    enabled,
    runBackup,
  };
}

module.exports = {
  createBackupManager,
  toBackupTimestamp,
};
