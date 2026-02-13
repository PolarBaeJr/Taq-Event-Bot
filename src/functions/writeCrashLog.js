/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function writeCrashLog(kind, reason, extra = null) {
  const at = new Date();
  const crashDir = path.resolve(config.crashLogDir || "crashlog");
  if (!fs.existsSync(crashDir)) {
    fs.mkdirSync(crashDir, { recursive: true });
  }

  const baseName = `crash-${toCrashFileTimestamp(at)}`;
  let crashPath = path.join(crashDir, `${baseName}.log`);
  let suffix = 1;
  while (fs.existsSync(crashPath)) {
    crashPath = path.join(crashDir, `${baseName}-${suffix}.log`);
    suffix += 1;
  }

  const payload = {
    kind,
    at: at.toISOString(),
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    reason: serializeCrashReason(reason),
    extra: extra || null,
  };

  fs.writeFileSync(crashPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return crashPath;
}

module.exports = writeCrashLog;
