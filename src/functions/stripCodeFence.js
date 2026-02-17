/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function stripCodeFence(raw) {
  const text = String(raw || "").trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) {
    return fenced[1];
  }
  return text;
}

module.exports = stripCodeFence;
