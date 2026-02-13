/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function makeApplicationContent(headers, row) {
  const answered = extractAnsweredFields(headers, row);
  if (answered.length === 0) {
    return "No answered questions.";
  }
  return answered.map(({ key, value }) => `${key}: ${value}`).join("\n\n");
}

module.exports = makeApplicationContent;
