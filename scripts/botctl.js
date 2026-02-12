const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawn, spawnSync } = require("node:child_process");

const PID_FILE = path.resolve(process.cwd(), ".bot.pid");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/botctl.js start [--background]",
      "  node scripts/botctl.js stop [--background]",
      "  node scripts/botctl.js restart [--background]",
      "",
      "Notes:",
      "  --background with stop only targets the PID saved in .bot.pid when available.",
    ].join("\n")
  );
}

function readPidFile() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePidFile(pid) {
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // Ignore if it does not exist.
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listBotPids() {
  const cwd = process.cwd().replace(/\\/g, "/");
  let output = "";
  try {
    output = execSync("ps -axo pid=,command=", { encoding: "utf8" });
  } catch {
    return [];
  }

  const lines = output.split("\n").filter(Boolean);
  const matches = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const firstSpace = trimmed.indexOf(" ");
    if (firstSpace < 1) {
      continue;
    }

    const pid = Number(trimmed.slice(0, firstSpace).trim());
    const command = trimmed.slice(firstSpace + 1);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
      continue;
    }

    const normalized = command.replace(/\\/g, "/");
    const isNodeBot =
      normalized.includes("node src/index.js") ||
      normalized.includes(`${cwd}/src/index.js`);
    const isNodemonBot =
      normalized.includes("nodemon src/index.js") ||
      normalized.includes(`${cwd}/node_modules/.bin/nodemon src/index.js`) ||
      normalized.includes(`${cwd}/node_modules/nodemon/bin/nodemon.js src/index.js`);

    if (isNodeBot || isNodemonBot) {
      matches.push(pid);
    }
  }

  return [...new Set(matches)];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminatePids(pids) {
  if (pids.length === 0) {
    return 0;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore missing/permission failures here.
    }
  }

  const deadline = Date.now() + 3000;
  let alive = pids.filter(isRunning);
  while (alive.length > 0 && Date.now() < deadline) {
    await wait(150);
    alive = alive.filter(isRunning);
  }

  for (const pid of alive) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore.
    }
  }

  return pids.length;
}

function startForeground() {
  const result = spawnSync(process.execPath, ["src/index.js"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

function startBackground() {
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  writePidFile(child.pid);
  console.log(`Bot started in background (PID ${child.pid}).`);
}

async function stopProcess(backgroundOnly) {
  const running = listBotPids();
  const pidFromFile = readPidFile();

  let targets = [];
  if (backgroundOnly && pidFromFile && isRunning(pidFromFile)) {
    targets = [pidFromFile];
  } else if (backgroundOnly && pidFromFile && !isRunning(pidFromFile)) {
    targets = [];
  } else {
    targets = running;
  }

  if (targets.length === 0) {
    removePidFile();
    console.log("No running bot process found.");
    return;
  }

  const count = await terminatePids(targets);
  if (pidFromFile && targets.includes(pidFromFile)) {
    removePidFile();
  }
  console.log(`Stopped ${count} bot process(es).`);
}

async function restartProcess(background) {
  await stopProcess(false);
  if (background) {
    startBackground();
    return;
  }
  startForeground();
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  const background = args.includes("--background");

  if (!action || action === "--help" || action === "-h") {
    usage();
    process.exit(0);
  }

  if (action === "start") {
    if (background) {
      startBackground();
      return;
    }
    startForeground();
    return;
  }

  if (action === "stop") {
    await stopProcess(background);
    return;
  }

  if (action === "restart") {
    await restartProcess(background);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error("botctl failed:", err.message);
  process.exit(1);
});
