/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function joinEmbedDescription(lines, maxLength = 3500) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "n/a";
  }
  const out = [];
  let remaining = maxLength;
  for (const rawLine of lines) {
    const line = String(rawLine ?? "").trim();
    if (!line) {
      continue;
    }
    const cost = line.length + (out.length > 0 ? 1 : 0);
    if (cost > remaining) {
      out.push("...[truncated]");
      break;
    }
    out.push(line);
    remaining -= cost;
  }
  return out.length > 0 ? out.join("\n") : "n/a";
}

module.exports = joinEmbedDescription;
