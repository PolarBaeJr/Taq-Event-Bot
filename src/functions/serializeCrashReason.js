/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function serializeCrashReason(reason) {
  if (reason instanceof Error) {
    return {
      type: "Error",
      name: reason.name,
      message: reason.message,
      code: reason.code || null,
      stack: reason.stack || null,
    };
  }

  if (typeof reason === "string") {
    return {
      type: "string",
      value: reason,
    };
  }

  try {
    return {
      type: typeof reason,
      value: JSON.stringify(reason, null, 2),
    };
  } catch {
    return {
      type: typeof reason,
      value: String(reason),
    };
  }
}

module.exports = serializeCrashReason;
