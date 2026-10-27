#!/usr/bin/env node
/**
 * release-cut.mjs — every accepted improvement reaches a user as a version.
 *
 * The rule this script enforces is the one the project runs on: a change is
 * only "done" once the person who installed an older build can hear about it.
 * The app already asks GitHub for the newest release once an hour, so the
 * notification side exists; what was missing was a cut that cannot be half
 * finished. Hence the refusals below — they are the point of the file.
 *
 *   node scripts/release-cut.mjs --kind patch [--dry] [--skip-gates]
 *
 * Refuses when: the tree is dirty, HEAD is not pushed main, the version is not
 * three numbers (a fourth component compares EQUAL to its parent in
 * `isNewerVersion` and would silence the notice it was meant to raise), or the
 * CHANGELOG's Unreleased section holds no line — no notes, no release.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const MANIFESTS = [
  "package.json",
  "frontend/package.json",
  "backend/package.json",
  "package.publish.json",
];
const SEMVER = /^\d+\.\d+\.\d+$/;

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
};
const kind = arg("--kind") ?? "patch";
const DRY = argv.includes("--dry");
const SKIP_GATES = argv.includes("--skip-gates");

function die(msg) {
  console.error(`release-cut: ${msg}`);
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", ...opts }).trim();
}
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const write = (p, s) => {
  if (!DRY) writeFileSync(path.join(REPO, p), s);
  console.log(`  wrote ${p}`);
};

/** Three numbers, nothing else. */
function bump(v, kind) {
  const [a, b, c] = v.split(".").map(Number);
  if (kind === "major") return `${a + 1}.0.0`;
  if (kind === "minor") return `${a}.${b + 1}.0`;
  if (kind === "patch") return `${a}.${b}.${c + 1}`;
  return die(`--kind must be patch|minor|major, got "${kind}"`);
}

// ── 1. the tree says what the release will say ─────────────────────────────
if (kind === "patch") {
  // nothing extra; kept so the intent is visible at the top
}
const status = run("git", ["status", "--porcelain"]);
if (status) die(`working tree is not clean:\n${status}`);
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") die(`a release is cut from main, this is "${branch}"`);
run("git", ["fetch", "--quiet", "origin", "main"]);
const head = run("git", ["rev-parse", "HEAD"]);
const remote = run("git", ["rev-parse", "origin/main"]);
if (head !== remote) die(`HEAD ${head.slice(0, 7)} is not what origin/main holds (${remote.slice(0, 7)}) — push first`);

// ── 2. version ─────────────────────────────────────────────────────────────
const current = JSON.parse(read("package.json")).version;
if (!SEMVER.test(current)) die(`installed version "${current}" is not MAJOR.MINOR.PATCH`);
const next = bump(current, kind);
if (!SEMVER.test(next)) die("unreachable");
console.log(`release ${current} -> ${next} (${kind})${DRY ? " [dry]" : ""}`);

// ── 3. the notes must already exist ────────────────────────────────────────
const changelog = read("CHANGELOG.md");
// Up to the next released heading, or to the end of the file. The first cut of this
// regex let `\s*$` end the lazy group on the heading's own newline, so a section of
// five written notes read as none — caught by a dry run, not by a release.
const unreleased = /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m.exec(changelog);
if (!unreleased) die('CHANGELOG.md has no "## [Unreleased]" section — every pushed improvement gets a line there first');
const lines = unreleased[1].split("\n").filter((l) => l.trim().startsWith("- "));
if (lines.length === 0) die("the Unreleased section holds no bullet — a release without notes is a version number nobody can use");
console.log(`  ${lines.length} note line(s) since the last cut`);

// ── 4. gates, before anything is written that could break them ─────────────
if (!SKIP_GATES && !DRY) {
  for (const gate of ["lint", "type-check", "test", "build"]) {
    process.stdout.write(`  gate: npm run ${gate} … `);
    try {
      run("npm", ["run", gate], { stdio: ["ignore", "pipe", "pipe"] });
      console.log("ok");
    } catch {
      console.log("");
      die(`the ${gate} gate is red — a release is never cut around a failing gate`);
    }
  }
  process.stdout.write("  gate: node scripts/audit-gate.mjs … ");
  try {
    run("node", ["scripts/audit-gate.mjs"], { stdio: ["ignore", "pipe", "pipe"] });
    console.log("ok");
  } catch {
    console.log("");
    die("the audit gate is red");
  }
  process.stdout.write("  gate: npm run pack:check … ");
  try {
    run("npm", ["run", "pack:check"], { stdio: ["ignore", "pipe", "pipe"] });
    console.log("ok");
  } catch {
    console.log("");
    die("the packed install did not boot — see scripts/pack-check.mjs");
  }
}

// ── 5. write the version into every manifest that carries it ───────────────
const names = MANIFESTS.map((f) => [f, JSON.parse(read(f)).name]);
for (const [file] of names) {
  const raw = read(file);
  const json = JSON.parse(raw);
  const out = raw.replace(/("version":\s*")([^"]+)(")/, `$1${next}$3`);
  if (out === raw) die(`${file} carries no version string to rewrite`);
  if (json.version !== current) die(`${file} says ${json.version}, root says ${current} — fix the manifests first`);
  write(file, out);
}
{
  const lock = JSON.parse(read("package-lock.json"));
  const workspaceNames = new Set(names.map(([, n]) => n));
  let hits = 0;
  const raw = read("package-lock.json");
  const patched = raw.replace(
    /(\{\s*\n\s*"name":\s*"(?:[^"]+)",\s*\n\s*"version":\s*")[^"]+(")/g,
    (m, pre, post) => {
      const name = /"name":\s*"([^"]+)"/.exec(m)[1];
      if (!workspaceNames.has(name)) return m;
      hits += 1;
      return `${pre}${next}${post}`;
    },
  );
  const check = JSON.parse(patched);
  if (check.version !== next || check.packages[""].version !== next) die("the lockfile root was not rewritten");
  for (const key of ["frontend", "backend"]) {
    if (check.packages[key]?.version !== next) die(`lockfile packages.${key} still holds an old version`);
  }
  if (hits !== 4) die(`expected 4 version fields in package-lock.json, rewrote ${hits}`);
  write("package-lock.json", patched);
}

// ── 6. the CHANGELOG section ───────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const dated = `## [${next}] - ${today}\n${unreleased[1].replace(/\n+$/, "")}\n`;
const withRelease = changelog.replace(unreleased[0], `## [Unreleased]\n\n${dated}`);
write("CHANGELOG.md", withRelease);

if (DRY) {
  console.log("dry run stops here: nothing was written, committed, tagged or published.");
  process.exit(0);
}

// ── 7. commit, tag, publish ────────────────────────────────────────────────
run("git", ["add", ...MANIFESTS, "package-lock.json", "CHANGELOG.md"]);
run("git", ["commit", "-m", `chore: ${next}`]);
const sha = run("git", ["rev-parse", "HEAD"]);
const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
run("git", ["tag", "-a", `v${next}`, "-m", `Ephemora Skyline ${next}`]);
run("git", ["push", "origin", "main"]);
run("git", ["push", "origin", `v${next}`]);

const notesDir = path.join(REPO, ".qoder-scratch", "release-notes");
mkdirSync(notesDir, { recursive: true });
const notesFile = path.join(notesDir, `${next}.md`);
writeFileSync(notesFile, unreleased[1].trim() + "\n");
const url = run("gh", ["release", "create", `v${next}`, "--title", `Ephemora Skyline ${next}`, "--notes-file", notesFile]).trim();

// ── 8. the identity of what was published ──────────────────────────────────
console.log(
  JSON.stringify(
    { version: next, commit: sha, tree, tag: `v${next}`, release: url, notes: lines.length },
    null,
    2,
  ),
);
