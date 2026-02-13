/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function appendControlLogToFile(entry) {
  const logPath = path.resolve(config.controlLogFile);
  const logDir = path.dirname(logPath);
  if (logDir && logDir !== "." && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const line = `${JSON.stringify(entry)}\n`;
  fs.appendFileSync(logPath, line, "utf8");
}

module.exports = appendControlLogToFile;
