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

// A build pulls a base image and runs npm ci; two minutes is a pull's budget, not a
// build's.
const IMAGE_TIMEOUT_MS = 900000;

// The compose service and the tag it runs, from docker-compose.yml. Both are constants
// here for the same reason the pm2 names are: a request must not be able to name a
// container.
const COMPOSE_SERVICE = "taq-event";
const IMAGE_TAG = "ghcr.io/polarbaejr/taq-event-bot:latest";

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

// docker: handles docker.
//
// "docker compose", not "docker-compose": the v1 script is gone from current installs,
// and the subcommand form is what ships with the daemon.
function docker(...args) {
  return run("docker", args, { timeout: IMAGE_TIMEOUT_MS });
}

// dockerAvailable: whether there is a daemon to talk to at all.
//
// Asked before anything is offered, so a host running the bot under pm2 gets told the
// image controls do not apply to it rather than a failed command.
async function dockerAvailable() {
  const probe = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  return { ok: probe.ok, version: probe.stdout, error: probe.stderr };
}

// imageStatus: what is running, and what it was built from.
//
// The digest is the honest answer to "is this the latest image" — tags move, and two
// containers on the same tag can be running different code. Compared against the local
// copy of the tag, so a pull that has not been applied yet is visible.
async function imageStatus() {
  const daemon = await dockerAvailable();
  if (!daemon.ok) {
    return { available: false, error: daemon.error || "No Docker daemon on this host." };
  }

  const [container, tagged] = await Promise.all([
    run("docker", [
      "inspect",
      COMPOSE_SERVICE,
      "--format",
      "{{.State.Status}}\t{{.Config.Image}}\t{{.Image}}\t{{.State.StartedAt}}",
    ]),
    run("docker", ["image", "inspect", IMAGE_TAG, "--format", "{{.Id}}\t{{.Created}}"]),
  ]);

  const [state, configImage, runningImageId, startedAt] = container.ok
    ? container.stdout.split("\t")
    : [];
  const [localImageId, localCreated] = tagged.ok ? tagged.stdout.split("\t") : [];

  return {
    available: true,
    daemonVersion: daemon.version,
    service: COMPOSE_SERVICE,
    tag: IMAGE_TAG,
    running: Boolean(container.ok),
    state: state || "not created",
    configImage: configImage || "",
    startedAt: startedAt || "",
    runningImageId: runningImageId || "",
    localImageId: localImageId || "",
    localImageCreated: localCreated || "",
    imagePresent: Boolean(tagged.ok),
    // The one thing worth acting on: the tag on disk is newer than what is running.
    stale: Boolean(container.ok && tagged.ok && runningImageId && localImageId
      && runningImageId !== localImageId),
  };
}

// updateImage: bring the container up to date with the image.
//
// mode "pull" takes the image CI published; mode "build" makes one here. Either way the
// container is recreated afterwards, because a new image does nothing until something
// runs it. Both are fixed argument lists — the only thing a request chooses is which of
// these two words it sent.
async function updateImage(mode, actor) {
  if (mode !== "pull" && mode !== "build") {
    throw new Error("Unknown image update mode.");
  }

  const before = await imageStatus();
  if (!before.available) {
    throw new Error(before.error);
  }

  const steps = [];
  const fetched = mode === "pull"
    ? await docker("compose", "pull", COMPOSE_SERVICE)
    : await docker("compose", "build", "--pull", COMPOSE_SERVICE);
  steps.push(fetched);

  // Recreated even when the pull found nothing new: a container left stopped by a
  // previous half-finished update should come back up, and up -d on an unchanged image
  // is a no-op.
  let recreated = null;
  if (fetched.ok) {
    recreated = await docker("compose", "up", "-d", COMPOSE_SERVICE);
    steps.push(recreated);
  }

  const after = await imageStatus();
  auditDeploy({
    action: `image_${mode}`,
    actor,
    service: COMPOSE_SERVICE,
    tag: IMAGE_TAG,
    ok: fetched.ok && Boolean(recreated?.ok),
    fromImage: before.runningImageId.slice(0, 19),
    toImage: after.runningImageId.slice(0, 19),
    failures: steps.filter((step) => !step.ok).map((step) => step.command),
  });

  return { mode, steps, status: after, ok: fetched.ok && Boolean(recreated?.ok) };
}

module.exports = {
  TARGETS,
  status,
  pull,
  restart,
  readDeployLog,
  imageStatus,
  updateImage,
  dockerAvailable,
  COMPOSE_SERVICE,
  IMAGE_TAG,
  REPO_ROOT,
};
