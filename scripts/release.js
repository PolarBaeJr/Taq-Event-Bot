#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  return String(pkg.version || "").trim();
}

function usage() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/release.js <version|major|minor|patch> [--push] [--all]",
      "",
      "Options:",
      "  --push   Push commit and tag to origin after creating the release",
      "  --all    Stage all changed files before committing",
    ].join("\n")
  );
  process.stdout.write("\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const releaseTarget = args.find((arg) => !arg.startsWith("-"));
  if (!releaseTarget) {
    usage();
    process.exit(1);
  }

  const shouldPush = args.includes("--push");
  const stageAll = args.includes("--all");

  run("npm", ["version", releaseTarget, "--no-git-tag-version"]);
  const version = readPackageVersion();
  if (!version) {
    process.stderr.write("Could not read version from package.json after bump.\n");
    process.exit(1);
  }
  const tagName = `v${version}`;

  if (stageAll) {
    run("git", ["add", "-A"]);
  } else {
    run("git", ["add", "README.md", "CHANGELOG.md", "package.json", "package-lock.json"]);
  }

  run("git", ["commit", "-m", `release: ${tagName}`]);
  run("git", ["tag", "-a", tagName, "-m", tagName]);

  if (shouldPush) {
    run("git", ["push", "origin", "HEAD"]);
    run("git", ["push", "origin", tagName]);
  }

  process.stdout.write(`Release complete: ${tagName}\n`);
}

main();
