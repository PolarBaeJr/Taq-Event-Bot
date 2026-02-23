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
  saveCustomQuestions,
  addCustomQuestion,
  removeCustomQuestion,
  moveCustomQuestion,
  resetCustomQuestions,
  editCustomQuestion,
  updateApplication,
  deleteApplication,
  archiveApplication,
  addPendingAdminAction,
  getEffectiveRole,
  elevateUser,
  revokeElevation,
  setUserRole,
  removeQueueJob,
  clearFailedQueueJobs,
  clearAllQueueJobs,
  reorderTrackQuestions,
  moveQuestionBetweenTracks,
} = require("./auth");

const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "../.bot-state.json");
const CONTROL_LOG_FILE = process.env.CONTROL_LOG_FILE || path.join(__dirname, "../logs/control-actions.log");
const CRASH_LOG_DIR = process.env.CRASH_LOG_DIR || path.join(__dirname, "../crashlog");
const BOT_ERROR_LOG_FILE = process.env.BOT_ERROR_LOG_FILE || path.join(__dirname, "../logs/bot-errors.log");
const WEB_ERROR_LOG_FILE = process.env.WEB_ERROR_LOG_FILE || path.join(__dirname, "../logs/web-errors.log");

const router = express.Router();
const ADMIN_STYLE_VERSION = "admin-css-2";
const BASE_STYLE_VERSION = "shared-css-2";

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
  <link rel="stylesheet" href="/style.css?v=${BASE_STYLE_VERSION}"/>
  <link rel="stylesheet" href="/admin.css?v=${ADMIN_STYLE_VERSION}"/>
</head>
<body class="admin-body">
  <div class="admin-page">
    <aside class="admin-nav">
      <div class="nav-logo">
        <a href="https://www.the-aquarium.com/" class="nav-logo-link" target="_blank" rel="noopener noreferrer">
          <img src="https://www.the-aquarium.com/images/guildimages/icontransparent.png" alt="The Aquarium" class="nav-logo-img"/>
        </a>
        <span class="nav-logo-text">TAq Admin</span>
      </div>
      <nav>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/questions">Questions</a>
        <a href="/admin/applications">Applications</a>
        <a href="/admin/queue">Queue</a>
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
  <link rel="stylesheet" href="/style.css?v=${BASE_STYLE_VERSION}"/>
  <link rel="stylesheet" href="/admin.css?v=${ADMIN_STYLE_VERSION}"/>
</head>
<body class="admin-body admin-login-body">
  <div class="login-wrap">
    <div class="login-box">
      <div class="login-logo-wrap">
        <a href="https://www.the-aquarium.com/" target="_blank" rel="noopener noreferrer">
          <img src="https://www.the-aquarium.com/images/guildimages/icontransparent.png" alt="The Aquarium" class="login-logo-img"/>
        </a>
      </div>
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
  const active = apps.filter((a) => !a.adminArchived && !a.adminDone);
  const pending = active.filter((a) => a.status === "pending").length;
  const accepted = active.filter((a) => a.status === "accepted").length;
  const denied = active.filter((a) => a.status === "denied").length;
  const closed = apps.filter((a) => !a.adminArchived && a.adminDone).length;
  const archived = apps.filter((a) => a.adminArchived).length;
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
        <div class="stat-val">${closed}</div>
        <div class="stat-label">Closed</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${archived}</div>
        <div class="stat-label">Archived</div>
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
      <tr draggable="true" data-qid="${escHtml(q.id)}" data-track="${escHtml(key)}">
        <td class="drag-handle" title="Drag to reorder or move to another track">⠿</td>
        <td><code>${escHtml(q.id)}</code></td>
        <td>${escHtml(q.label)}</td>
        <td>${escHtml(q.type)}</td>
        <td>${q.required ? "Yes" : "No"}</td>
        <td class="muted-note">${escHtml((q.options || []).join(", "))}</td>
        <td class="actions-cell">
          <button type="button" class="btn-sm" onclick="toggleEl('${editId}')">Edit</button>
          <form method="POST" action="/admin/questions/${escHtml(key)}/duplicate" style="display:inline">
            <input type="hidden" name="id" value="${escHtml(q.id)}"/>
            <button type="submit" class="btn-sm">Duplicate</button>
          </form>
          <form method="POST" action="/admin/questions/${escHtml(key)}/remove" style="display:inline"
            onsubmit="return confirm('Remove this question?')">
            <input type="hidden" name="id" value="${escHtml(q.id)}"/>
            <button type="submit" class="btn-sm btn-danger">Remove</button>
          </form>
        </td>
      </tr>
      <tr id="${editId}" class="edit-row" style="display:none">
        <td colspan="7">
          <form method="POST" action="/admin/questions/${escHtml(key)}/edit" class="inline-form edit-inline-form">
            <input type="hidden" name="originalId" value="${escHtml(q.id)}"/>
            <div class="form-row">
              <div class="field">
                <label>ID</label>
                <input type="text" name="id" value="${escHtml(q.id)}" required pattern="[A-Za-z0-9_\\-]+" title="Letters, numbers, underscores, hyphens only"/>
              </div>
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
      <thead><tr><th></th><th>ID</th><th>Label</th><th>Type</th><th>Required</th><th>Options</th><th>Actions</th></tr></thead>
      <tbody data-track="${escHtml(key)}">${rows}</tbody>
    </table>` : `
    <p class="muted-note questions-empty-note" data-track="${escHtml(key)}">No questions defined yet. Drag a question here to move it from another track.</p>
    <table class="admin-table" style="display:none">
      <tbody data-track="${escHtml(key)}"></tbody>
    </table>`;

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
    <p class="muted-note">Default questions appear on all tracks. Track questions are appended after default questions. <strong>Drag rows</strong> to reorder or move between tracks.</p>
    ${defaultSection}
    ${trackSections}
    <script>
(function () {
  function toggleEl(id) {
    var el = document.getElementById(id);
    el.style.display = el.style.display === 'none' ? '' : 'none';
  }
  window.toggleEl = toggleEl;

  var dragSrc = null;

  function clearIndicators() {
    document.querySelectorAll('.drag-over-top,.drag-over-bottom,.drag-drop-target').forEach(function (el) {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-drop-target');
    });
  }

  function getOrder(tbody) {
    return Array.from(tbody.querySelectorAll('tr[data-qid]')).map(function (r) { return r.dataset.qid; });
  }

  function postForm(url, params) {
    var body = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }).then(function (r) { return r.json(); });
  }

  document.querySelectorAll('tr[data-qid]').forEach(function (row) {
    row.addEventListener('dragstart', function (e) {
      dragSrc = { qid: row.dataset.qid, track: row.dataset.track, el: row };
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function () { row.classList.add('drag-dragging'); }, 0);
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('drag-dragging');
      clearIndicators();
      dragSrc = null;
    });
    row.addEventListener('dragover', function (e) {
      if (!dragSrc || dragSrc.qid === row.dataset.qid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearIndicators();
      var rect = row.getBoundingClientRect();
      row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    });
    row.addEventListener('dragleave', function () {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    row.addEventListener('drop', async function (e) {
      e.preventDefault();
      if (!dragSrc || dragSrc.qid === row.dataset.qid) return;
      clearIndicators();
      var rect = row.getBoundingClientRect();
      var dropBefore = e.clientY < rect.top + rect.height / 2;
      var toTrack = row.dataset.track;
      var tbody = row.closest('tbody');
      if (dragSrc.track === toTrack) {
        tbody.insertBefore(dragSrc.el, dropBefore ? row : row.nextSibling);
        var d = await postForm('/admin/questions/' + encodeURIComponent(toTrack) + '/reorder', { order: getOrder(tbody).join(',') });
        if (!d.ok) { alert('Reorder failed: ' + d.error); location.reload(); }
      } else {
        var rows = Array.from(tbody.querySelectorAll('tr[data-qid]'));
        var atIndex = rows.indexOf(row);
        if (!dropBefore) atIndex++;
        var d = await postForm('/admin/questions/move-between', { fromTrack: dragSrc.track, questionId: dragSrc.qid, toTrack: toTrack, atIndex: atIndex });
        if (d.ok) { location.reload(); } else { alert('Move failed: ' + d.error); }
      }
    });
  });

  // Drop onto empty-track tbodies
  document.querySelectorAll('tbody[data-track]').forEach(function (tbody) {
    tbody.addEventListener('dragover', function (e) {
      if (!dragSrc) return;
      e.preventDefault();
      tbody.classList.add('drag-drop-target');
    });
    tbody.addEventListener('dragleave', function () {
      tbody.classList.remove('drag-drop-target');
    });
    tbody.addEventListener('drop', async function (e) {
      e.preventDefault();
      if (!dragSrc) return;
      tbody.classList.remove('drag-drop-target');
      var toTrack = tbody.dataset.track;
      if (dragSrc.track === toTrack) {
        tbody.appendChild(dragSrc.el);
        var d = await postForm('/admin/questions/' + encodeURIComponent(toTrack) + '/reorder', { order: getOrder(tbody).join(',') });
        if (!d.ok) { alert('Reorder failed: ' + d.error); location.reload(); }
        return;
      }
      var d = await postForm('/admin/questions/move-between', { fromTrack: dragSrc.track, questionId: dragSrc.qid, toTrack: toTrack, atIndex: 9999 });
      if (d.ok) { location.reload(); } else { alert('Move failed: ' + d.error); }
    });
  });

  // Highlight empty-track drop zones on drag
  document.querySelectorAll('.questions-empty-note').forEach(function (note) {
    var track = note.dataset.track;
    var hiddenTbody = note.parentElement ? note.parentElement.querySelector('tbody[data-track="' + track + '"]') : null;
    note.addEventListener('dragover', function (e) {
      if (!dragSrc) return;
      e.preventDefault();
      note.classList.add('drag-drop-target');
    });
    note.addEventListener('dragleave', function () { note.classList.remove('drag-drop-target'); });
    note.addEventListener('drop', async function (e) {
      e.preventDefault();
      if (!dragSrc) return;
      note.classList.remove('drag-drop-target');
      var d = await postForm('/admin/questions/move-between', { fromTrack: dragSrc.track, questionId: dragSrc.qid, toTrack: track, atIndex: 9999 });
      if (d.ok) { location.reload(); } else { alert('Move failed: ' + d.error); }
    });
  });
})();
    </script>
  `, req.session.username));
});

// Must be defined before /:track routes to avoid param capture
router.post("/questions/move-between", requireAuth, requireAdmin, (req, res) => {
  const { fromTrack, questionId, toTrack, atIndex } = req.body;
  try {
    const idx = atIndex !== undefined ? parseInt(atIndex, 10) : undefined;
    moveQuestionBetweenTracks(String(fromTrack || ""), String(questionId || ""), String(toTrack || ""), idx);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/questions/:track/reorder", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { order } = req.body;
  try {
    const ids = String(order || "").split(",").map((s) => s.trim()).filter(Boolean);
    reorderTrackQuestions(trackKey, ids);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/questions/:track/duplicate", requireAuth, requireAdmin, (req, res) => {
  const trackKey = req.params.track;
  const { id } = req.body;
  try {
    const all = loadCustomQuestions();
    if (!Array.isArray(all[trackKey])) throw new Error(`No questions for track '${trackKey}'.`);
    const original = all[trackKey].find((q) => q.id === id);
    if (!original) throw new Error(`Question '${id}' not found.`);
    const newId = `${original.id}_copy`;
    const suffix = (() => {
      let n = 1;
      while (all[trackKey].some((q) => q.id === (n === 1 ? newId : `${newId}${n}`))) n++;
      return n === 1 ? "" : String(n);
    })();
    const finalId = `${newId}${suffix}`;
    all[trackKey].push({ ...original, id: finalId, label: `${original.label} (copy)` });
    saveCustomQuestions(all);
    setFlash(req, "ok", `Duplicated '${id}' as '${finalId}'.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/questions");
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
  const { originalId, id, label, sheetHeader, type, required, options, placeholder } = req.body;
  try {
    const optArr = options ? options.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const newId = String(id || "").trim();
    editCustomQuestion(trackKey, originalId, {
      ...(newId && newId !== originalId ? { id: newId } : {}),
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

// Queue
function renderQueuePage(req, res) {
  const state = readRawState();
  const jobs = Array.isArray(state.postJobs) ? state.postJobs : [];
  const failedCount = jobs.filter((j) => j.lastError).length;

  // Pending applications: already posted to Discord, awaiting a decision
  const pendingApps = Object.entries(state.applications || {})
    .map(([id, a]) => ({ id, ...a }))
    .filter((a) => !a.adminArchived && !a.adminDone && a.status === "pending")
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  const jobRows = jobs.map((j) => {
    const tracks = Array.isArray(j.trackKeys) ? j.trackKeys.join(", ") : (j.trackKeys || "—");
    const createdAt = j.createdAt ? escHtml(j.createdAt.slice(0, 16).replace("T", " ")) : "—";
    const lastAttempt = j.lastAttemptAt ? escHtml(j.lastAttemptAt.slice(0, 16).replace("T", " ")) : "—";
    const errHtml = j.lastError
      ? `<span class="badge badge-err" title="${escHtml(String(j.lastError))}">${escHtml(String(j.lastError).slice(0, 70))}${String(j.lastError).length > 70 ? "…" : ""}</span>`
      : `<span class="muted-note">—</span>`;
    return `
      <tr>
        <td data-label="Job ID"><code>${escHtml(j.jobId || "—")}</code></td>
        <td data-label="Track(s)">${escHtml(tracks)}</td>
        <td data-label="Row">${escHtml(String(j.rowIndex || "—"))}</td>
        <td data-label="Created" class="muted-note">${createdAt}</td>
        <td data-label="Attempts">${escHtml(String(j.attempts || 0))}${j.attempts > 0 ? ` <span class="muted-note">(${lastAttempt})</span>` : ""}</td>
        <td data-label="Last Error">${errHtml}</td>
        <td data-label="Actions" class="actions-cell">
          <form method="POST" action="/admin/queue/${encodeURIComponent(j.jobId)}/remove" style="margin:0"
            onsubmit="return confirm('Remove job ${escHtml(j.jobId)} from the queue? This application will not be posted to Discord.')">
            <button type="submit" class="btn-sm btn-danger">Remove</button>
          </form>
        </td>
      </tr>`;
  }).join("");

  const appRows = pendingApps.map((a) => {
    const editUrl = `/admin/applications/${encodeURIComponent(a.trackKey || "_")}/${encodeURIComponent(a.id)}`;
    const createdAt = a.createdAt ? escHtml(a.createdAt.slice(0, 16).replace("T", " ")) : "—";
    return `
      <tr>
        <td data-label="ID"><a href="${editUrl}" class="track-link"><code>${escHtml(a.id)}</code></a></td>
        <td data-label="Applicant">${escHtml(a.applicantName || "—")}</td>
        <td data-label="Track"><code>${escHtml(a.trackKey || "—")}</code></td>
        <td data-label="Created" class="muted-note">${createdAt}</td>
        <td data-label="Actions" class="actions-cell">
          <a href="${editUrl}" class="btn-sm">View</a>
        </td>
      </tr>`;
  }).join("");

  res.send(adminLayout("Queue", `
    ${flash(req)}

    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px">Pending Applications <span class="muted-note" style="font-size:0.85rem;font-weight:400">(posted to Discord, awaiting decision)</span></h2>
    <table class="admin-table" style="margin-bottom:32px">
      <thead>
        <tr><th>ID</th><th>Applicant</th><th>Track</th><th>Submitted</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${appRows || '<tr><td colspan="5" class="muted-note" style="padding:16px;text-align:center">No pending applications.</td></tr>'}
      </tbody>
    </table>

    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px">Unposted Jobs <span class="muted-note" style="font-size:0.85rem;font-weight:400">(new form responses waiting to be posted to Discord)</span></h2>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <span class="muted-note">${jobs.length} job${jobs.length !== 1 ? "s" : ""}${failedCount > 0 ? `, <strong>${failedCount}</strong> with errors` : ""}</span>
      ${failedCount > 0 ? `
        <form method="POST" action="/admin/queue/clear-failed" style="margin:0"
          onsubmit="return confirm('Remove all ${failedCount} failed job(s) from the queue?')">
          <button type="submit" class="btn-sm btn-danger">Clear Failed (${failedCount})</button>
        </form>` : ""}
      ${jobs.length > 0 ? `
        <form method="POST" action="/admin/queue/clear-all" style="margin:0"
          onsubmit="return confirm('Remove ALL ${jobs.length} job(s)? These applications will NOT be posted to Discord.')">
          <button type="submit" class="btn-sm btn-danger">Clear All</button>
        </form>` : ""}
    </div>
    <table class="admin-table">
      <thead>
        <tr><th>Job ID</th><th>Track(s)</th><th>Row</th><th>Created</th><th>Attempts</th><th>Last Error</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${jobRows || '<tr><td colspan="7" class="muted-note" style="padding:16px;text-align:center">No unposted jobs.</td></tr>'}
      </tbody>
    </table>
  `, req.session.username));
}

router.get("/queue", requireAuth, (req, res) => {
  renderQueuePage(req, res);
});

router.post("/queue/clear-failed", requireAuth, requireAdmin, (req, res) => {
  try {
    const removed = clearFailedQueueJobs();
    setFlash(req, "ok", `Removed ${removed} failed job${removed !== 1 ? "s" : ""} from the queue.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/queue");
});

router.post("/queue/clear-all", requireAuth, requireAdmin, (req, res) => {
  try {
    const removed = clearAllQueueJobs();
    setFlash(req, "ok", `Cleared all ${removed} job${removed !== 1 ? "s" : ""} from the queue.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/queue");
});

router.post("/queue/:jobId/remove", requireAuth, requireAdmin, (req, res) => {
  try {
    removeQueueJob(req.params.jobId);
    setFlash(req, "ok", `Job '${req.params.jobId}' removed from queue.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect("/admin/queue");
});

// Applications
function renderApplicationsPage(req, res, { lockedTrack = null } = {}) {
  const state = readRawState();
  const allApps = Object.entries(state.applications || {}).map(([id, a]) => ({ id, ...a }));

  const filterTrack = lockedTrack || req.query.track || "";
  const filterStatus = req.query.status || "";
  // "archived" and "closed" are special pseudo-statuses stored as flags
  const showArchived = filterStatus === "archived";
  const showClosed = filterStatus === "closed";
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = 25;

  let filtered = allApps;
  if (filterTrack) filtered = filtered.filter((a) => a.trackKey === filterTrack);
  if (showArchived) {
    filtered = filtered.filter((a) => a.adminArchived === true);
  } else if (showClosed) {
    filtered = filtered.filter((a) => !a.adminArchived && a.adminDone === true);
  } else if (filterStatus) {
    filtered = filtered.filter((a) => !a.adminArchived && !a.adminDone && a.status === filterStatus);
  } else {
    // Default: hide archived and closed applications
    filtered = filtered.filter((a) => !a.adminArchived && !a.adminDone);
  }

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

  const statusBadge = (a) => {
    if (a.adminArchived) return `<span class="badge badge-archived">archived</span>`;
    if (a.adminDone) return `<span class="badge badge-closed">closed</span>`;
    const s = a.status || "pending";
    const cls = s === "accepted" ? "badge-ok" : s === "denied" ? "badge-err" : s === "closed" ? "badge-closed" : "badge-pending";
    return `<span class="badge ${cls}">${escHtml(s)}</span>`;
  };

  const rows = slice.map((a) => {
    const fields = Array.isArray(a.submittedFields)
      ? a.submittedFields.slice(0, 3).map((f) => escHtml(String(f))).join("<br>")
      : "";
    const editUrl = `/admin/applications/${escHtml(a.trackKey || "_")}/${escHtml(a.id)}`;
    const toggleDoneUrl = `/admin/applications/${encodeURIComponent(a.trackKey || "_")}/${encodeURIComponent(a.id)}/toggle-done`;
    const doneBtn = `<form method="POST" action="${toggleDoneUrl}" style="margin:0">
      <button type="submit" class="btn-sm${a.adminDone ? " btn-done" : ""}" title="${a.adminDone ? "Mark as open" : "Mark as closed"}">${a.adminDone ? "✓ Closed" : "○"}</button>
    </form>`;
    const notesIndicator = a.adminNotes ? ` <span class="muted-note" title="${escHtml(a.adminNotes)}" style="cursor:default">📝</span>` : "";
    return `
      <tr${a.adminArchived ? ' style="opacity:0.6"' : a.adminDone ? ' style="opacity:0.75"' : ""}>
        <td data-label="ID"><a href="${editUrl}" class="track-link"><code>${escHtml(a.id)}</code></a></td>
        <td data-label="Applicant">${escHtml(a.applicantName || "—")}${notesIndicator}</td>
        <td data-label="Track"><a href="/admin/applications/${escHtml(a.trackKey || "")}" class="track-link"><code>${escHtml(a.trackKey || "—")}</code></a></td>
        <td data-label="Status">${statusBadge(a)}</td>
        <td data-label="Created" class="muted-note">${a.createdAt ? escHtml(a.createdAt.slice(0, 10)) : "—"}</td>
        <td data-label="Decided" class="muted-note">${a.decidedAt ? escHtml(a.decidedAt.slice(0, 10)) : "—"}</td>
        <td data-label="Fields" class="field-preview">${fields}</td>
        <td data-label="Closed" class="actions-cell">${doneBtn}</td>
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
    <form method="GET" action="${baseUrl}" class="filter-bar" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;align-items:center">
      ${trackFilterHtml}
      <select name="status">
        <option value="" ${!filterStatus ? "selected" : ""}>All statuses</option>
        <option value="pending" ${filterStatus === "pending" ? "selected" : ""}>Pending</option>
        <option value="accepted" ${filterStatus === "accepted" ? "selected" : ""}>Accepted</option>
        <option value="denied" ${filterStatus === "denied" ? "selected" : ""}>Denied</option>
        <option value="closed" ${filterStatus === "closed" ? "selected" : ""}>Closed</option>
        <option value="archived" ${filterStatus === "archived" ? "selected" : ""}>Archived</option>
      </select>
      <button type="submit" class="btn-primary">Filter</button>
      ${!lockedTrack ? `<a href="/admin/applications" class="btn-sm">Clear</a>` : ""}
    </form>
    <table class="admin-table">
      <thead>
        <tr><th>ID</th><th>Applicant</th><th>Track</th><th>Status</th><th>Created</th><th>Decided</th><th>Fields</th><th>Closed</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="muted-note">No applications found.</td></tr>'}
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
          <select name="role" style="font-size:0.78rem;padding:2px 6px;width:auto">${roleOpts}</select>
          <button type="submit" class="btn-sm">Set</button>
        </form>`;

      // Temporary elevation (moderators only, not already elevated)
      if (storedRole === "moderator" && !isElevated) {
        actions += `
          <form method="POST" action="/admin/users/elevate" style="display:inline;margin-left:4px">
            <input type="hidden" name="username" value="${escHtml(u.username)}"/>
            <select name="hours" style="font-size:0.78rem;padding:2px 6px;width:auto">
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

      // Remove any non-self, non-reserved user
      actions += `
        <form method="POST" action="/admin/users/remove" style="display:inline;margin-left:4px"
          onsubmit="return confirm('Remove user ${escHtml(u.username)}?')">
          <input type="hidden" name="username" value="${escHtml(u.username)}"/>
          <button type="submit" class="btn-sm btn-danger">Remove</button>
        </form>`;
    }

    return `
      <tr>
        <td data-label="Username">${escHtml(u.username)}</td>
        <td data-label="Role">${roleBadge(u)}</td>
        <td data-label="Created" class="muted-note">${escHtml(u.createdAt ? u.createdAt.slice(0, 10) : "—")}</td>
        <td data-label="Actions" class="actions-cell">${actions || "—"}</td>
      </tr>`;
  }).join("");

  const addUserHtml = currentRole === "admin" ? `
    <section class="card" style="margin-top:32px">
      <h2>Add User</h2>
      <form method="POST" action="/admin/users/add" class="inline-form">
        <div class="form-row">
          <div class="field">
            <label>Username</label>
            <input type="text" name="username" required pattern="[^\s]+" title="No spaces allowed"/>
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" required/>
          </div>
          <div class="field">
            <label>Role</label>
            <select name="role">
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn-primary">Add User</button>
      </form>
    </section>` : "";

  res.send(adminLayout("Users", `
    ${flash(req)}
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted-note">No users.</td></tr>'}</tbody>
    </table>
    ${addUserHtml}
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
  const { username, password, role } = req.body;
  const assignedRole = role === "admin" ? "admin" : "moderator";
  try {
    if (!username || !password) throw new Error("Username and password are required.");
    if (/\s/.test(username)) throw new Error("Username cannot contain spaces.");
    addUser(username, password, assignedRole);
    setFlash(req, "ok", `User '${username}' added as ${assignedRole}.`);
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
  const hasDiscordMessage = Boolean(app.messageId && app.channelId);
  const archivedBanner = app.adminArchived
    ? `<div class="flash-error" style="margin-bottom:12px">This application has been archived. The Discord thread has been (or will be) archived by the bot.</div>`
    : "";

  res.send(adminLayout(`Edit Application`, `
    ${flash(req)}
    ${archivedBanner}
    <a href="${backUrl}" class="back-link" style="display:inline-flex;margin-bottom:20px">← Back</a>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.85rem;color:var(--muted)">
        <span><strong>ID:</strong> <code>${escHtml(appId)}</code></span>
        <span><strong>Created:</strong> ${escHtml(app.createdAt || "—")}</span>
        <span><strong>Job:</strong> ${escHtml(app.jobId || "—")}</span>
        <span><strong>Row:</strong> ${escHtml(String(app.rowIndex || "—"))}</span>
        <span><strong>Discord ID:</strong> ${escHtml(app.applicantUserId || "—")}</span>
        ${app.messageId ? `<span><strong>Message:</strong> <code>${escHtml(app.messageId)}</code></span>` : ""}
        ${app.threadId ? `<span><strong>Thread:</strong> <code>${escHtml(app.threadId)}</code></span>` : ""}
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
      <div class="field" style="margin-bottom:12px">
        <label>Admin Notes <span class="muted-note">(internal only — not synced to Discord)</span></label>
        <textarea name="adminNotes" rows="3" placeholder="Internal notes visible only to admins…">${escHtml(app.adminNotes || "")}</textarea>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <input type="checkbox" id="adminDone" name="adminDone" value="1"${app.adminDone ? " checked" : ""} style="width:auto"/>
        <label for="adminDone" style="margin:0;font-size:0.9rem;font-weight:500">Closed <span class="muted-note">(marks application as closed/resolved; does not affect bot decisions)</span></label>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button type="submit" class="btn-primary">Save Changes</button>
        ${hasDiscordMessage ? `<button type="submit" name="syncDiscord" value="1" class="btn-primary" style="background:var(--accent2,#5865f2)">Save &amp; Sync Discord</button>` : ""}
        <a href="${backUrl}" class="btn-sm">Cancel</a>
      </div>
      ${hasDiscordMessage ? `<p class="muted-note" style="margin-top:8px;font-size:0.78rem">"Save &amp; Sync Discord" also updates the embed text in the Discord message.</p>` : ""}
    </form>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}/toggle-done" style="margin:0">
        <button type="submit" class="btn-sm${app.adminDone ? " btn-done" : ""}">${app.adminDone ? "✓ Closed — click to reopen" : "○ Close Application"}</button>
      </form>
      ${!app.adminArchived ? `
        <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}/archive"
          onsubmit="return confirm('Archive this application? The Discord thread will be archived by the bot on its next cycle.')">
          <button type="submit" class="btn-sm btn-danger">Archive (Discord + local)</button>
        </form>` : `
        <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}/unarchive">
          <button type="submit" class="btn-sm">Unarchive</button>
        </form>`}
      <form method="POST" action="/admin/applications/${escHtml(req.params.track)}/${escHtml(appId)}/delete"
        onsubmit="return confirm('Permanently delete this application from the database? This cannot be undone.')">
        <button type="submit" class="btn-sm btn-danger">Delete (permanent)</button>
      </form>
    </div>
  `, req.session.username));
});

router.post("/applications/:track/:id", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  const { applicantName, trackKey, status, decidedAt, decidedBy, submittedFields, syncDiscord, adminNotes, adminDone } = req.body;
  try {
    const fields = String(submittedFields || "").split("\n").map((l) => l.trimEnd()).filter(Boolean);
    const updated = updateApplication(appId, {
      applicantName: String(applicantName || "").trim(),
      trackKey: String(trackKey || "").trim(),
      status: ["pending", "accepted", "denied", "closed"].includes(status) ? status : "pending",
      decidedAt: String(decidedAt || "").trim() || null,
      decidedBy: String(decidedBy || "").trim() || null,
      submittedFields: fields,
      adminNotes: String(adminNotes || "").trim() || null,
      adminDone: adminDone === "1",
    });
    if (syncDiscord && updated?.messageId && updated?.channelId) {
      addPendingAdminAction({
        type: "edit_message",
        appId,
        messageId: updated.messageId,
        channelId: updated.channelId,
        submittedFields: fields,
      });
      setFlash(req, "ok", "Application saved. Discord embed update queued — the bot will apply it on its next cycle.");
    } else {
      setFlash(req, "ok", "Application saved.");
    }
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}/${encodeURIComponent(appId)}`);
});

router.post("/applications/:track/:id/archive", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  try {
    archiveApplication(appId);
    setFlash(req, "ok", `Application '${appId}' archived. The Discord thread will be archived by the bot on its next cycle.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}/${encodeURIComponent(appId)}`);
});

router.post("/applications/:track/:id/unarchive", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  try {
    updateApplication(appId, { adminArchived: false, adminArchivedAt: null });
    setFlash(req, "ok", `Application '${appId}' unarchived.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}/${encodeURIComponent(appId)}`);
});

router.post("/applications/:track/:id/toggle-done", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  try {
    const state = readRawState();
    const app = state.applications?.[appId];
    if (!app) throw new Error(`Application '${appId}' not found.`);
    const nowClosing = !app.adminDone;
    const statusUpdate = nowClosing
      ? { adminDone: true, status: "closed" }
      : { adminDone: false, status: app.status === "closed" ? "pending" : app.status };
    updateApplication(appId, statusUpdate);
    // Closing: queue a Discord thread archive so it gets tidied up on next bot cycle
    if (nowClosing && app.threadId) {
      addPendingAdminAction({
        type: "archive_thread",
        appId,
        messageId: app.messageId || null,
        channelId: app.channelId || null,
        threadId: app.threadId,
      });
    }
    setFlash(req, "ok", nowClosing ? `Application '${appId}' closed. Discord thread will be archived on next bot cycle.` : `Application '${appId}' reopened.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  // Redirect back to wherever they came from (list or detail)
  const ref = req.get("Referer") || `/admin/applications/${encodeURIComponent(req.params.track)}`;
  res.redirect(ref);
});

router.post("/applications/:track/:id/delete", requireAuth, requireAdmin, (req, res) => {
  const appId = req.params.id;
  try {
    deleteApplication(appId);
    setFlash(req, "ok", `Application '${appId}' permanently deleted.`);
  } catch (err) {
    setFlash(req, "error", err.message);
  }
  res.redirect(`/admin/applications/${encodeURIComponent(req.params.track)}`);
});

// Logs
router.get("/logs", requireAuth, (req, res) => {
  // ── Control log ──────────────────────────────────────────────────────────────
  const LOG_LINE_OPTIONS = [50, 100, 200, 500, 1000];
  const CONTROL_LOG_LINES = LOG_LINE_OPTIONS.includes(Number(req.query.lines))
    ? Number(req.query.lines)
    : 200;
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

  // ── Bot error log ─────────────────────────────────────────────────────────────
  const ERROR_LOG_LINE_OPTIONS = [50, 100, 200, 500, 1000];
  const ERROR_LOG_LINES = ERROR_LOG_LINE_OPTIONS.includes(Number(req.query.errlines))
    ? Number(req.query.errlines)
    : 100;

  function renderErrorLogSection(title, logFile, linesCount, linesParam) {
    let rows = "";
    let empty = false;
    try {
      const raw = fs.readFileSync(logFile, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean).slice(-linesCount).reverse();
      if (lines.length === 0) { empty = true; }
      rows = lines.map((line) => {
        let obj;
        try { obj = JSON.parse(line); } catch { obj = { message: line }; }
        const at = obj.timestamp ? escHtml(new Date(obj.timestamp).toLocaleString()) : "—";
        const level = String(obj.level || "error");
        const levelCls = level === "warn" ? "badge-pending" : "badge-err";
        const event = escHtml(obj.event || obj.source || "");
        const msg = escHtml(obj.message || "");
        const stack = obj.stack ? escHtml(String(obj.stack)) : "";
        const extra = Object.entries(obj)
          .filter(([k]) => !["timestamp", "level", "event", "message", "stack", "source", "service", "pid", "component"].includes(k))
          .map(([k, v]) => `${escHtml(k)}: ${escHtml(String(v))}`)
          .join(", ");
        return `<tr>
          <td class="muted-note" style="white-space:nowrap">${at}</td>
          <td><span class="badge ${levelCls}" style="font-size:0.7rem">${escHtml(level)}</span></td>
          <td><strong>${event}</strong>${msg ? `<br><span class="muted-note" style="font-size:0.8rem">${msg}</span>` : ""}</td>
          <td class="muted-note" style="font-size:0.78rem">${extra}</td>
          ${stack ? `<td><details><summary class="muted-note" style="cursor:pointer;font-size:0.75rem">stack</summary><pre style="font-size:0.72rem;white-space:pre-wrap;margin:4px 0">${stack}</pre></details></td>` : "<td></td>"}
        </tr>`;
      }).join("");
    } catch {
      return `<h2 style="font-size:1.1rem;font-weight:700;margin-top:36px;margin-bottom:8px">${escHtml(title)}</h2>
        <p class="muted-note">Log file not found yet: <code>${escHtml(logFile)}</code></p>`;
    }

    return `
      <div style="display:flex;align-items:center;gap:12px;margin-top:36px;margin-bottom:12px;flex-wrap:wrap">
        <h2 style="font-size:1.1rem;font-weight:700;margin:0">${escHtml(title)}</h2>
        <span class="muted-note" style="font-size:0.78rem">${escHtml(logFile)}</span>
        <form method="GET" action="/admin/logs" style="display:flex;flex-direction:row;align-items:center;gap:6px;margin:0">
          <input type="hidden" name="lines" value="${CONTROL_LOG_LINES}"/>
          <label style="font-size:0.82rem;color:var(--muted)">Show last</label>
          <select name="${escHtml(linesParam)}" style="width:auto;font-size:0.82rem;padding:4px 10px" onchange="this.form.submit()">
            ${ERROR_LOG_LINE_OPTIONS.map((n) =>
              `<option value="${n}" ${linesCount === n ? "selected" : ""}>${n}</option>`
            ).join("")}
          </select>
          <span style="font-size:0.82rem;color:var(--muted)">entries</span>
        </form>
      </div>
      <table class="admin-table">
        <thead><tr><th>Time</th><th>Level</th><th>Event / Message</th><th>Details</th><th>Stack</th></tr></thead>
        <tbody>${empty ? '<tr><td colspan="5" class="muted-note">No entries yet.</td></tr>' : (rows || '<tr><td colspan="5" class="muted-note">No entries.</td></tr>')}</tbody>
      </table>`;
  }

  const botErrorHtml = renderErrorLogSection("Bot Errors & Warnings", BOT_ERROR_LOG_FILE, ERROR_LOG_LINES, "errlines");
  const webErrorHtml = renderErrorLogSection("Web Server Errors", WEB_ERROR_LOG_FILE, ERROR_LOG_LINES, "errlines");

  res.send(adminLayout("Logs", `
    ${flash(req)}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <h2 style="font-size:1.1rem;font-weight:700;margin:0">Control Log</h2>
      <form method="GET" action="/admin/logs" style="display:flex;flex-direction:row;align-items:center;gap:8px;margin:0">
        <input type="hidden" name="errlines" value="${ERROR_LOG_LINES}"/>
        <label style="font-size:0.82rem;color:var(--muted)">Show last</label>
        <select name="lines" style="width:auto;font-size:0.82rem;padding:4px 10px" onchange="this.form.submit()">
          ${[50,100,200,500,1000].map((n) =>
            `<option value="${n}" ${CONTROL_LOG_LINES === n ? "selected" : ""}>${n}</option>`
          ).join("")}
        </select>
        <span style="font-size:0.82rem;color:var(--muted)">entries</span>
      </form>
    </div>
    <table class="admin-table">
      <thead><tr><th>Time</th><th>Action</th><th>User</th><th>Details</th></tr></thead>
      <tbody>${controlRows || '<tr><td colspan="4" class="muted-note">No entries.</td></tr>'}</tbody>
    </table>

    ${botErrorHtml}
    ${webErrorHtml}

    <h2 style="font-size:1.1rem;font-weight:700;margin-top:36px;margin-bottom:12px">Crash Logs <span class="muted-note">(20 most recent)</span></h2>
    ${crashHtml}
  `, req.session.username));
});

module.exports = router;
