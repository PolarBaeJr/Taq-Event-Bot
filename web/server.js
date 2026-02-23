"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });

// ── Web error logger ──────────────────────────────────────────────────────────
const WEB_ERROR_LOG_FILE = path.resolve(
  process.env.WEB_ERROR_LOG_FILE || path.join(__dirname, "../logs/web-errors.log")
);

function appendWebError(entry) {
  try {
    const dir = path.dirname(WEB_ERROR_LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(WEB_ERROR_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch { /* never throw from error logger */ }
}

function logWebError(source, err, extra = {}) {
  appendWebError({
    timestamp: new Date().toISOString(),
    level: "error",
    source,
    message: err?.message || String(err),
    stack: err?.stack || null,
    ...extra,
  });
}

// Capture unhandled web process errors
process.on("uncaughtException", (err) => {
  logWebError("uncaughtException", err);
  console.error("[web] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logWebError("unhandledRejection", err);
  console.error("[web] unhandledRejection:", reason);
});

const express = require("express");
const session = require("express-session");
const { google } = require("googleapis");
const { COMMON_FIELDS, TRACK_QUESTIONS, TRACK_LABELS } = require("./questions");
const { loadCustomQuestions, bootstrapAdminIfNeeded, seedQuestionsFromDefaults } = require("./auth");
const adminRouter = require("./admin");

function resolvePort() {
  const raw = process.env.PORT ?? process.env.WEB_PORT;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
    return parsed;
  }
  return 3000;
}

const PORT = resolvePort();
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME;
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const HTTPS_KEY_FILE = process.env.HTTPS_KEY_FILE;
const HTTPS_CERT_FILE = process.env.HTTPS_CERT_FILE;
const HTTPS_KEY_PEM = process.env.HTTPS_KEY_PEM;
const HTTPS_CERT_PEM = process.env.HTTPS_CERT_PEM;
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "../.bot-state.json");

// ── Custom tracks (from bot state) ────────────────────────────────────────────

function loadCustomTracks() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const state = JSON.parse(raw);
    const customTracks = state?.settings?.customTracks;
    if (Array.isArray(customTracks)) return customTracks;
  } catch { /* state file missing or unreadable — use built-in tracks only */ }
  return [];
}

function getAllTrackLabels() {
  const labels = { ...TRACK_LABELS };
  for (const track of loadCustomTracks()) {
    if (track.key && track.label && !labels[track.key]) {
      labels[track.key] = track.label;
    }
  }
  return labels;
}

// ── Google Sheets auth ────────────────────────────────────────────────────────

function createSheetsClient() {
  let credentials;
  if (SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
  } else if (SERVICE_ACCOUNT_FILE) {
    credentials = require(path.resolve(SERVICE_ACCOUNT_FILE));
  } else {
    throw new Error("No Google service account configured.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getSheetHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });
  return (res.data.values || [[]])[0] || [];
}

async function appendRow(sheets, rowValues) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowValues] },
  });
}

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function loadHttpsOptions() {
  const hasPemEnv = Boolean(HTTPS_KEY_PEM || HTTPS_CERT_PEM);
  const hasFileEnv = Boolean(HTTPS_KEY_FILE || HTTPS_CERT_FILE);

  if (hasPemEnv && hasFileEnv) {
    throw new Error("Use either HTTPS_*_PEM or HTTPS_*_FILE variables, not both.");
  }

  if (hasPemEnv) {
    if (!HTTPS_KEY_PEM || !HTTPS_CERT_PEM) {
      throw new Error("Both HTTPS_KEY_PEM and HTTPS_CERT_PEM are required for HTTPS.");
    }
    return {
      key: normalizePem(HTTPS_KEY_PEM),
      cert: normalizePem(HTTPS_CERT_PEM),
    };
  }

  if (hasFileEnv) {
    if (!HTTPS_KEY_FILE || !HTTPS_CERT_FILE) {
      throw new Error("Both HTTPS_KEY_FILE and HTTPS_CERT_FILE are required for HTTPS.");
    }
    return {
      key: fs.readFileSync(path.resolve(HTTPS_KEY_FILE)),
      cert: fs.readFileSync(path.resolve(HTTPS_CERT_FILE)),
    };
  }

  return null;
}

// Returns all fields for a track using custom questions as the primary source.
// Falls back to hardcoded defaults if not yet seeded (e.g. first run before state file exists).
function buildAllFields(trackKey) {
  const cq = loadCustomQuestions();
  const commonPart = Array.isArray(cq["__default__"]) ? cq["__default__"] : COMMON_FIELDS;
  const trackPart = Array.isArray(cq[trackKey]) ? cq[trackKey] : (TRACK_QUESTIONS[trackKey] || []);
  return [...commonPart, ...trackPart];
}

// Build a sheet row from form data, respecting the existing header column order.
// New columns not already in the sheet are appended at the end.
function buildRow(headers, trackKey, formData) {
  const allFields = buildAllFields(trackKey);

  // Map field id → value from form submission.
  const valueById = {};
  for (const field of allFields) {
    valueById[field.id] = String(formData[field.id] || "").trim();
  }

  const timestamp = new Date().toISOString();
  const trackLabel = getAllTrackLabels()[trackKey] || trackKey;

  // Special columns: Timestamp and "Applying For" / track column.
  const specialValues = {
    timestamp,
    applying_for: trackLabel,
  };

  // Build a lookup: normalised header text → column index.
  const normalize = (s) => String(s || "").toLowerCase().trim();
  const headerIndex = new Map(headers.map((h, i) => [normalize(h), i]));

  // Start with an array sized to the existing header count.
  const row = new Array(headers.length).fill("");

  // Fill timestamp column (matches "timestamp").
  const tsIdx = headerIndex.get("timestamp");
  if (tsIdx !== undefined) row[tsIdx] = timestamp;

  // Fill "Applying For" column.
  for (const [normHeader, idx] of headerIndex) {
    if (
      normHeader.includes("applying for") ||
      normHeader.includes("apply for") ||
      normHeader.includes("what are you applying") ||
      normHeader.includes("position") ||
      normHeader.includes("applying for?")
    ) {
      row[idx] = trackLabel;
      break;
    }
  }

  // Fill each form field by matching its sheetHeader to the existing headers.
  for (const field of allFields) {
    const value = valueById[field.id];
    if (!value) continue;

    const normTarget = normalize(field.sheetHeader);
    let matched = false;

    // Try exact match first, then partial.
    for (const [normHeader, idx] of headerIndex) {
      if (normHeader === normTarget || normHeader.includes(normTarget) || normTarget.includes(normHeader)) {
        row[idx] = value;
        matched = true;
        break;
      }
    }

    // If no match, append as a new column (extend the row).
    if (!matched) {
      row.push(value);
    }
  }

  return row;
}

// ── HTML templates ────────────────────────────────────────────────────────────

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escHtml(title)} — TAq Applications</title>
  <link rel="stylesheet" href="/style.css?v=portal-base-2"/>
  <link rel="stylesheet" href="/portal.css?v=portal-aq-2"/>
</head>
<body class="portal-body">
  <nav class="site-topbar">
    <div class="topbar-shell">
      <a href="https://www.the-aquarium.com/" class="topbar-logo topbar-home" target="_blank" rel="noopener noreferrer" aria-label="The Aquarium Home">
        <img src="https://www.the-aquarium.com/images/guildimages/icontransparent.png" alt="Home" class="topbar-logo-img" width="34" height="34"/>
      </a>
      <div class="topbar-links" aria-label="The Aquarium navigation">
        <a href="https://www.the-aquarium.com/members" target="_blank" rel="noopener noreferrer">Members</a>
        <a href="https://www.the-aquarium.com/leaderboard" target="_blank" rel="noopener noreferrer">Leaderboard</a>
        <a href="https://www.the-aquarium.com/graid-event" target="_blank" rel="noopener noreferrer">Graid Event</a>
        <a href="https://www.the-aquarium.com/map" target="_blank" rel="noopener noreferrer">Map</a>
        <a href="https://www.the-aquarium.com/lootpools" target="_blank" rel="noopener noreferrer">Lootpools</a>
      </div>
      <a href="https://discord.gg/njRpZwKVaa" class="topbar-cta" target="_blank" rel="noopener noreferrer">Apply</a>
    </div>
  </nav>
  <div class="portal-stage">
    <div class="page">
      <header class="portal-header">
        <a href="https://www.the-aquarium.com/" target="_blank" rel="noopener noreferrer" class="header-logo-link">
          <img src="https://www.the-aquarium.com/images/guildimages/icontransparent.png" alt="The Aquarium" class="header-logo" width="80" height="80"/>
        </a>
        <div class="portal-header-copy">
          <p class="subtitle">Application Portal</p>
          <h1>TAq Event Team</h1>
          <p class="header-lead">Apply to help build, test, and run Aquarium events with the TAq crew.</p>
        </div>
      </header>
      <main class="portal-main">${body}</main>
      <footer class="portal-footer"><p>Applications are reviewed by the TAq team. Good luck!</p></footer>
    </div>
  </div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderField(field) {
  const req = field.required ? ' <span class="req">*</span>' : "";
  const requiredAttr = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${escHtml(field.placeholder)}"` : "";

  if (field.type === "textarea") {
    return `
    <div class="field">
      <label for="${escHtml(field.id)}">${escHtml(field.label)}${req}</label>
      <textarea id="${escHtml(field.id)}" name="${escHtml(field.id)}" rows="4"${requiredAttr}${placeholder}></textarea>
    </div>`;
  }

  if (field.type === "select") {
    const options = (field.options || [])
      .map((o) => `<option value="${escHtml(o)}">${escHtml(o)}</option>`)
      .join("");
    return `
    <div class="field">
      <label for="${escHtml(field.id)}">${escHtml(field.label)}${req}</label>
      <select id="${escHtml(field.id)}" name="${escHtml(field.id)}"${requiredAttr}>
        <option value="" disabled selected>Select an option</option>
        ${options}
      </select>
    </div>`;
  }

  // Default: text input
  return `
    <div class="field">
      <label for="${escHtml(field.id)}">${escHtml(field.label)}${req}</label>
      <input type="text" id="${escHtml(field.id)}" name="${escHtml(field.id)}"${requiredAttr}${placeholder}/>
    </div>`;
}

function indexPage() {
  const trackCards = Object.entries(getAllTrackLabels())
    .map(([key, label]) => `
      <a class="track-card" href="/apply/${escHtml(key)}">
        <span class="track-name">${escHtml(label)}</span>
        <span class="track-arrow">→</span>
      </a>`)
    .join("");

  return layout("Apply", `
    <section class="content-panel role-panel">
      <div class="panel-headline">
        <h2>Open Roles</h2>
        <span class="panel-chip">${Object.keys(getAllTrackLabels()).length} tracks</span>
      </div>
      <p class="intro-copy">Select the role you are applying for below and complete the form.</p>
      <div class="track-list">${trackCards}</div>
    </section>
  `);
}

function formPage(trackKey, trackLabel, error) {
  const allFields = buildAllFields(trackKey);
  const fieldHtml = allFields.map(renderField).join("");
  const errorHtml = error
    ? `<div class="error-banner">${escHtml(error)}</div>`
    : "";

  return layout(`Apply — ${trackLabel}`, `
    <section class="content-panel form-panel">
      <div class="panel-headline panel-headline-stack">
        <a class="back-link" href="/">← Back</a>
        <span class="panel-chip">Role Application</span>
      </div>
      <h2>Apply for ${escHtml(trackLabel)}</h2>
      <p class="form-note">Fields marked <span class="req">*</span> are required.</p>
      ${errorHtml}
      <form method="POST" action="/apply/${escHtml(trackKey)}" class="application-form">
        ${fieldHtml}
        <button type="submit" class="submit-btn">Submit Application</button>
      </form>
    </section>
  `);
}

function successPage(trackLabel) {
  return layout("Application Submitted", `
    <section class="content-panel success-panel">
      <div class="success-box">
        <div class="success-icon">✓</div>
        <h2>Application Submitted!</h2>
        <p>Thanks for applying for <strong>${escHtml(trackLabel)}</strong>. The team will review your application and reach out via Discord.</p>
        <a class="back-link" href="/">← Submit another application</a>
      </div>
    </section>
  `);
}

// ── Express app ───────────────────────────────────────────────────────────────

bootstrapAdminIfNeeded();
seedQuestionsFromDefaults();

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,    // not accessible via document.cookie (blocks XSS theft)
    sameSite: "strict", // not sent on cross-site requests (blocks CSRF)
    secure: Boolean(HTTPS_KEY_PEM || HTTPS_CERT_PEM || HTTPS_KEY_FILE || HTTPS_CERT_FILE), // HTTPS-only when TLS is configured
  },
}));

app.use("/admin", adminRouter);

app.get("/", (_req, res) => {
  res.send(indexPage());
});

app.get("/apply/:track", (req, res) => {
  const trackKey = req.params.track;
  const allTrackLabels = getAllTrackLabels();
  if (!allTrackLabels[trackKey]) {
    return res.status(404).send(layout("Not Found", "<p>Track not found. <a href='/'>Go back</a></p>"));
  }
  res.send(formPage(trackKey, allTrackLabels[trackKey], null));
});

app.post("/apply/:track", async (req, res) => {
  const trackKey = req.params.track;
  const allTrackLabels = getAllTrackLabels();
  if (!allTrackLabels[trackKey]) {
    return res.status(404).send(layout("Not Found", "<p>Track not found. <a href='/'>Go back</a></p>"));
  }

  const trackLabel = allTrackLabels[trackKey];

  // Basic server-side required field check.
  const allFields = buildAllFields(trackKey);
  const missing = allFields
    .filter((f) => f.required && !String(req.body[f.id] || "").trim())
    .map((f) => f.label);

  if (missing.length > 0) {
    return res.send(formPage(trackKey, trackLabel, `Please fill in: ${missing.join(", ")}`));
  }

  try {
    const sheets = createSheetsClient();
    const headers = await getSheetHeaders(sheets);
    const row = buildRow(headers, trackKey, req.body);
    await appendRow(sheets, row);
    res.redirect(`/success?track=${encodeURIComponent(trackKey)}`);
  } catch (err) {
    console.error("Sheet append failed:", err.message);
    res.send(formPage(trackKey, trackLabel, "Submission failed — please try again or contact an admin."));
  }
});

app.get("/success", (req, res) => {
  const trackKey = req.query.track;
  const trackLabel = getAllTrackLabels()[trackKey] || "the team";
  res.send(successPage(trackLabel));
});

// Express error handler — catches errors thrown by route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logWebError("express_route", err, {
    method: req.method,
    url: req.originalUrl,
  });
  console.error("[web] Express route error:", err);
  res.status(500).send("Internal server error.");
});

let tlsOptions = null;
try {
  tlsOptions = loadHttpsOptions();
} catch (err) {
  console.error(`HTTPS configuration error: ${err.message}`);
  process.exit(1);
}

const server = tlsOptions
  ? https.createServer(tlsOptions, app)
  : http.createServer(app);

server.listen(PORT, () => {
  const protocol = tlsOptions ? "https" : "http";
  console.log(`TAq application portal running on ${protocol}://localhost:${PORT}`);
  if (!tlsOptions && PORT === 443) {
    console.warn("Port 443 is configured without TLS. Set HTTPS_KEY_FILE/HTTPS_CERT_FILE to serve HTTPS directly.");
  }
});

server.on("error", (err) => {
  logWebError("server_bind", err, { port: PORT });

  if (err && err.code === "EACCES" && PORT < 1024) {
    console.error(
      `Cannot bind to port ${PORT} without elevated privileges. ` +
      "Use a reverse proxy (Nginx/Cloudflare) or run with the required permissions."
    );
    process.exit(1);
  }

  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }

  console.error("Web server failed to start:", err);
  process.exit(1);
});
