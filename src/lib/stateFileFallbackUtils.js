/*
  Core module for state file fallback utils.
*/

const fs = require("node:fs");
const path = require("node:path");

// createStateFileFallbackUtils: handles create state file fallback utils.
function createStateFileFallbackUtils(options = {}) {
  const config = options.config && typeof options.config === "object"
    ? options.config
    : {};
  const stateFileFallbackBasename = String(
    options.stateFileFallbackBasename || "taq-event-team-bot-state.json"
  );
  const warn = typeof options.warn === "function" ? options.warn : console.warn;
  let didWarnStateFileFallback = false;

  // getWritableStateFileFallbackPath: handles get writable state file fallback path.
  function getWritableStateFileFallbackPath() {
    const fallbackDirs = [
      process.env.STATE_FILE_FALLBACK_DIR,
      process.env.TMPDIR,
      process.env.TMP,
      process.env.TEMP,
      "/tmp",
    ];
    const seenDirs = new Set();

    for (const fallbackDir of fallbackDirs) {
      if (typeof fallbackDir !== "string" || !fallbackDir.trim()) {
        continue;
      }

      const resolvedDir = path.resolve(fallbackDir);
      if (seenDirs.has(resolvedDir)) {
        continue;
      }
      seenDirs.add(resolvedDir);

      try {
        fs.mkdirSync(resolvedDir, { recursive: true });
        fs.accessSync(resolvedDir, fs.constants.W_OK);
        return path.join(resolvedDir, stateFileFallbackBasename);
      } catch {
        continue;
      }
    }

    return null;
  }

  // isStateFilePermissionError: handles is state file permission error.
  function isStateFilePermissionError(err) {
    return Boolean(
      err &&
        typeof err === "object" &&
        (err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM")
    );
  }

  // switchStateFileToWritableFallback: handles switch state file to writable fallback.
  function switchStateFileToWritableFallback() {
    const fallbackPath = getWritableStateFileFallbackPath();
    if (!fallbackPath || fallbackPath === config.stateFile) {
      return false;
    }

    const previousPath = config.stateFile;
    config.stateFile = fallbackPath;
    if (!didWarnStateFileFallback) {
      didWarnStateFileFallback = true;
      warn(
        `State file path '${previousPath}' is not writable. Falling back to '${fallbackPath}'. Set STATE_FILE to a persistent writable path.`
      );
    }

    return true;
  }

  return {
    isStateFilePermissionError,
    switchStateFileToWritableFallback,
  };
}

module.exports = {
  createStateFileFallbackUtils,
};
