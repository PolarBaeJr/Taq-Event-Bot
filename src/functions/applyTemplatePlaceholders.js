/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function applyTemplatePlaceholders(template, replacements) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(replacements || {})) {
    const safeKey = escapeRegExp(String(key));
    const regex = new RegExp(`\\{${safeKey}\\}`, "g");
    output = output.replace(regex, String(value ?? ""));
  }
  return output;
}

module.exports = applyTemplatePlaceholders;
