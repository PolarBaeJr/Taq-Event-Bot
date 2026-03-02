"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "../.bot-state.json");
const SEED_FILE = path.join(__dirname, "users.seed.json");

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

// ── Role cache ────────────────────────────────────────────────────────────────

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const roleCache = new Map(); // Map<discordId, { guildRoles, fetchedAt }>

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of roleCache) {
    if (now - entry.fetchedAt > ROLE_CACHE_TTL_MS) {
      roleCache.delete(id);
    }
  }
}, 15 * 60 * 1000).unref();

function getRoleCacheEntry(discordId) {
  const entry = roleCache.get(discordId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ROLE_CACHE_TTL_MS) return null;
  return entry;
}

function setRoleCacheEntry(discordId, guildRoles) {
  roleCache.set(discordId, { guildRoles, fetchedAt: Date.now() });
}

function clearRoleCacheEntry(discordId) {
  roleCache.delete(discordId);
}

function clearAllRoleCache() {
  roleCache.clear();
}

function getRoleCacheTTL() {
  return ROLE_CACHE_TTL_MS;
}

// ── Auth config helpers ───────────────────────────────────────────────────────

let _envAuthServersCache = null;

function parseEnvAuthServers() {
  if (_envAuthServersCache) return _envAuthServersCache;
  const servers = [];
  let i = 1;
  while (true) {
    const guildId = process.env[`DISCORD_AUTH_SERVER_${i}_GUILD_ID`];
    if (!guildId) break;
    servers.push({
      guildId,
      adminRoleId: process.env[`DISCORD_AUTH_SERVER_${i}_ADMIN_ROLE_ID`] || null,
      modRoleId: process.env[`DISCORD_AUTH_SERVER_${i}_MOD_ROLE_ID`] || null,
      source: "env",
    });
    i++;
  }
  _envAuthServersCache = servers;
  return servers;
}

function loadRuntimeAuthServers() {
  const state = readRawState();
  const servers = state?.settings?.discordAuthServers;
  return Array.isArray(servers) ? servers : [];
}

function isValidSnowflake(id) {
  return /^\d{17,20}$/.test(String(id ?? ""));
}

function saveRuntimeAuthServer({ guildId, adminRoleId, modRoleId, addedBy }) {
  if (!isValidSnowflake(guildId)) throw new Error("Invalid guild ID (must be 17-20 digit snowflake).");
  if (adminRoleId && !isValidSnowflake(adminRoleId)) throw new Error("Invalid admin role ID.");
  if (modRoleId && !isValidSnowflake(modRoleId)) throw new Error("Invalid mod role ID.");

  const env = parseEnvAuthServers();
  if (env.some((s) => s.guildId === guildId)) {
    throw new Error(`Guild ${guildId} is already configured via environment variables.`);
  }

  withState((state) => {
    if (!Array.isArray(state.settings.discordAuthServers)) {
      state.settings.discordAuthServers = [];
    }
    if (state.settings.discordAuthServers.some((s) => s.guildId === guildId)) {
      throw new Error(`Guild ${guildId} already exists.`);
    }
    state.settings.discordAuthServers.push({
      guildId,
      adminRoleId: adminRoleId || null,
      modRoleId: modRoleId || null,
      addedBy: addedBy || null,
      addedAt: new Date().toISOString(),
      source: "runtime",
    });
  });
}

function removeRuntimeAuthServer(guildId) {
  const env = parseEnvAuthServers();
  if (env.some((s) => s.guildId === guildId)) {
    throw new Error(`Guild ${guildId} is configured via environment variables and cannot be removed here.`);
  }
  withState((state) => {
    if (!Array.isArray(state.settings.discordAuthServers)) {
      throw new Error(`Guild ${guildId} not found.`);
    }
    const before = state.settings.discordAuthServers.length;
    state.settings.discordAuthServers = state.settings.discordAuthServers.filter((s) => s.guildId !== guildId);
    if (state.settings.discordAuthServers.length === before) {
      throw new Error(`Guild ${guildId} not found.`);
    }
  });
}

function getAllAuthServers() {
  const env = parseEnvAuthServers();
  const runtime = loadRuntimeAuthServers();
  const envIds = new Set(env.map((s) => s.guildId));
  const merged = [...env];
  for (const s of runtime) {
    if (!envIds.has(s.guildId)) merged.push(s);
  }
  return merged;
}

// ── Session helpers ───────────────────────────────────────────────────────────

function getSessionUser(session) {
  return session?.discordUser || null;
}

function setSessionUser(session, discordUser, accessToken) {
  session.discordUser = discordUser;
  session.accessToken = accessToken;
  session.authenticatedAt = new Date().toISOString();
}

function clearSessionUser(session) {
  delete session.discordUser;
  delete session.accessToken;
  delete session.authenticatedAt;
}

// guildRoles: Map<guildId, { roles: string[] }>
// authServers: array from getAllAuthServers()
// Returns 'admin' | 'moderator' | null
function getEffectiveRoleFromGuildRoles(guildRoles, authServers) {
  let highestRole = null;
  for (const server of authServers) {
    const entry = guildRoles.get(server.guildId);
    if (!entry) continue;
    const roles = entry.roles || [];
    if (server.adminRoleId && roles.includes(server.adminRoleId)) {
      return "admin"; // admin is highest — short circuit
    }
    if (server.modRoleId && roles.includes(server.modRoleId)) {
      highestRole = "moderator";
    }
  }
  return highestRole;
}

function isUserAuthorized(guildRoles, authServers) {
  return getEffectiveRoleFromGuildRoles(guildRoles, authServers) !== null;
}

// ── requireAuth middleware ─────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const discordUser = getSessionUser(req.session);
  if (!discordUser?.id) return res.redirect("/admin/login");

  let guildRoles = getRoleCacheEntry(discordUser.id)?.guildRoles;

  if (!guildRoles) {
    try {
      const authServers = getAllAuthServers();
      const guildIds = authServers.map((s) => s.guildId);
      const { fetchAllGuildRoles } = require("./discordOAuth");
      const rolesMap = await fetchAllGuildRoles(req.session.accessToken, guildIds);
      guildRoles = rolesMap;
      setRoleCacheEntry(discordUser.id, guildRoles);
    } catch (err) {
      console.error("[web/auth] Failed to fetch guild roles:", err.message);
      const staleEntry = roleCache.get(discordUser.id);
      if (staleEntry) {
        guildRoles = staleEntry.guildRoles;
        console.warn("[web/auth] Using stale role cache for user", discordUser.id);
      } else {
        setFlash(req, "error", "Could not verify your Discord roles. Please try again.");
        return res.redirect("/admin/login");
      }
    }
  }

  const authServers = getAllAuthServers();
  const effectiveRole = getEffectiveRoleFromGuildRoles(guildRoles, authServers);

  if (!effectiveRole) {
    clearSessionUser(req.session);
    setFlash(req, "error", "You do not have the required Discord role to access this panel.");
    return res.redirect("/admin/login");
  }

  req.discordUser = { ...discordUser, effectiveRole, guildRoles };
  next();
}

// ── requireAdmin middleware ────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.discordUser?.effectiveRole === "admin") return next();
  setFlash(req, "error", "Admin access required.");
  return res.redirect("/admin/dashboard");
}

// ── Flash helpers ─────────────────────────────────────────────────────────────

function setFlash(req, type, text) {
  if (req.session) req.session.flash = { type, text };
}

function getFlash(req) {
  const msg = req.session?.flash;
  if (msg) delete req.session.flash;
  return msg || null;
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateToDiscordAuth() {
  try {
    const state = readRawState();
    if (state?.settings?.discordAuthMigrated) return;
    if (!state.settings) state.settings = {};
    delete state.settings.webUsers;
    state.settings.discordAuthMigrated = true;
    writeRawState(state);
    console.log("[web/auth] Migrated to Discord OAuth. webUsers wiped.");
    // Clear users.seed.json
    try {
      fs.writeFileSync(SEED_FILE, "[]\n");
    } catch { /* seed file not writable — skip */ }
  } catch (err) {
    console.error("[web/auth] Migration error:", err.message);
  }
}

// ── Seed questions from questions.js defaults ─────────────────────────────────

function seedQuestionsFromDefaults() {
  const { COMMON_FIELDS, TRACK_QUESTIONS } = require("./questions");
  const all = loadCustomQuestions();
  let changed = false;

  if (!Array.isArray(all["__default__"])) {
    all["__default__"] = COMMON_FIELDS.map((q) => ({ ...q }));
    changed = true;
  }

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
  if (swapIdx < 0 || swapIdx >= arr.length) return;
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
  if (updates.id !== undefined && updates.id !== questionId) {
    const newId = String(updates.id).trim();
    if (!newId) throw new Error("Question ID cannot be empty.");
    if (!/^[A-Za-z0-9_-]+$/.test(newId)) throw new Error("Question ID may only contain letters, numbers, underscores, and hyphens.");
    if (all[trackKey].some((q) => q.id === newId)) throw new Error(`Question ID '${newId}' is already in use.`);
  }
  Object.assign(q, updates);
  saveCustomQuestions(all);
  return q;
}

// ── Application I/O ───────────────────────────────────────────────────────────

function addPendingAdminAction(action) {
  const state = readRawState();
  if (!Array.isArray(state.pendingAdminActions)) state.pendingAdminActions = [];
  state.pendingAdminActions.push({
    id: crypto.randomBytes(8).toString("hex"),
    requestedAt: new Date().toISOString(),
    ...action,
  });
  writeRawState(state);
}

function updateApplication(appId, updates) {
  const state = readRawState();
  if (!state.applications?.[appId]) throw new Error(`Application '${appId}' not found.`);
  Object.assign(state.applications[appId], updates);
  writeRawState(state);
  return state.applications[appId];
}

function deleteApplication(appId) {
  const state = readRawState();
  if (!state.applications?.[appId]) throw new Error(`Application '${appId}' not found.`);
  delete state.applications[appId];
  writeRawState(state);
}

// ── Job queue management ──────────────────────────────────────────────────────

function reorderTrackQuestions(trackKey, orderedIds) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[trackKey])) throw new Error(`No questions for track '${trackKey}'.`);
  const byId = new Map(all[trackKey].map((q) => [q.id, q]));
  const reordered = orderedIds
    .filter((id) => byId.has(id))
    .map((id) => byId.get(id));
  for (const q of all[trackKey]) {
    if (!orderedIds.includes(q.id)) reordered.push(q);
  }
  all[trackKey] = reordered;
  saveCustomQuestions(all);
}

function moveQuestionBetweenTracks(fromTrack, questionId, toTrack, atIndex) {
  const all = loadCustomQuestions();
  if (!Array.isArray(all[fromTrack])) throw new Error(`No questions for source track '${fromTrack}'.`);
  const qIdx = all[fromTrack].findIndex((q) => q.id === questionId);
  if (qIdx === -1) throw new Error(`Question '${questionId}' not found in track '${fromTrack}'.`);
  const [question] = all[fromTrack].splice(qIdx, 1);
  if (!Array.isArray(all[toTrack])) all[toTrack] = [];
  const insertAt = Number.isInteger(atIndex) && atIndex >= 0
    ? Math.min(atIndex, all[toTrack].length)
    : all[toTrack].length;
  all[toTrack].splice(insertAt, 0, question);
  saveCustomQuestions(all);
}

function removeQueueJob(jobId) {
  const state = readRawState();
  if (!Array.isArray(state.postJobs)) throw new Error("No job queue found.");
  const before = state.postJobs.length;
  state.postJobs = state.postJobs.filter((j) => j.jobId !== jobId);
  if (state.postJobs.length === before) throw new Error(`Job '${jobId}' not found in queue.`);
  writeRawState(state);
}

function clearFailedQueueJobs() {
  const state = readRawState();
  if (!Array.isArray(state.postJobs)) return 0;
  const before = state.postJobs.length;
  state.postJobs = state.postJobs.filter((j) => !j.lastError);
  const removed = before - state.postJobs.length;
  if (removed > 0) writeRawState(state);
  return removed;
}

function clearAllQueueJobs() {
  const state = readRawState();
  const count = Array.isArray(state.postJobs) ? state.postJobs.length : 0;
  state.postJobs = [];
  writeRawState(state);
  return count;
}

function archiveApplication(appId) {
  const state = readRawState();
  const app = state.applications?.[appId];
  if (!app) throw new Error(`Application '${appId}' not found.`);
  app.adminArchived = true;
  app.adminArchivedAt = new Date().toISOString();
  if (!Array.isArray(state.pendingAdminActions)) state.pendingAdminActions = [];
  state.pendingAdminActions.push({
    id: crypto.randomBytes(8).toString("hex"),
    type: "archive_thread",
    appId,
    messageId: app.messageId || null,
    channelId: app.channelId || null,
    threadId: app.threadId || null,
    requestedAt: new Date().toISOString(),
  });
  writeRawState(state);
}

function getUniversalVoterIds() {
  const state = readRawState();
  const ids = state?.settings?.universalVoters;
  const list = Array.isArray(ids) ? ids : [];
  const OWNER = "307750254281883650";
  if (!list.includes(OWNER)) return [OWNER, ...list];
  return list;
}

function addUniversalVoter(userId) {
  const state = readRawState();
  if (!state.settings) state.settings = {};
  if (!Array.isArray(state.settings.universalVoters)) state.settings.universalVoters = [];
  if (state.settings.universalVoters.includes(userId)) throw new Error(`User ${userId} is already a universal voter.`);
  state.settings.universalVoters.push(userId);
  writeRawState(state);
}

function removeUniversalVoter(userId) {
  if (userId === "307750254281883650") throw new Error("The bot owner cannot be removed from universal voters.");
  const state = readRawState();
  if (!state.settings || !Array.isArray(state.settings.universalVoters)) throw new Error(`User ${userId} not found.`);
  const before = state.settings.universalVoters.length;
  state.settings.universalVoters = state.settings.universalVoters.filter((id) => id !== userId);
  if (state.settings.universalVoters.length === before) throw new Error(`User ${userId} not found.`);
  writeRawState(state);
}

function castWebVote(appId, discordId, vote) {
  if (!["accept", "deny"].includes(vote)) throw new Error("Vote must be 'accept' or 'deny'.");
  const state = readRawState();
  const app = state.applications?.[appId];
  if (!app) throw new Error(`Application '${appId}' not found.`);
  if (app.status !== "pending") throw new Error(`Application '${appId}' is not open for voting.`);
  if (!app.webVotes || typeof app.webVotes !== "object") app.webVotes = {};
  app.webVotes[discordId] = { vote, votedAt: new Date().toISOString() };
  writeRawState(state);
}

module.exports = {
  // Role cache
  getRoleCacheEntry,
  setRoleCacheEntry,
  clearRoleCacheEntry,
  clearAllRoleCache,
  getRoleCacheTTL,
  roleCache,
  // Auth config
  parseEnvAuthServers,
  loadRuntimeAuthServers,
  saveRuntimeAuthServer,
  removeRuntimeAuthServer,
  getAllAuthServers,
  isValidSnowflake,
  // Session
  getSessionUser,
  setSessionUser,
  clearSessionUser,
  getEffectiveRoleFromGuildRoles,
  isUserAuthorized,
  // Middleware
  requireAuth,
  requireAdmin,
  // Flash
  setFlash,
  getFlash,
  // Migration
  migrateToDiscordAuth,
  // Questions
  seedQuestionsFromDefaults,
  loadCustomQuestions,
  saveCustomQuestions,
  getTrackCustomQuestions,
  addCustomQuestion,
  removeCustomQuestion,
  moveCustomQuestion,
  resetCustomQuestions,
  editCustomQuestion,
  // Applications
  updateApplication,
  deleteApplication,
  archiveApplication,
  addPendingAdminAction,
  // Queue
  removeQueueJob,
  clearFailedQueueJobs,
  clearAllQueueJobs,
  reorderTrackQuestions,
  moveQuestionBetweenTracks,
  // Universal voters
  getUniversalVoterIds,
  addUniversalVoter,
  removeUniversalVoter,
  castWebVote,
};
