#!/usr/bin/env node
// dev.js — Watch Sources/ for .swift changes and auto-restart `swift run OpenIslandApp`.
// Usage: node scripts/dev.js

const { spawn } = require("child_process");
const { watch } = require("fs");
const { resolve, extname } = require("path");

const ROOT = resolve(__dirname, "..");
const DEBOUNCE_MS = 500;
const WATCH_DIRS = ["Sources", "Package.swift"];

let app = null;
let debounceTimer = null;
let building = false;

function kill() {
  if (!app) return Promise.resolve();
  return new Promise((res) => {
    app.on("close", res);
    process.kill(-app.pid, "SIGTERM");
    setTimeout(() => {
      try {
        process.kill(-app.pid, "SIGKILL");
      } catch {}
    }, 3000);
  });
}

async function buildAndRun() {
  if (building) return;
  building = true;

  await kill();

  console.log("\n\x1b[36m[dev]\x1b[0m building...");
  const build = spawn("swift", ["build", "--product", "OpenIslandApp"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const code = await new Promise((res) => build.on("close", res));
  if (code !== 0) {
    console.log("\x1b[31m[dev]\x1b[0m build failed. Waiting for next change...");
    building = false;
    return;
  }

  console.log("\x1b[36m[dev]\x1b[0m starting OpenIslandApp...");
  app = spawn("swift", ["run", "--skip-build", "OpenIslandApp"], {
    cwd: ROOT,
    stdio: "inherit",
    detached: true,
  });

  app.on("close", (c) => {
    if (app && app.pid) {
      console.log(`\x1b[33m[dev]\x1b[0m process exited (code ${c})`);
      app = null;
    }
  });

  console.log(`\x1b[32m[dev]\x1b[0m running (pid ${app.pid}). Watching for changes...`);
  building = false;
}

function scheduleRestart() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(buildAndRun, DEBOUNCE_MS);
}

// Recursive fs.watch on each directory
function watchDir(dir) {
  try {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && extname(filename) === ".swift") {
        console.log(`\x1b[36m[dev]\x1b[0m changed: ${filename}`);
        scheduleRestart();
      }
    });
  } catch (err) {
    console.error(`\x1b[31m[dev]\x1b[0m cannot watch ${dir}: ${err.message}`);
  }
}

// Watch Package.swift as a single file
function watchFile(file) {
  try {
    watch(file, () => {
      console.log(`\x1b[36m[dev]\x1b[0m changed: Package.swift`);
      scheduleRestart();
    });
  } catch {}
}

async function main() {
  console.log("\x1b[36m[dev]\x1b[0m Open Island dev server");
  console.log("\x1b[36m[dev]\x1b[0m watching Sources/ and Package.swift\n");

  watchDir(resolve(ROOT, "Sources"));
  watchFile(resolve(ROOT, "Package.swift"));

  await buildAndRun();
}

process.on("SIGINT", async () => {
  console.log("\n\x1b[36m[dev]\x1b[0m shutting down...");
  clearTimeout(debounceTimer);
  await kill();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearTimeout(debounceTimer);
  await kill();
  process.exit(0);
});

main();
