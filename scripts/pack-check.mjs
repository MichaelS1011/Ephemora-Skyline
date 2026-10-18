#!/usr/bin/env node
/**
 * Does the thing we would publish actually work?
 *
 * Everything else in this repo is tested as a checkout. A package is a
 * different artefact: npm drops files `files` does not name, resolves different
 * paths and runs from another directory. Measured the first time this was
 * tried: the launcher died on a missing `backend/package.json` that the
 * checkout always had — a defect that no test of the source could see.
 *
 * Steps: clean build → assemble a package-only folder → `npm pack` →
 * install into an empty temp dir → start the launcher → ask `/api/health` and
 * the page → stop. Exit 1 on any failure, printing the line that failed.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const step = (msg) => console.log(`  · ${msg}`);

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: "pipe" });
}

function fail(msg) {
  console.error(`\npack-check: ${msg}\n`);
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "ephemora-pack-"));
try {
  step("build both workspaces");
  run("npm", ["run", "build"], repo);

  step("assemble the package folder");
  const stage = path.join(work, "package");
  mkdirSync(path.join(stage, "scripts"), { recursive: true });
  cpSync(path.join(repo, "package.publish.json"), path.join(stage, "package.json"));
  cpSync(path.join(repo, "scripts", "ephemora-skyline.mjs"), path.join(stage, "scripts", "ephemora-skyline.mjs"));
  for (const dir of ["backend/dist", "frontend/dist"]) {
    cpSync(path.join(repo, dir), path.join(stage, dir), { recursive: true });
  }
  for (const file of ["README.md", "LICENSE", "NOTICE"]) {
    if (existsSync(path.join(repo, file))) cpSync(path.join(repo, file), path.join(stage, file));
  }

  step("pack");
  const packed = JSON.parse(run("npm", ["pack", "--json"], stage))[0];
  const tarball = path.join(stage, packed.filename);
  step(`${packed.filename}: ${(packed.size / 1024 / 1024).toFixed(2)} MB packed, ${packed.entryCount} files`);

  step("install into an empty folder");
  const consumer = path.join(work, "consumer");
  mkdirSync(consumer);
  execFileSync("npm", ["init", "-y"], { cwd: consumer, stdio: "ignore" });
  execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: consumer, stdio: "ignore" });

  step("start the launcher");
  const port = String(4200 + Math.floor(Math.random() * 300));
  const bin = path.join(consumer, "node_modules", "ephemora-skyline", "scripts", "ephemora-skyline.mjs");
  if (!existsSync(bin)) fail("the installed package has no launcher script");
  const child = spawn(process.execPath, [bin], {
    cwd: consumer,
    env: { ...process.env, PORT: port, EPHEMORA_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const deadline = Date.now() + 30_000;
  let health = null;
  while (Date.now() < deadline && health === null) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) health = await res.json();
    } catch {
      /* not up yet */
    }
  }
  if (!health) fail(`the launcher never answered on :${port}\n${log}`);
  const page = await fetch(`http://127.0.0.1:${port}/`);
  if (!page.ok) fail(`GET / answered ${page.status}\n${log}`);
  const html = await page.text();
  if (!html.includes("<div id=\"root\"")) fail("GET / did not return the built app");
  const packageVersion = JSON.parse(readFileSync(path.join(stage, "package.json"), "utf-8")).version;
  if (health.version !== packageVersion) {
    fail(`the server reports ${health.version}, the package says ${packageVersion}`);
  }
  child.kill("SIGTERM");
  step(`health ok, app served, version ${health.version} matches the package`);
  console.log("\npack-check: PASS");
} finally {
  rmSync(work, { recursive: true, force: true });
}
