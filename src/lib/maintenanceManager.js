/*
  Core module for maintenance manager.
*/

const fs = require("node:fs");
const path = require("node:path");

// ensureDirectory: handles ensure directory.
function ensureDirectory(dirPath) {
  if (!dirPath) {
    return;
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// rotateFileBySize: handles rotate file by size.
function rotateFileBySize(filePath, maxBytes, maxFiles) {
  if (!filePath || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    return false;
  }
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stats = fs.statSync(filePath);
  if (stats.size <= maxBytes) {
    return false;
  }

  const keepFiles = Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : 5;
  for (let index = keepFiles - 1; index >= 1; index -= 1) {
    const src = `${filePath}.${index}`;
    const dest = `${filePath}.${index + 1}`;
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
    }
  }

  fs.renameSync(filePath, `${filePath}.1`);
  fs.writeFileSync(filePath, "", "utf8");
  return true;
}

// pruneFilesByAge: handles prune files by age.
function pruneFilesByAge(directory, maxAgeDays, filePattern = null) {
  if (!directory || !fs.existsSync(directory) || !Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    return [];
  }
  const maxAgeMs = Math.floor(maxAgeDays * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const removed = [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (filePattern && !filePattern.test(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    const stats = fs.statSync(fullPath);
    if (now - stats.mtimeMs <= maxAgeMs) {
      continue;
    }
    fs.unlinkSync(fullPath);
    removed.push(fullPath);
  }

  return removed;
}

// createMaintenanceManager: handles create maintenance manager.
function createMaintenanceManager(options = {}) {
  const controlLogFile = options.controlLogFile
    ? path.resolve(options.controlLogFile)
    : null;
  const crashLogDir = options.crashLogDir ? path.resolve(options.crashLogDir) : null;
  const controlLogMaxBytes =
    Number.isInteger(options.controlLogMaxBytes) && options.controlLogMaxBytes > 0
      ? options.controlLogMaxBytes
      : 5 * 1024 * 1024;
  const controlLogMaxFiles =
    Number.isInteger(options.controlLogMaxFiles) && options.controlLogMaxFiles > 0
      ? options.controlLogMaxFiles
      : 5;
  const logRetentionDays =
    Number.isFinite(options.logRetentionDays) && options.logRetentionDays > 0
      ? Number(options.logRetentionDays)
      : 14;
  const crashLogRetentionDays =
    Number.isFinite(options.crashLogRetentionDays) && options.crashLogRetentionDays > 0
      ? Number(options.crashLogRetentionDays)
      : 30;
  const logger =
    options.logger &&
    typeof options.logger.info === "function" &&
    typeof options.logger.error === "function"
      ? options.logger
      : null;

  // runMaintenance: handles run maintenance.
  async function runMaintenance(reason = "scheduled") {
    const summary = {
      reason,
      rotatedControlLog: false,
      removedCrashLogs: 0,
      removedOldControlLogs: 0,
    };

    try {
      if (controlLogFile) {
        ensureDirectory(path.dirname(controlLogFile));
        summary.rotatedControlLog = rotateFileBySize(
          controlLogFile,
          controlLogMaxBytes,
          controlLogMaxFiles
        );
        const removed = pruneFilesByAge(
          path.dirname(controlLogFile),
          logRetentionDays,
          new RegExp(`^${escapeRegExp(path.basename(controlLogFile))}\\.\\d+$`)
        );
        summary.removedOldControlLogs = removed.length;
      }

      if (crashLogDir) {
        ensureDirectory(crashLogDir);
        const removedCrashLogs = pruneFilesByAge(
          crashLogDir,
          crashLogRetentionDays,
          /^crash-.*\.log$/
        );
        summary.removedCrashLogs = removedCrashLogs.length;
      }
    } catch (err) {
      if (logger) {
        logger.error("maintenance_run_failed", "Maintenance run failed.", {
          reason,
          error: err?.message || String(err),
        });
      }
      throw err;
    }

    if (logger) {
      logger.info("maintenance_run_completed", "Maintenance run completed.", summary);
    }
    return summary;
  }

  return {
    runMaintenance,
  };
}

// escapeRegExp: handles escape reg exp.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  createMaintenanceManager,
  rotateFileBySize,
  pruneFilesByAge,
};
