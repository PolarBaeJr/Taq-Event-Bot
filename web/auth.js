"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "../.bot-state.json");

// ── State I/O helpers ─────────────────────────────────────────────────────────

function readRawState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeRawState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function withState(fn) {
  const state = readRawState();
  if (!state.settings || typeof state.settings !== "object") {
    state.settings = {};
  }
  const result = fn(state);
  writeRawState(state);
  return result;
}

// ── Password crypto ───────────────────────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
    .toString("hex");
  return { salt, hash };
}

function verifyPassword(password, storedHash, storedSalt) {
  try {
    const hash = crypto
      .scryptSync(password, storedSalt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
      .toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

// ── User management ───────────────────────────────────────────────────────────

function loadUsers() {
  const state = readRawState();
  const users = state?.settings?.webUsers;
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  withState((state) => {
    state.settings.webUsers = users;
  });
}

function findUser(username) {
  return loadUsers().find((u) => u.username === username) || null;
}

// Returns "admin" or "moderator". Checks temporary elevation expiry.
function getEffectiveRole(user) {
  if (!user) return null;
  if (user.role === "admin") return "admin";
  if (user.elevatedUntil && new Date(user.elevatedUntil) > new Date()) return "admin";
  return user.role || "admin"; // backwards compat: users without role field = admin
}

function addUser(username, password, role = "moderator") {
  const users = loadUsers();
  if (users.some((u) => u.username === username)) {
    throw new Error(`User '${username}' already exists.`);
  }
  const { salt, hash } = hashPassword(password);
  users.push({ username, hash, salt, role, createdAt: new Date().toISOString() });
  saveUsers(users);
}

function elevateUser(username, hours) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`User '${username}' not found.`);
  if (user.role === "admin") throw new Error("User is already a permanent admin.");
  user.elevatedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  saveUsers(users);
  return user.elevatedUntil;
}

function revokeElevation(username) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`User '${username}' not found.`);
  delete user.elevatedUntil;
  saveUsers(users);
}

function removeUser(username) {
  const users = loadUsers();
  const filtered = users.filter((u) => u.username !== username);
  if (filtered.length === users.length) {
    throw new Error(`User '${username}' not found.`);
  }
  saveUsers(filtered);
}

function setUserRole(username, role) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`User '${username}' not found.`);
  if (!["admin", "moderator"].includes(role)) throw new Error("Invalid role.");
  user.role = role;
  if (role === "admin") delete user.elevatedUntil; // clear temp elevation when making permanent admin
  saveUsers(users);
}

function changePassword(username, newPassword) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`User '${username}' not found.`);
  const { salt, hash } = hashPassword(newPassword);
  user.hash = hash;
  user.salt = salt;
  saveUsers(users);
}

function authenticateUser(username, password) {
  const user = findUser(username);
  if (!user) return false;
  return verifyPassword(password, user.hash, user.salt);
}

// ── Bootstrap users from seed file and/or env vars ───────────────────────────

const SEED_FILE = path.join(__dirname, "users.seed.json");

function bootstrapAdminIfNeeded() {
  let users = loadUsers();
  let changed = false;

  // Read seed file if present — create any users not already in the list
  try {
    const raw = fs.readFileSync(SEED_FILE, "utf8");
    const seeds = JSON.parse(raw);
    if (Array.isArray(seeds)) {
      for (const entry of seeds) {
        const username = String(entry.username || "").trim();
        const password = String(entry.password || "").trim();
        if (!username || !password) continue;
        const existing = users.find((u) => u.username === username);
        const { salt, hash } = hashPassword(password);
        const role = String(entry.role || "admin");
        if (existing) {
          // Always update password AND role from seed file so it acts as source of truth
          existing.hash = hash;
          existing.salt = salt;
          existing.role = role;
          console.log(`[web/auth] Updated password from users.seed.json: ${username}`);
        } else {
          users.push({ username, hash, salt, role, createdAt: new Date().toISOString() });
          console.log(`[web/auth] Seeded user from users.seed.json: ${username}`);
        }
        changed = true;
      }
    }
  } catch { /* seed file missing or invalid — skip */ }

  // Fallback: env var single-user bootstrap (only if still no users)
  if (users.length === 0) {
    const adminUser = process.env.WEB_ADMIN_USER;
    const adminPass = process.env.WEB_ADMIN_PASSWORD;
    if (adminUser && adminPass) {
      const { salt, hash } = hashPassword(adminPass);
      users.push({ username: adminUser, hash, salt, role: "admin", createdAt: new Date().toISOString() });
      console.log(`[web/auth] Seeded admin user from env: ${adminUser}`);
      changed = true;
    }
  }

  if (changed) saveUsers(users);
}

// ── Seed questions from questions.js defaults ─────────────────────────────────

function seedQuestionsFromDefaults() {
  const { COMMON_FIELDS, TRACK_QUESTIONS } = require("./questions");
  const all = loadCustomQuestions();
  let changed = false;

  // Seed __default__ from COMMON_FIELDS if not yet set
  if (!Array.isArray(all["__default__"])) {
    all["__default__"] = COMMON_FIELDS.map((q) => ({ ...q }));
    changed = true;
  }

  // Seed each built-in track if not yet set
  for (const [trackKey, questions] of Object.entries(TRACK_QUESTIONS)) {
    if (!Array.isArray(all[trackKey])) {
      all[trackKey] = questions.map((q) => ({ ...q }));
      changed = true;
    }
  }

  if (changed) {
    saveCustomQuestions(all);
    console.log("[web/auth] Seeded custom questions from questions.js defaults");
  }
}

// ── Custom questions I/O ──────────────────────────────────────────────────────

function loadCustomQuestions() {
  const state = readRawState();
  const cq = state?.settings?.trackCustomQuestions;
  return cq && typeof cq === "object" ? cq : {};
}

function saveCustomQuestions(trackCustomQuestions) {
  withState((state) => {
    state.settings.trackCustomQuestions = trackCustomQuestions;
  });
}

function getTrackCustomQuestions(trackKey) {
  const all = loadCustomQuestions();
  return Array.isArray(all[trackKey]) ? all[trackKey] : [];
}

function addCustomQuestion(trackKey, question) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[trackKey])) all[trackKey] = [];
  // Enforce unique id within track
  const id = String(question.id || "").trim();
  if (!id) throw new Error("Question id is required.");
  if (all[trackKey].some((q) => q.id === id)) {
    throw new Error(`Question id '${id}' already exists for track '${trackKey}'.`);
  }
  all[trackKey].push(question);
  saveCustomQuestions(all);
}

function removeCustomQuestion(trackKey, questionId) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[trackKey])) throw new Error(`No custom questions for track '${trackKey}'.`);
  const before = all[trackKey].length;
  all[trackKey] = all[trackKey].filter((q) => q.id !== questionId);
  if (all[trackKey].length === before) throw new Error(`Question '${questionId}' not found.`);
  saveCustomQuestions(all);
}

function moveCustomQuestion(trackKey, questionId, direction) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[trackKey])) throw new Error(`No custom questions for track '${trackKey}'.`);
  const arr = all[trackKey];
  const idx = arr.findIndex((q) => q.id === questionId);
  if (idx === -1) throw new Error(`Question '${questionId}' not found.`);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= arr.length) return; // already at boundary
  [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
  saveCustomQuestions(all);
}

function resetCustomQuestions(trackKey) {
  const all = loadCustomQuestions();
  delete all[trackKey];
  saveCustomQuestions(all);
}

function editCustomQuestion(trackKey, questionId, updates) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[trackKey])) throw new Error(`No custom questions for track '${trackKey}'.`);
  const q = all[trackKey].find((q) => q.id === questionId);
  if (!q) throw new Error(`Question '${questionId}' not found.`);
  Object.assign(q, updates);
  saveCustomQuestions(all);
  return q;
}

// ── Application I/O ───────────────────────────────────────────────────────────

function updateApplication(appId, updates) {
  const state = readRawState();
  if (!state.applications?.[appId]) throw new Error(`Application '${appId}' not found.`);
  Object.assign(state.applications[appId], updates);
  writeRawState(state);
}

function deleteApplication(appId) {
  const state = readRawState();
  if (!state.applications?.[appId]) throw new Error(`Application '${appId}' not found.`);
  delete state.applications[appId];
  writeRawState(state);
}

// ── requireAuth middleware ─────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  res.redirect("/admin/login");
}

module.exports = {
  hashPassword,
  verifyPassword,
  loadUsers,
  saveUsers,
  findUser,
  addUser,
  removeUser,
  changePassword,
  authenticateUser,
  bootstrapAdminIfNeeded,
  seedQuestionsFromDefaults,
  loadCustomQuestions,
  saveCustomQuestions,
  getTrackCustomQuestions,
  addCustomQuestion,
  removeCustomQuestion,
  moveCustomQuestion,
  resetCustomQuestions,
  editCustomQuestion,
  updateApplication,
  deleteApplication,
  requireAuth,
  getEffectiveRole,
  elevateUser,
  revokeElevation,
  setUserRole,
};
