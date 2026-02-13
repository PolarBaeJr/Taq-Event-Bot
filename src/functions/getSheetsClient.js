/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function getSheetsClient() {
  let authOptions;
  if (config.serviceAccountJson) {
    const raw = config.serviceAccountJson.trim();
    const decoded = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    authOptions = {
      credentials: JSON.parse(decoded),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  } else {
    const keyPath = path.resolve(config.serviceAccountKeyFile);
    authOptions = {
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    };
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  return google.sheets({ version: "v4", auth });
}

module.exports = getSheetsClient;
