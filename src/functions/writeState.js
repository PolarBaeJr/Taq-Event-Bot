/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function writeState(state) {
  ensureExtendedSettingsContainers(state);
  const serialized = JSON.stringify(state, null, 2);
  const writeToPath = (stateFilePath) => {
    const stateDir = path.dirname(path.resolve(stateFilePath));
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(stateFilePath, serialized);
  };

  try {
    writeToPath(config.stateFile);
  } catch (err) {
    if (!isStateFilePermissionError(err) || !switchStateFileToWritableFallback()) {
      throw err;
    }
    writeToPath(config.stateFile);
  }
}

module.exports = writeState;
