/*
  Core module for structured logger.
*/

const fs = require("node:fs");
const path = require("node:path");

function normalizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return {};
  }
  return context;
}

// serializeError: handles serialize error.
function serializeError(error) {
  if (!error) {
    return null;
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack : undefined,
    };
  }
  return {
    message: String(error),
  };
}

// appendToLogFile: safely appends a JSON line to a log file, creating dirs as needed.
function appendToLogFile(filePath, line) {
  try {
    const dir = path.dirname(path.resolve(filePath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(filePath, line + "\n");
  } catch {
    // Never throw from a logger
  }
}

// createStructuredLogger: handles create structured logger.
function createStructuredLogger(options = {}) {
  const baseContext = normalizeContext(options.baseContext);
  // When set, error and warn level entries are also written to this file (NDJSON).
  const errorLogFile = typeof options.errorLogFile === "string" && options.errorLogFile.trim()
    ? options.errorLogFile.trim()
    : null;

  // emit: handles emit.
  function emit(level, event, message, context = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: String(level || "info"),
      event: String(event || "log"),
      message: String(message || ""),
      ...baseContext,
      ...normalizeContext(context),
    };
    const line = JSON.stringify(payload);

    if (payload.level === "error") {
      console.error(line);
      if (errorLogFile) appendToLogFile(errorLogFile, line);
      return payload;
    }
    if (payload.level === "warn") {
      console.warn(line);
      if (errorLogFile) appendToLogFile(errorLogFile, line);
      return payload;
    }
    console.log(line);
    return payload;
  }

  return {
    emit,
    info(event, message, context = {}) {
      return emit("info", event, message, context);
    },
    warn(event, message, context = {}) {
      return emit("warn", event, message, context);
    },
    error(event, message, context = {}) {
      return emit("error", event, message, context);
    },
    child(childContext = {}) {
      return createStructuredLogger({
        baseContext: {
          ...baseContext,
          ...normalizeContext(childContext),
        },
        errorLogFile,
      });
    },
  };
}

module.exports = {
  createStructuredLogger,
  serializeError,
};
