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
  <script>
    (function () {
      try {
        var savedTheme = localStorage.getItem("theme");
        var theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
        document.documentElement.setAttribute("data-theme", theme);
      } catch (_err) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    })();
  </script>
  <link rel="stylesheet" href="/style.css?v=portal-base-2"/>
  <link rel="stylesheet" href="/portal.css?v=portal-aq-7"/>
</head>
<body class="portal-body">
  <nav class="nav-font aquarium-nav" style="width:100%;background:var(--bg-nav);padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);position:relative">
    <div style="display:flex;align-items:center;gap:2rem">
      <a style="text-decoration: none; transition: 0.3s; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%); box-shadow: rgba(0, 0, 0, 0.15) 0px 2px 8px, rgba(255, 255, 255, 0.1) 0px 1px 2px inset; border: 1px solid rgba(255, 255, 255, 0.1); transform: scale(1);" href="https://www.the-aquarium.com/" target="_blank" rel="noopener noreferrer" aria-label="Home">
        <img src="https://www.the-aquarium.com/images/guildimages/icontransparent.png" alt="Home" style="width:42px;height:42px;object-fit:contain;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.2))"/>
      </a>
      <div class="desktop-nav" style="display:flex;gap:1.5rem;align-items:center">
        <a style="color: var(--text-primary); font-weight: bold; font-size: 1.125rem; text-decoration: none; transition: 0.3s; padding: 8px 12px; border-radius: 6px; background: none; box-shadow: none;" href="https://www.the-aquarium.com/members" target="_blank" rel="noopener noreferrer">Members</a>
        <a style="color: var(--text-primary); font-weight: bold; font-size: 1.125rem; text-decoration: none; transition: 0.3s; padding: 8px 12px; border-radius: 6px; background: none; box-shadow: none;" href="https://www.the-aquarium.com/leaderboard" target="_blank" rel="noopener noreferrer">Leaderboard</a>
        <a style="color: var(--text-primary); font-weight: bold; font-size: 1.125rem; text-decoration: none; transition: 0.3s; padding: 8px 12px; border-radius: 6px; background: none; box-shadow: none;" href="https://www.the-aquarium.com/graid-event" target="_blank" rel="noopener noreferrer">Graid Event</a>
        <a style="color: var(--text-primary); font-weight: bold; font-size: 1.125rem; text-decoration: none; transition: 0.3s; padding: 8px 12px; border-radius: 6px; background: none; box-shadow: none;" href="https://www.the-aquarium.com/map" target="_blank" rel="noopener noreferrer">Map</a>
        <a style="color: var(--text-primary); font-weight: bold; font-size: 1.125rem; text-decoration: none; transition: 0.3s; padding: 8px 12px; border-radius: 6px; background: none; box-shadow: none;" href="https://www.the-aquarium.com/lootpools" target="_blank" rel="noopener noreferrer">Lootpools</a>
      </div>
    </div>
    <div class="aquarium-nav-actions" style="display:flex;align-items:center;gap:1rem">
      <a href="https://discord.gg/njRpZwKVaa" target="_blank" rel="noopener noreferrer" class="mobile-apply-button" style="padding: 8px 16px; background: linear-gradient(135deg, rgb(88, 101, 242) 0%, rgb(71, 82, 196) 100%); color: white; text-decoration: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; transition: 0.3s; border: medium; cursor: pointer; box-shadow: rgba(88, 101, 242, 0.3) 0px 2px 4px; transform: translateY(0px);">📝 Apply</a>
      <div style="position:relative;display:flex;align-items:center">
        <button id="portal-theme-toggle" type="button" aria-label="Toggle dark mode" aria-pressed="false" style="position: relative; width: 64px; height: 32px; background: rgb(55, 65, 81); border-radius: 16px; display: flex; align-items: center; justify-content: space-between; padding: 0px 8px; transition: 0.3s; border: 1px solid rgb(75, 85, 99); cursor: pointer;">
          <span id="portal-theme-sun" style="flex: 1 1 0%; display: flex; justify-content: center; align-items: center; opacity: 0.4; transition: opacity 0.3s;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="4" fill="#FBBF24"></circle><g stroke="#FBBF24" stroke-width="2"><line x1="10" y1="1" x2="10" y2="3"></line><line x1="10" y1="17" x2="10" y2="19"></line><line x1="1" y1="10" x2="3" y2="10"></line><line x1="17" y1="10" x2="19" y2="10"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="14.36" y1="14.36" x2="15.78" y2="15.78"></line><line x1="4.22" y1="15.78" x2="5.64" y2="14.36"></line><line x1="14.36" y1="5.64" x2="15.78" y2="4.22"></line></g></svg>
          </span>
          <span id="portal-theme-moon" style="flex: 1 1 0%; display: flex; justify-content: center; align-items: center; opacity: 1; transition: opacity 0.3s;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"></path></svg>
          </span>
          <span id="portal-theme-thumb" style="position: absolute; left: 4px; width: 24px; height: 24px; background: white; border-radius: 50%; box-shadow: rgba(0, 0, 0, 0.2) 0px 2px 4px; transition: left 0.3s;"></span>
        </button>
      </div>
      <button type="button" aria-label="Toggle mobile menu" class="mobile-menu-button" style="flex-direction:column;justify-content:center;align-items:center;width:40px;height:40px;background:transparent;border:none;cursor:pointer;gap:4px">
        <span style="width:24px;height:2px;background:var(--text-primary);transition:all 0.3s ease;transform:none"></span>
        <span style="width:24px;height:2px;background:var(--text-primary);transition:all 0.3s ease;opacity:1"></span>
        <span style="width:24px;height:2px;background:var(--text-primary);transition:all 0.3s ease;transform:none"></span>
      </button>
    </div>
  </nav>
  ${process.env.DISCORD_INVITE_URL ? `
  <div class="discord-invite-banner">
    <span class="discord-invite-banner-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
    </span>
    <span class="discord-invite-banner-text">Join the <strong>Taq Event</strong> Discord server to stay up to date with events and announcements.</span>
    <a href="${escHtml(process.env.DISCORD_INVITE_URL)}" target="_blank" rel="noopener noreferrer" class="discord-invite-banner-btn">Join Discord</a>
  </div>` : ""}
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
  <script>
    (function () {
      var root = document.documentElement;
      var btn = document.getElementById("portal-theme-toggle");
      var sun = document.getElementById("portal-theme-sun");
      var moon = document.getElementById("portal-theme-moon");
      var thumb = document.getElementById("portal-theme-thumb");

      if (!btn) return;

      function getTheme() {
        var theme = root.getAttribute("data-theme");
        return theme === "light" ? "light" : "dark";
      }

      function applyTheme(theme) {
        var isDark = theme !== "light";
        root.setAttribute("data-theme", isDark ? "dark" : "light");

        try {
          localStorage.setItem("theme", isDark ? "dark" : "light");
        } catch (_err) {
          // ignore storage failures
        }

        btn.style.background = isDark ? "#374151" : "#b2e9f7";
        btn.style.border = isDark ? "1px solid #4b5563" : "1px solid #82d8f1";
        btn.setAttribute("aria-pressed", String(!isDark));
        btn.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
        btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");

        if (sun) sun.style.opacity = isDark ? "0.4" : "1";
        if (moon) moon.style.opacity = isDark ? "1" : "0.4";
        if (thumb) thumb.style.left = isDark ? "4px" : "36px";
      }

      applyTheme(getTheme());

      btn.addEventListener("click", function () {
        applyTheme(getTheme() === "dark" ? "light" : "dark");
      });
    })();
  </script>
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
      <p class="intro-copy">Applying without joining the discord may result in your application being rejected!</p>
      <p class="intro-copy">Join the <a href="https://discord.gg/bn6Yw9GNVT" target="_blank" rel="noopener noreferrer">Discord server</a> before you apply</p>
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

// ── Persistent file-backed session store ──────────────────────────────────────
// Stores sessions in a JSON file so logins survive web-server restarts.
// No extra packages required — implements the express-session Store API directly.

const SESSION_STORE_FILE = path.resolve(
  process.env.SESSION_STORE_FILE || path.join(__dirname, "../.web-sessions.json")
);

class FileSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this._file = filePath;
    this._sessions = this._load();
    // Prune expired sessions every 15 minutes (unref so it doesn't block shutdown)
    setInterval(() => this._prune(), 15 * 60 * 1000).unref();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this._file, "utf8"));
    } catch {
      return {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this._file, JSON.stringify(this._sessions, null, 2));
    } catch { /* ignore write errors */ }
  }

  _prune() {
    const now = Date.now();
    let changed = false;
    for (const [sid, data] of Object.entries(this._sessions)) {
      const exp = data?.cookie?.expires;
      if (exp && new Date(exp).getTime() < now) {
        delete this._sessions[sid];
        changed = true;
      }
    }
    if (changed) this._save();
  }

  get(sid, cb) {
    const s = this._sessions[sid];
    cb(null, s ?? null);
  }

  set(sid, session, cb) {
    this._sessions[sid] = session;
    this._save();
    cb(null);
  }

  destroy(sid, cb) {
    delete this._sessions[sid];
    this._save();
    cb(null);
  }

  touch(sid, session, cb) {
    if (this._sessions[sid]) {
      this._sessions[sid].cookie = session.cookie;
      this._save();
    }
    cb(null);
  }
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
  store: new FileSessionStore(SESSION_STORE_FILE),
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
