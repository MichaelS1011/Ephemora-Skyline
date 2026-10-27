#!/usr/bin/env node
/**
 * push-guard.mjs — the two classes of red this repo actually shipped, stopped
 * at the one moment that can still catch them: before the push.
 *
 * Both classes were mine, on 2026-10-27, in two consecutive commits:
 *   `6585e9f` added a test file and nobody re-ran the count guards, so the
 *   published walk sentence (609/586) stayed behind the tree (610/587).
 *   `d877e77` added a test file that only ever ran under vitest, never under
 *   `tsc`, and CI's stricter index typing said so.
 * A blunt "run all six gates" hook would be right and would be bypassed within
 * a week, because it costs minutes on commits that cannot break either class.
 * So this reads the diff and runs exactly the guards that the pushed commits
 * can fail — and says which ones it skipped and why.
 *
 *   node scripts/push-guard.mjs          # what the pre-push hook runs
 *   SKIP_PUSH_GUARD=1 git push           # the operator's door, never silent
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const DOC_PATHS = /(^|\/)(README\.md|CONTRIBUTING\.md|SECURITY\.md|CHANGELOG\.md|docs\/)/;
const TEST_PATHS = /(^|\/)(frontend|backend)\/tests\/.*\.(test|spec)\.tsx?$/;

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function run(cmd, args, cwd) {
  const t0 = Date.now();
  try {
    execFileSync(cmd, args, { cwd: cwd ?? REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, ms: Date.now() - t0, out: "" };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - t0,
      out: `${(e.stdout ?? "") + (e.stderr ?? "")}`.trim().split("\n").slice(0, 24).join("\n"),
    };
  }
}

if (/^(1|true|on)$/i.test(process.env.SKIP_PUSH_GUARD ?? "")) {
  console.log("push-guard: SKIPPED by SKIP_PUSH_GUARD — the operator's door, and CI stays the last word.");
  process.exit(0);
}

let base = "";
try {
  base = git(["rev-parse", "origin/main"]);
} catch {
  console.log("push-guard: no origin/main in sight — running every guard.");
}
const head = git(["rev-parse", "HEAD"]);
const tree = git(["rev-parse", "HEAD^{tree}"]);
const changed = git(["diff", "--name-only", ...(base ? [`${base}...${head}`] : ["--cached", "--diff-filter=d", "HEAD"])]).split("\n").filter(Boolean);
// Which paths the pushed commits ADD or DELETE — that is what moves a count.
const addedOrRemoved = base
  ? git(["diff", "--name-status", "--diff-filter=ADR", `${base}...${head}`]).split("\n").filter(Boolean)
  : ["<full tree>"];

const tsTouched = changed.filter((f) => /\.(ts|tsx|mjs)$/.test(f));
const workspaces = [...new Set(tsTouched.map((f) => f.split("/")[0]).filter((w) => ["frontend", "backend"].includes(w)))];
if (tsTouched.some((f) => !/^(frontend|backend)\//.test(f))) workspaces.push("root");
const testsTouched = changed.filter((f) => TEST_PATHS.test(f));
const docsTouched = changed.filter((f) => DOC_PATHS.test(f));
// The walk count is a count of FILES. Any added or removed path can move it —
// `6585e9f` and `eb01eeb` both went red in CI for exactly this, once because a
// test file appeared and once because a script did, and the first version of
// this guard watched only tests and docs.
const countsAtRisk = testsTouched.length > 0 || docsTouched.length > 0 || addedOrRemoved.length > 0;

// A verified tree stays verified: the same HEAD does not need the same minute
// twice, and a re-push after a rejected hook run should cost nothing.
const stamp = createHash("sha256")
  .update(`${tree}|${workspaces.join(",")}|${countsAtRisk ? "counts" : "no-counts"}`)
  .digest("hex")
  .slice(0, 16);
const stampDir = path.join(REPO, ".qoder-scratch", "push-guard");
const stampFile = path.join(stampDir, `${stamp}.ok`);
if (base && readOK(stampFile)) {
  console.log(`push-guard: HEAD tree ${tree.slice(0, 7)} already green (${readOK(stampFile)}). Nothing to redo.`);
  process.exit(0);
}

function readOK(p) {
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
}

console.log(
  `push-guard: ${changed.length} file(s) between origin/main and ${head.slice(0, 7)} — ` +
    `type-check [${workspaces.join(", ") || "none"}], count guards [${countsAtRisk ? `yes — ${addedOrRemoved.length} added/removed path(s)` : "not at risk"}]`,
);

const failures = [];
function step(name, cmd, args, cwd) {
  process.stdout.write(`  ${name} … `);
  const r = run(cmd, args, cwd);
  console.log(r.ok ? `ok (${(r.ms / 1000).toFixed(1)} s)` : `RED (${(r.ms / 1000).toFixed(1)} s)`);
  if (!r.ok) {
    failures.push({ name, out: r.out });
    console.log(r.out.split("\n").map((l) => `      ${l}`).join("\n"));
  }
}

// 1. The typing class: only the workspaces the pushed commits touch. Root
//    scripts have no tsconfig of their own — the honest gate there is the
//    parser the runtime uses, and it is named as that.
for (const ws of workspaces) {
  if (ws === "root") {
    const scripts = tsTouched.filter((f) => !/^(frontend|backend)\//.test(f) && f.endsWith(".mjs"));
    for (const f of scripts) step(`node --check ${f}`, "node", ["--check", f]);
    continue;
  }
  step(`type-check ${ws}`, "npm", ["run", "type-check"], path.join(REPO, ws));
  step(`lint ${ws}`, "npm", ["run", "lint"], path.join(REPO, ws));
}

// 2. The published-number class: a new test file or a doc line moves the walk
//    count, the file count and the case count. Those guards are the cheap ones.
if (countsAtRisk) {
  step(
    "count guards (backend)",
    "npx",
    ["vitest", "run", "tests/claims-counts.test.ts", "tests/claims-surface.test.ts", "tests/beleg-01-toolchain-claims.test.ts", "tests/selbst23-two-numbers.test.ts", "tests/beleg-07-doc-citations.test.ts", "--reporter=dot"],
    path.join(REPO, "backend"),
  );
  step(
    "count guards (frontend)",
    "npx",
    ["vitest", "run", "tests/beleg-01-two-numbers.test.ts", "--reporter=dot"],
    path.join(REPO, "frontend"),
  );
}

if (failures.length > 0) {
  console.log(`push-guard: ${failures.length} guard(s) RED — the push is refused. Fix, then push; CI would only say it later.`);
  process.exit(1);
}

mkdirSync(stampDir, { recursive: true });
writeFileSync(stampFile, `${head}\n`);
console.log(`push-guard: green — tree ${tree.slice(0, 7)} may go out.`);
