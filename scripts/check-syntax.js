#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const roots = ["src/lib", "scripts", "test"];
const extraFiles = ["ecosystem.config.cjs"];

function collectJsFiles(dir, out) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".cjs"))) {
      out.push(fullPath);
    }
  }
}

function runNodeCheck(filePath) {
  return spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8",
  });
}

function main() {
  const files = [];
  for (const root of roots) {
    collectJsFiles(path.resolve(root), files);
  }
  for (const file of extraFiles) {
    if (fs.existsSync(file)) {
      files.push(path.resolve(file));
    }
  }
  if (fs.existsSync("src/index.js")) {
    files.push(path.resolve("src/index.js"));
  }

  let failed = false;
  for (const file of files) {
    const result = runNodeCheck(file);
    if (result.status === 0) {
      continue;
    }
    failed = true;
    process.stderr.write(`\n[check-syntax] Failed: ${file}\n`);
    if (result.stdout) {
      process.stderr.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (failed) {
    process.exit(1);
  }
  process.stdout.write(`[check-syntax] OK (${files.length} files)\n`);
}

main();
