/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function writeState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

module.exports = writeState;
