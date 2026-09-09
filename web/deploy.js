"use strict";

/*
  Core module for deploy.

  Pulling the repo and restarting the processes, for the Deploy page on the admin dashboard.

  Everything here runs a fixed command with a fixed argument list through execFile — no shell,
  and nothing a request body can influence except which of two named processes to restart. The
  point of the page is "ship what is on main", not "run this on the server", and the shape of
  the code should make that hard to confuse.
*/

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEPLOY_LOG = process.env.DEPLOY_LOG_FILE || path.join(REPO_ROOT, "logs/deploy-actions.log");

// PM2 process names from ecosystem.config.cjs. A restart target has to be one of these.
const TARGETS = Object.freeze({
  bot: "taq-event-bot",
  web: "taq-web",
});

const COMMAND_TIMEOUT_MS = 120000;

// run: handles run.
//
// execFile, not exec: an argument list cannot become a second command the way a shell string
// can. Never rejects — the caller wants the exit code and the output either way.
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: REPO_ROOT, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        resolve({
          command: `${command} ${args.join(" ")}`.trim(),
          ok: !error,
          code: error?.code ?? 0,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      }
    );
  });
}

// git: handles git.
function git(...args) {
  return run("git", args);
}

// auditDeploy: handles audit deploy.
//
// Who pulled, who restarted, and what the repo looked like either side of it. The Minecraft
// console keeps its own audit log on the server; this is the same idea for the bot's own code.
function auditDeploy(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(DEPLOY_LOG), { recursive: true });
    fs.appendFileSync(DEPLOY_LOG, `${line}\n`);
  } catch {
    // A deploy that happened is worth more than a log line that did not.
  }
}

// readDeployLog: handles read deploy log.
function readDeployLog(limit = 20) {
  try {
    return fs
      .readFileSync(DEPLOY_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
  } catch {
    return [];
  }
}

// status: handles status.
//
// What is checked out, and whether the remote has moved past it. The fetch is what makes
// "behind" meaningful, so it happens here rather than only inside a pull.
async function status(options = {}) {
  const fetched = options.fetch === false ? null : await git("fetch", "--quiet", "--prune");

  const [branch, commit, subject, author, dirty, counts] = await Promise.all([
    git("rev-parse", "--abbrev-ref", "HEAD"),
    git("rev-parse", "--short", "HEAD"),
    git("log", "-1", "--pretty=%s"),
    git("log", "-1", "--pretty=%an, %ar"),
    git("status", "--porcelain"),
    git("rev-list", "--left-right", "--count", "HEAD...@{u}"),
  ]);

  const [ahead, behind] = counts.ok
    ? counts.stdout.split(/\s+/).map((value) => Number(value) || 0)
    : [0, 0];

  return {
    branch: branch.stdout || "unknown",
    commit: commit.stdout || "unknown",
    subject: subject.stdout || "",
    author: author.stdout || "",
    dirty: dirty.stdout.length > 0,
    // Just the paths: porcelain's status letters are the first thing trimming eats, and the
    // page only needs to say which files would stand in the way of a pull.
    dirtyFiles: dirty.stdout
      ? dirty.stdout.split("\n").map((line) => line.replace(/^\s*\S+\s+/, "")).filter(Boolean)
      : [],
    ahead,
    behind,
    upstreamKnown: counts.ok,
    fetchError: fetched && !fetched.ok ? fetched.stderr || fetched.stdout : "",
  };
}

// pull: handles pull.
//
// --ff-only on purpose: a deploy that needs a merge commit is a deploy that needs a person.
// npm ci only runs when the lockfile actually moved, because it is the slow part.
async function pull(actor) {
  const before = await git("rev-parse", "HEAD");
  const steps = [];

  const fetched = await git("fetch", "--quiet", "--prune");
  steps.push(fetched);

  const pulled = await git("pull", "--ff-only");
  steps.push(pulled);

  let installed = null;
  if (pulled.ok) {
    const after = await git("rev-parse", "HEAD");
    const changed = await git(
      "diff",
      "--name-only",
      `${before.stdout}..${after.stdout}`
    );
    if (/(^|\n)(package-lock\.json|package\.json)(\n|$)/.test(changed.stdout)) {
      installed = await run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"]);
      steps.push(installed);
    }
  }

  const after = await status({ fetch: false });
  auditDeploy({
    action: "pull",
    actor,
    from: before.stdout.slice(0, 7),
    to: after.commit,
    ok: pulled.ok,
    installedDependencies: Boolean(installed),
    failures: steps.filter((step) => !step.ok).map((step) => step.command),
  });

  return { steps, status: after, ok: pulled.ok && (!installed || installed.ok) };
}

// restart: handles restart.
//
// The web process cannot restart itself inside a request — the reply would die with it — so it
// is restarted by a detached child a moment later, and the page says so instead of pretending
// the answer means anything.
async function restart(target, actor) {
  const processName = TARGETS[target];
  if (!processName) {
    throw new Error("Unknown restart target.");
  }

  if (target === "web") {
    const child = require("node:child_process").spawn(
      "sh",
      ["-c", `sleep 2; pm2 restart ${processName}`],
      { cwd: REPO_ROOT, detached: true, stdio: "ignore" }
    );
    child.unref();
    auditDeploy({ action: "restart", actor, target: processName, deferred: true });
    return { deferred: true, target: processName };
  }

  const result = await run("pm2", ["restart", processName]);
  const fallback = result.ok ? null : await run("node", ["scripts/botctl.js", "restart", "--background"]);

  auditDeploy({
    action: "restart",
    actor,
    target: processName,
    ok: result.ok || Boolean(fallback?.ok),
    usedFallback: Boolean(fallback),
  });

  return { deferred: false, target: processName, result, fallback };
}

module.exports = {
  TARGETS,
  status,
  pull,
  restart,
  readDeployLog,
  REPO_ROOT,
};
