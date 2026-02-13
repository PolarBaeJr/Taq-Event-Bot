/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function sendDebugDm(user, text) {
  const chunks = splitMessageByLength(text);
  for (const chunk of chunks) {
    await user.send(chunk);
  }
}

module.exports = sendDebugDm;
