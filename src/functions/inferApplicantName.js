/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function inferApplicantName(headers, row) {
  const candidates = ["name", "full name", "applicant", "discord name"];
  for (let i = 0; i < headers.length; i += 1) {
    const h = String(headers[i] || "").toLowerCase();
    if (candidates.some((c) => h.includes(c)) && row[i]) {
      return String(row[i]);
    }
  }
  return "Applicant";
}

module.exports = inferApplicantName;
