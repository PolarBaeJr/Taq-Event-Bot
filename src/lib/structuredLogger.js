/*
  Core module for structured logger.
*/

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

// createStructuredLogger: handles create structured logger.
function createStructuredLogger(options = {}) {
  const baseContext = normalizeContext(options.baseContext);

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
      return payload;
    }
    if (payload.level === "warn") {
      console.warn(line);
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
    child(context = {}) {
      return createStructuredLogger({
        baseContext: {
          ...baseContext,
          ...normalizeContext(context),
        },
      });
    },
  };
}

module.exports = {
  createStructuredLogger,
  serializeError,
};
