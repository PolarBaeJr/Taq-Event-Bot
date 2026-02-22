"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const {
  requireAuth,
  loadUsers,
  findUser,
  addUser,
  removeUser,
  changePassword,
  authenticateUser,
  loadCustomQuestions,
  addCustomQuestion,
  removeCustomQuestion,
  moveCustomQuestion,
  resetCustomQuestions,
  editCustomQuestion,
  updateApplication,
  deleteApplication,
  getEffectiveRole,
  elevateUser,
  revokeElevation,
  setUserRole,
} = require("./auth");

const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "../.bot-state.json");
const CONTROL_LOG_FILE = process.env.CONTROL_LOG_FILE || path.join(__dirname, "../logs/control-actions.log");
const CRASH_LOG_DIR = process.env.CRASH_LOG_DIR || path.join(__dirname, "../crashlog");

const router = express.Router();

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminLayout(title, body, username) {
  const navUser = username ? `<span class="nav-user">${escHtml(username)}</span>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escHtml(title)} — TAq Admin</title>
  <link rel="stylesheet" href="/style.css"/>
  <link rel="stylesheet" href="/admin.css"/>
</head>
<body>
  <div class="admin-page">
    <aside class="admin-nav">
      <div class="nav-logo">
        <span class="nav-logo-text">TAq Admin</span>
      </div>
      <nav>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/questions">Questions</a>
        <a href="/admin/applications">Applications</a>
        <a href="/admin/logs">Logs</a>
        <a href="/admin/users">Users</a>
      </nav>
      <div class="nav-footer">
        ${navUser}
        <form method="POST" action="/admin/logout" style="margin:0">
          <button type="submit" class="logout-btn">Log out</button>
        </form>
      </div>
    </aside>
    <main class="admin-main">
      <h1 class="admin-title">${escHtml(title)}</h1>
      ${body}
    </main>
  </div>
</body>
</html>`;
}

function loginLayout(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Admin Login — TAq</title>
  <link rel="stylesheet" href="/style.css"/>
  <link rel="stylesheet" href="/admin.css"/>
</head>
<body>
  <div class="login-wrap">
    <div class="login-box">
      <h1 class="login-title">TAq Admin</h1>
      ${body}
    </div>
  </div>
</body>
</html>`;
}

function flash(req) {
  const msg = req.session.flash;
  if (msg) delete req.session.flash;
  if (!msg) return "";
  const cls = msg.type === "error" ? "flash-error" : "flash-ok";
  return `<div class="${cls}">${escHtml(msg.text)}</div>`;
}

function setFlash(req, type, text) {
  req.session.flash = { type, text };
}

function requireAdmin(req, res, next) {
  const user = findUser(req.session?.username);
  if (getEffectiveRole(user) === "admin") return next();
  setFlash(req, "error", "Admin access required.");
  return res.redirect("/admin/dashboard");
}

// ── State helpers ─────────────────────────────────────────────────────────────

function readRawState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/", (_req, res) => res.redirect("/admin/dashboard"));

// Login
router.get("/login", (req, res) => {
  if (req.session?.username) return res.redirect("/admin/dashboard");
  res.send(loginLayout(`
    ${flash(req)}
    <form method="POST" action="/admin/login" class="login-form">
      <div class="field">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username"/>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password"/>
      </div>
      <button type="submit" class="submit-btn">Log in</button>
    </form>
  `));
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    setFlash(req, "error", "Username and password are required.");
    return res.redirect("/admin/login");
  }
  if (!authenticateUser(username, password)) {
    setFlash(req, "error", "Invalid credentials.");
    return res.redirect("/admin/login");
  }
  // Regenerate session ID on login to prevent session fixation attacks.
  req.session.regenerate((err) => {
    if (err) return res.redirect("/admin/login");
    req.session.username = username;
    req.session.save(() => res.redirect("/admin/dashboard"));
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// Dashboard
router.get("/dashboard", requireAuth, (req, res) => {
  const state = readRawState();
  const apps = Object.values(state.applications || {});
  const pending = apps.filter((a) => a.status === "pending").length;
  const accepted = apps.filter((a) => a.status === "accepted").length;
  const denied = apps.filter((a) => a.status === "denied").length;
  const customTracks = state?.settings?.customTracks;
  const trackCount = Array.isArray(customTracks) ? customTracks.length : 0;
  const userCount = loadUsers().length;

  res.send(adminLayout("Dashboard", `
    ${flash(req)}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">${pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${accepted}</div>
        <div class="stat-label">Accepted</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${denied}</div>
        <div class="stat-label">Denied</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${trackCount}</div>
        <div class="stat-label">Custom Tracks</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${userCount}</div>
        <div class="stat-label">Admin Users</div>
      </div>
    </div>
    <div style="margin-top:24px">
      <a class="btn-link" href="/admin/applications">View Applications</a>
      <a class="btn-link" href="/admin/questions">Manage Questions</a>
    </div>
  `, req.session.username));
});

// Questions
function buildQuestionSection(key, label, questions, { isDefault = false } = {}) {
  const slugId = (suffix) => `qs-${key.replace(/[^a-z0-9]/gi, "_")}-${suffix}`;

  const rows = questions.map((q, i) => {
    const editId = slugId(`edit-${i}`);
    const typeOpts = ["text", "textarea", "select"].map((t) =>
      `<option value="${t}" ${q.type === t ? "selected" : ""}>${t}</option>`
    ).join("");
    return `
      <tr>
        <td><code>${escHtml(q.id)}</code></td>
        <td>${escHtml(q.label)}</td>
        <td>${escHtml(q.type)}</td>
        <td>${q.required ? "Yes" : "No"}</td>
        <td class="muted-note">${escHtml((q.options || []).join(", "))}</td>
        <td class="actions-cell">
          ${i > 0 ? `<form method="POST" action="/admin/questions/${escHtml(key)}/move" style="display:inline">
            <input type="hidden" name="id" value="${escHtml(q.id)}"/>
            <input type="hidden" name="direction" value="up"/>
            <button type="submit" class="btn-sm">↑</button>
          </form>` : ""}
          ${i < questions.length - 1 ? `<form method="POST" action="/admin/questions/${escHtml(key)}/move" style="display:inline">
            <input type="hidden" name="id" value="${escHtml(q.id)}"/>
            <input type="hidden" name="direction" value="down"/>
            <button type="submit" class="btn-sm">↓</button>
          </form>` : ""}
          <button type="button" class="btn-sm" onclick="toggleEl('${editId}')">Edit</button>
          <form method="POST" action="/admin/questions/${escHtml(key)}/remove" style="display:inline"
            onsubmit="return confirm('Remove this question?')">
            <input type="hidden" name="id" value="${escHtml(q.id)}"/>
            <button type="submit" class="btn-sm btn-danger">Remove</button>
          </form>
        </td>
      </tr>
      <tr id="${editId}" class="edit-row" style="display:none">
        <td colspan="6">
          <form method="POST" action="/admin/questions/${escHtml(key)}/edit" class="inline-form edit-inline-form">
            <input type="hidden" name="originalId" value="${escHtml(q.id)}"/>
            <div class="form-row">
              <div class="field">
                <label>Label</label>
                <input type="text" name="label" value="${escHtml(q.label)}" required/>
              </div>
              <div class="field">
                <label>Sheet Header</label>
                <input type="text" name="sheetHeader" value="${escHtml(q.sheetHeader || q.label)}" required/>
              </div>
              <div class="field">
                <label>Placeholder</label>
                <input type="text" name="placeholder" value="${escHtml(q.placeholder || "")}"/>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label>Type</label>
                <select name="type">${typeOpts}</select>
              </div>
              <div class="field">
                <label>Required?</label>
                <select name="required">
                  <option value="false" ${!q.required ? "selected" : ""}>No</option>
                  <option value="true" ${q.required ? "selected" : ""}>Yes</option>
                </select>
              </div>
              <div class="field">
                <label>Options (comma-sep)</label>
                <input type="text" name="options" value="${escHtml((q.options || []).join(", "))}"/>
              </div>
            </div>
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-sm" onclick="toggleEl('${editId}')">Cancel</button>
          </form>
        </td>
      </tr>`;
  }).join("");

  const table = questions.length > 0 ? `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Label</th><th>Type</th><th>Required</th><th>Options</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p class="muted-note">No questions defined yet.</p>`;

  const headerNote = isDefault
    ? `<span class="muted-note" style="font-size:0.8rem;font-weight:400"> — appears on every track's form</span>`
    : "";

  return `
    <section class="track-section${isDefault ? " track-section-default" : ""}">
      <div class="track-section-header">
        <h2>${escHtml(label)}${headerNote}</h2>
        <form method="POST" action="/admin/questions/${escHtml(key)}/reset" style="display:inline"
          onsubmit="return confirm('Remove ALL questions for ${escHtml(label)}?')">
          <button type="submit" class="btn-sm btn-danger">Reset All</button>
        </form>
      </div>
      ${table}
      <details class="add-form-wrap">
        <summary>+ Add question</summary>
        <form method="POST" action="/admin/questions/${escHtml(key)}/add" class="inline-form">
          <div class="form-row">
            <div class="field">
              <label>ID (no spaces)</label>
              <input type="text" name="id" required pattern="[A-Za-z0-9_\\-]+" title="Letters, numbers, underscores, hyphens only"/>
            </div>
            <div class="field">
              <label>Label</label>
              <input type="text" name="label" required/>
            </div>
            <div class="field">
              <label>Sheet Header</label>
              <input type="text" name="sheetHeader" required/>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Type</label>
              <select name="type">
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="select">select</option>
              </select>
            </div>
            <div class="field">
              <label>Required?</label>
              <select name="required">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div class="field">
              <label>Options (comma-sep, for select)</label>
              <input type="text" name="options" placeholder="Yes, No, Maybe"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field" style="flex:1">
              <label>Placeholder</label>
              <input type="text" name="placeholder"/>
            </div>
          </div>
          <button type="submit" class="btn-primary">Add Question</button>
        </form>
      </details>
    </section>`;
}

router.get("/questions", requireAuth, (req, res) => {
  const state = readRawState();
  const builtinTrackKeys = ["tester", "builder", "cmd"];
  const customTracks = Array.isArray(state?.settings?.customTracks) ? state.settings.customTracks : [];
  const allTracks = [
    ...builtinTrackKeys.map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) })),
    ...customTracks.map((t) => ({ key: t.key, label: t.label || t.key })),
  ];
  const customQuestions = loadCustomQuestions();

  const defaultSection = buildQuestionSection(
    "__default__",
    "All Tracks (Default)",
    Array.isArray(customQuestions["__default__"]) ? customQuestions["__default__"] : [],
    { isDefault: true }
  );

  const trackSections = allTracks.map(({ key, label }) =>
    buildQuestionSection(key, label, Array.isArray(customQuestions[key]) ? customQuestions[key] : [])
  ).join("\n");

  res.send(adminLayout("Question Management", `
    ${flash(req)}
    <p class="muted-note">Default questions appear on all tracks. Track questions are appended after built-in questions.</p>
    ${defaultSection}
    ${trackSections}
    <script>function toggleEl(id){var el=document.getElementById(id);el.style.display=el.style.display==='none'?'':'none';}</script>
  `, req.session.username));
});

router.post("/questions/:track/add", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { id, label, sheetHeader, type, required, options, placeholder } = req.body;
  try {
    const optArr = options
      ? options.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    addCustomQuestion(trackKey, {
      id: String(id || "").trim(),
      label: String(label || "").trim(),
      sheetHeader: String(sheetHeader || label || "").trim(),
      type: ["textarea", "select"].includes(type) ? type : "text",
      required: required === "true",
      options: optArr,
      placeholder: String(placeholder || "").trim(),
    });
    setFlash(req, "ok", `Question '${id}' added to ${trackKey}.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/questions");
});

router.post("/questions/:track/remove", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { id } = req.body;
  try {
    removeCustomQuestion(trackKey, id);
    setFlash(req, "ok", `Question '${id}' removed from ${trackKey}.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/questions");
});

router.post("/questions/:track/move", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { id, direction } = req.body;
  try {
    moveCustomQuestion(trackKey, id, direction);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/questions");
});

router.post("/questions/:track/reset", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  resetCustomQuestions(trackKey);
  setFlash(req, "ok", `Cleared all custom questions for ${trackKey}.`);
  res.redirect("/admin/questions");
});

router.post("/questions/:track/edit", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { originalId, label, sheetHeader, type, required, options, placeholder } = req.body;
  try {
    const optArr = options ? options.split(",").map((s) => s.trim()).filter(Boolean) : [];
    editCustomQuestion(trackKey, originalId, {
      label: String(label || "").trim(),
      sheetHeader: String(sheetHeader || label || "").trim(),
      type: ["textarea", "select"].includes(type) ? type : "text",
      required: required === "true",
      options: optArr,
      placeholder: String(placeholder || "").trim(),
    });
    setFlash(req, "ok", `Question '${originalId}' updated.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/questions");
});

// Applications
function renderApplicationsPage(req, res, { lockedTrack = null } = {}) {
  const state = readRawState();
  const allApps = Object.entries(state.applications || {}).map(([id, a]) => ({ id, ...a }));

  const filterTrack = lockedTrack || req.query.track || "";
  const filterStatus = req.query.status || "";
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = 25;

  let filtered = allApps;
  if (filterTrack) filtered = filtered.filter((a) => a.trackKey === filterTrack);
  if (filterStatus) filtered = filtered.filter((a) => a.status === filterStatus);

  filtered.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);

  const allTrackKeys = [...new Set(allApps.map((a) => a.trackKey).filter(Boolean))].sort();

  const statusBadge = (s) => {
    const cls = s === "accepted" ? "badge-ok" : s === "denied" ? "badge-err" : "badge-pending";
    return `<span class="badge ${cls}">${escHtml(s)}</span>`;
  };

  const rows = slice.map((a) => {
    const fields = Array.isArray(a.submittedFields)
      ? a.submittedFields.slice(0, 3).map((f) => escHtml(String(f))).join("<br>")
      : "";
    const editUrl = `/admin/applications/${escHtml(a.trackKey || "_")}/${escHtml(a.id)}`;
    return `
      <tr>
        <td><a href="${editUrl}" class="track-link"><code>${escHtml(a.id)}</code></a></td>
        <td>${escHtml(a.applicantName || "—")}</td>
        <td><a href="/admin/applications/${escHtml(a.trackKey || "")}" class="track-link"><code>${escHtml(a.trackKey || "—")}</code></a></td>
        <td>${statusBadge(a.status || "pending")}</td>
        <td class="muted-note">${a.createdAt ? escHtml(a.createdAt.slice(0, 10)) : "—"}</td>
        <td class="muted-note">${a.decidedAt ? escHtml(a.decidedAt.slice(0, 10)) : "—"}</td>
        <td class="field-preview">${fields}</td>
      </tr>`;
  }).join("");

  // Base URL for pagination/filter links
  const baseUrl = lockedTrack
    ? `/admin/applications/${escHtml(lockedTrack)}`
    : "/admin/applications";

  const qs = (extra = {}) => {
    const params = new URLSearchParams({ ...((!lockedTrack && filterTrack) && { track: filterTrack }), ...(filterStatus && { status: filterStatus }), ...extra });
    return params.toString() ? `?${params}` : "";
  };

  const pagination = totalPages > 1 ? `
    <div class="pagination">
      ${current > 1 ? `<a href="${baseUrl}${qs({ page: current - 1 })}">← Prev</a>` : ""}
      <span>Page ${current} of ${totalPages} (${total} total)</span>
      ${current < totalPages ? `<a href="${baseUrl}${qs({ page: current + 1 })}">Next →</a>` : ""}
    </div>` : `<p class="muted-note">${total} application${total !== 1 ? "s" : ""}</p>`;

  // Track filter: locked tracks show a back link instead of dropdown
  const trackFilterHtml = lockedTrack
    ? `<a href="/admin/applications" class="btn-sm">← All tracks</a>`
    : `<select name="track">
        <option value="">All tracks</option>
        ${allTrackKeys.map((k) => `<option value="${escHtml(k)}" ${filterTrack === k ? "selected" : ""}>${escHtml(k)}</option>`).join("")}
      </select>`;

  const title = lockedTrack ? `Applications — ${escHtml(lockedTrack)}` : "Applications";

  res.send(adminLayout(title, `
    ${flash(req)}
    <form method="GET" action="${baseUrl}" class="filter-bar">
      ${trackFilterHtml}
      <select name="status">
        <option value="" ${!filterStatus ? "selected" : ""}>All statuses</option>
        <option value="pending" ${filterStatus === "pending" ? "selected" : ""}>Pending</option>
        <option value="accepted" ${filterStatus === "accepted" ? "selected" : ""}>Accepted</option>
        <option value="denied" ${filterStatus === "denied" ? "selected" : ""}>Denied</option>
      </select>
      <button type="submit" class="btn-primary">Filter</button>
      ${!lockedTrack ? `<a href="/admin/applications" class="btn-sm">Clear</a>` : ""}
    </form>
    <table class="admin-table">
      <thead>
        <tr><th>ID</th><th>Applicant</th><th>Track</th><th>Status</th><th>Created</th><th>Decided</th><th>Fields</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="muted-note">No applications found.</td></tr>'}
      </tbody>
    </table>
    ${pagination}
  `, req.session.username));
}

router.get("/applications", requireAuth, (req, res) => {
  renderApplicationsPage(req, res);
});

router.get("/applications/:track", requireAuth, (req, res) => {
  renderApplicationsPage(req, res, { lockedTrack: req.params.track });
});

// Users
router.get("/users", requireAuth, (req, res) => {
  const users = loadUsers();
  const currentUser = findUser(req.session.username);
  const currentRole = getEffectiveRole(currentUser);

  const roleBadge = (u) => {
    const stored = u.role || "admin";
    const effective = getEffectiveRole(u);
    const isElevated = stored === "moderator" && effective === "admin";
    if (isElevated) {
      const until = new Date(u.elevatedUntil).toLocaleString();
      return `<span class="badge badge-pending" title="Elevated until ${escHtml(until)}">admin (temp)</span>`;
    }
    return stored === "admin"
      ? `<span class="badge badge-ok">admin</span>`
      : `<span class="badge badge-pending">moderator</span>`;
  };

  const rows = users.filter((u) => u.username !== "admin").map((u) => {
    const storedRole = u.role || "admin";
    const isElevated = storedRole === "moderator" && getEffectiveRole(u) === "admin";
    const isCurrentUser = u.username === req.session.username;

    let actions = "";
    if (isCurrentUser) {
      actions = '<span class="muted-note">(you)</span>';
    } else if (currentRole === "admin") {
      // Permanent role change
      const roleOpts = ["admin", "moderator"].map((r) =>
        `<option value="${r}" ${storedRole === r ? "selected" : ""}>${r}</option>`
      ).join("");
      actions += `
        <form method="POST" action="/admin/users/role" style="display:inline">
          <input type="hidden" name="username" value="${escHtml(u.username)}"/>
          <select name="role" style="font-size:0.78rem;padding:2px 6px">${roleOpts}</select>
          <button type="submit" class="btn-sm">Set</button>
        </form>`;

      // Temporary elevation (moderators only, not already elevated)
      if (storedRole === "moderator" && !isElevated) {
        actions += `
          <form method="POST" action="/admin/users/elevate" style="display:inline;margin-left:4px">
            <input type="hidden" name="username" value="${escHtml(u.username)}"/>
            <select name="hours" style="font-size:0.78rem;padding:2px 6px">
              <option value="1">1h</option>
              <option value="4">4h</option>
              <option value="8">8h</option>
              <option value="24">24h</option>
            </select>
            <button type="submit" class="btn-sm">Elevate</button>
          </form>`;
      }
      if (isElevated) {
        actions += `
          <form method="POST" action="/admin/users/revoke-elevation" style="display:inline;margin-left:4px">
            <input type="hidden" name="username" value="${escHtml(u.username)}"/>
            <button type="submit" class="btn-sm btn-danger">Revoke</button>
          </form>`;
      }

      // Remove (moderators only — demote first to remove an admin)
      if (storedRole === "moderator") {
        actions += `
          <form method="POST" action="/admin/users/remove" style="display:inline;margin-left:4px"
            onsubmit="return confirm('Remove user ${escHtml(u.username)}?')">
            <input type="hidden" name="username" value="${escHtml(u.username)}"/>
            <button type="submit" class="btn-sm btn-danger">Remove</button>
          </form>`;
      }
    }

    return `
      <tr>
        <td>${escHtml(u.username)}</td>
        <td>${roleBadge(u)}</td>
        <td class="muted-note">${escHtml(u.createdAt ? u.createdAt.slice(0, 10) : "—")}</td>
        <td class="actions-cell">${actions || "—"}</td>
      </tr>`;
  }).join("");

  const addModeratorHtml = currentRole === "admin" ? `
    <section class="card" style="margin-top:32px">
      <h2>Add Moderator</h2>
      <form method="POST" action="/admin/users/add" class="inline-form">
        <div class="form-row">
          <div class="field">
            <label>Username</label>
            <input type="text" name="username" required/>
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" required/>
          </div>
        </div>
        <button type="submit" class="btn-primary">Add Moderator</button>
      </form>
    </section>` : "";

  res.send(adminLayout("Users", `
    ${flash(req)}
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted-note">No users.</td></tr>'}</tbody>
    </table>
    ${addModeratorHtml}
    <section class="card" style="margin-top:24px">
      <h2>Change My Password</h2>
      <form method="POST" action="/admin/users/password" class="inline-form">
        <div class="form-row">
          <div class="field">
            <label>New Password</label>
            <input type="password" name="password" required/>
          </div>
          <div class="field">
            <label>Confirm</label>
            <input type="password" name="confirm" required/>
          </div>
        </div>
        <button type="submit" class="btn-primary">Update Password</button>
      </form>
    </section>
  `, req.session.username));
});

router.post("/users/add", requireAuth, requireAdmin, (req, res) => {
  const { username, password } = req.body;
  try {
    if (!username || !password) throw new Error("Username and password are required.");
    addUser(username, password, "moderator");
    setFlash(req, "ok", `Moderator '${username}' added.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

router.post("/users/remove", requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  if (username === "admin") {
    setFlash(req, "error", "The admin account cannot be removed.");
    return res.redirect("/admin/users");
  }
  if (username === req.session.username) {
    setFlash(req, "error", "You cannot remove your own account.");
    return res.redirect("/admin/users");
  }
  const target = findUser(username);
  if (target && (target.role || "admin") === "admin") {
    setFlash(req, "error", "Admin accounts cannot be removed from the web panel.");
    return res.redirect("/admin/users");
  }
  try {
    removeUser(username);
    setFlash(req, "ok", `User '${username}' removed.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

router.post("/users/role", requireAuth, requireAdmin, (req, res) => {
  const { username, role } = req.body;
  if (username === "admin") {
    setFlash(req, "error", "The admin account cannot be modified.");
    return res.redirect("/admin/users");
  }
  if (username === req.session.username) {
    setFlash(req, "error", "You cannot change your own role.");
    return res.redirect("/admin/users");
  }
  try {
    setUserRole(username, role);
    setFlash(req, "ok", `'${username}' is now a ${role}.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

router.post("/users/elevate", requireAuth, requireAdmin, (req, res) => {
  const { username, hours } = req.body;
  const h = Math.min(168, Math.max(1, parseInt(hours, 10) || 1));
  try {
    const until = elevateUser(username, h);
    setFlash(req, "ok", `'${username}' elevated to admin until ${new Date(until).toLocaleString()}.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

router.post("/users/revoke-elevation", requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  try {
    revokeElevation(username);
    setFlash(req, "ok", `Elevation revoked for '${username}'.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

router.post("/users/password", requireAuth, (req, res) => {
  const { password, confirm } = req.body;
  if (!password || password !== confirm) {
    setFlash(req, "error", "Passwords do not match.");
    return res.redirect("/admin/users");
  }
  try {
    changePassword(req.session.username, password);
    setFlash(req, "ok", "Password updated.");
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/users");
});

// Application detail / edit
router.get("/applications/:track/:id", requireAuth, (req, res) => {
  const appId = req.params.id;
  const state = readRawState();
  const app = state.applications?.[appId];
  if (!app) {
    setFlash(req, "error", `Application '${appId}' not found.`);
    return res.redirect("/admin/applications");
  }

  const allTrackKeys = [
    "tester", "builder", "cmd",
    ...((state.settings?.customTracks || []).map((t) => t.key)),
  ];

  const trackOpts = allTrackKeys.map((k) =>
    `<option value="${escHtml(k)}" ${app.trackKey === k ? "selected" : ""}>${escHtml(k)}</option>`
  ).join("");

  const statusOpts = ["pending", "accepted", "denied"].map((s) =>
    `<option value="${s}" ${(app.status || "pending") === s ? "selected" : ""}>${s}</option>`
  ).join("");

  const fieldsText = Array.isArray(app.submittedFields)
    ? app.submittedFields.join("\n")
    : "";

  const backUrl = `/admin/applications/${escHtml(req.params.track)}`;

  res.send(adminLayout(`Edit Application`, `
    ${flash(req)}
    <a href="${backUrl}" class="back-link" style="display:inline-flex;margin-bottom:20px">← Back</a>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.85rem;color:var(--muted)">
        <span><strong>ID:</strong> <code>${escHtml(appId)}</code></span>
        <span><strong>Created:</strong> ${escHtml(app.createdAt || "—")}</span>
        <span><strong>Job:</strong> ${escHtml(app.jobId || "—")}</span>
        <span><strong>Row:</strong> ${escHtml(String(app.rowIndex || "—"))}</span>
        <span><strong>Discord ID:</strong> ${escHtml(app.applicantUserId || "—")}</span>
      </div>
    </div>
    <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}" class="card">
      <h2>Application Fields</h2>
      <div class="form-row" style="margin-bottom:12px">
        <div class="field">
          <label>Applicant Name</label>
          <input type="text" name="applicantName" value="${escHtml(app.applicantName || "")}"/>
        </div>
        <div class="field">
          <label>Track</label>
          <select name="trackKey">${trackOpts}</select>
        </div>
        <div class="field">
          <label>Status</label>
          <select name="status">${statusOpts}</select>
        </div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div class="field">
          <label>Decided At (ISO)</label>
          <input type="text" name="decidedAt" value="${escHtml(app.decidedAt || "")}" placeholder="2025-01-01T00:00:00.000Z"/>
        </div>
        <div class="field">
          <label>Decided By</label>
          <input type="text" name="decidedBy" value="${escHtml(app.decidedBy || "")}"/>
        </div>
      </div>
      <div class="field" style="margin-bottom:16px">
        <label>Submitted Fields <span class="muted-note">(one per line)</span></label>
        <textarea name="submittedFields" rows="12" style="font-family:ui-monospace,monospace;font-size:0.82rem">${escHtml(fieldsText)}</textarea>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button type="submit" class="btn-primary">Save Changes</button>
        <a href="${backUrl}" class="btn-sm">Cancel</a>
      </div>
    </form>
    <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}/delete"
      style="margin-top:16px" onsubmit="return confirm('Permanently delete this application?')">
      <button type="submit" class="btn-sm btn-danger">Delete Application</button>
    </form>
  `, req.session.username));
});

router.post("/applications/:track/:id", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  const { applicantName, trackKey, status, decidedAt, decidedBy, submittedFields } = req.body;
  try {
    const fields = String(submittedFields || "").split("\n").map((l) => l.trimEnd()).filter(Boolean);
    updateApplication(appId, {
      applicantName: String(applicantName || "").trim(),
      trackKey: String(trackKey || "").trim(),
      status: ["pending", "accepted", "denied"].includes(status) ? status : "pending",
      decidedAt: String(decidedAt || "").trim() || null,
      decidedBy: String(decidedBy || "").trim() || null,
      submittedFields: fields,
    });
    setFlash(req, "ok", "Application saved.");
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}/${encodeURIComponent(appId)}`);
});

router.post("/applications/:track/:id/delete", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  try {
    deleteApplication(appId);
    setFlash(req, "ok", `Application '${appId}' deleted.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}`);
});

// Logs
router.get("/logs", requireAuth, (req, res) => {
  // ── Control log ──────────────────────────────────────────────────────────────
  const CONTROL_LOG_LINES = 200;
  let controlRows = "";
  try {
    const raw = fs.readFileSync(CONTROL_LOG_FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean).slice(-CONTROL_LOG_LINES).reverse();
    controlRows = lines.map((line) => {
      let obj;
      try { obj = JSON.parse(line); } catch { obj = { raw: line }; }
      const at = obj.at ? escHtml(new Date(obj.at).toLocaleString()) : "—";
      const action = escHtml(obj.action || obj.raw || "");
      const user = escHtml(obj.username || obj.globalName || "");
      const extra = Object.entries(obj)
        .filter(([k]) => !["action", "at", "userId", "username", "globalName", "guildId", "guildName"].includes(k))
        .map(([k, v]) => `${escHtml(k)}: ${escHtml(String(v))}`)
        .join(", ");
      return `<tr>
        <td class="muted-note" style="white-space:nowrap">${at}</td>
        <td><strong>${action}</strong></td>
        <td>${user}</td>
        <td class="muted-note">${extra}</td>
      </tr>`;
    }).join("");
  } catch {
    controlRows = `<tr><td colspan="4" class="muted-note">Could not read control log (${escHtml(CONTROL_LOG_FILE)}).</td></tr>`;
  }

  // ── Crash logs ───────────────────────────────────────────────────────────────
  let crashHtml = "";
  try {
    const files = fs.readdirSync(CRASH_LOG_DIR)
      .filter((f) => f.endsWith(".log"))
      .sort()
      .reverse()
      .slice(0, 20); // show 20 most recent

    if (files.length === 0) {
      crashHtml = `<p class="muted-note">No crash logs found.</p>`;
    } else {
      crashHtml = files.map((filename) => {
        let obj;
        try {
          obj = JSON.parse(fs.readFileSync(path.join(CRASH_LOG_DIR, filename), "utf8"));
        } catch {
          obj = null;
        }
        const at = obj?.at ? escHtml(new Date(obj.at).toLocaleString()) : escHtml(filename);
        const kind = escHtml(obj?.kind || "unknown");
        const msg = escHtml(obj?.reason?.message || obj?.reason || "");
        const stack = escHtml(obj?.reason?.stack || "");
        return `<details class="crash-entry">
          <summary>
            <span class="badge badge-err">${kind}</span>
            <span style="margin-left:8px">${at}</span>
            ${msg ? `<span class="muted-note" style="margin-left:8px">— ${msg}</span>` : ""}
          </summary>
          ${stack ? `<pre class="crash-stack">${stack}</pre>` : `<pre class="crash-stack">${escHtml(JSON.stringify(obj, null, 2))}</pre>`}
        </details>`;
      }).join("\n");
    }
  } catch {
    crashHtml = `<p class="muted-note">Could not read crash log directory (${escHtml(CRASH_LOG_DIR)}).</p>`;
  }

  res.send(adminLayout("Logs", `
    ${flash(req)}
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px">Control Log <span class="muted-note">(last ${CONTROL_LOG_LINES} entries)</span></h2>
    <table class="admin-table">
      <thead><tr><th>Time</th><th>Action</th><th>User</th><th>Details</th></tr></thead>
      <tbody>${controlRows || '<tr><td colspan="4" class="muted-note">No entries.</td></tr>'}</tbody>
    </table>

    <h2 style="font-size:1.1rem;font-weight:700;margin-top:36px;margin-bottom:12px">Crash Logs <span class="muted-note">(20 most recent)</span></h2>
    ${crashHtml}
  `, req.session.username));
});

module.exports = router;
