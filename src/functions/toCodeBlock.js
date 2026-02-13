/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function toCodeBlock(text) {
  const safe = String(text || "").replace(/```/g, "``\u200b`");
  return `\`\`\`txt\n${safe}\n\`\`\``;
}

module.exports = toCodeBlock;
