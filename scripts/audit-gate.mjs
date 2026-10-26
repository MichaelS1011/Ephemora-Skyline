#!/usr/bin/env node
/**
 * The dependency gate CI runs.
 *
 * `npm audit --audit-level=high` is a blunt object: it fails on every high
 * finding, including one that has no fix anywhere upstream. A gate that cannot
 * pass gets weakened by hand eventually, which is how an audit step stops
 * meaning anything. So this script keeps the rule strict and makes the single
 * exception explicit, dated and reviewable.
 *
 * Rule: every high or critical finding must trace back to an advisory listed
 * below with a reason, a dated entry and a re-check date that has not run out.
 * Anything else fails the build. An exception is only good while it is honest:
 * real UTC dates, re-check at most 180 days after it was added, and today still
 * inside that window. Past the date it stops counting and the finding fails.
 *
 *   node scripts/audit-gate.mjs
 */
import { execFileSync } from "child_process";

/** Longest window an exception may claim, in calendar days. */
const RECHECK_CAP_DAYS = 180;

/**
 * Findings that are accepted, with why. Removing an entry the moment upstream
 * ships a fix is the point of the recheck date.
 */
const ALLOWED = new Map([
  [
    "GHSA-vfj7-8cjw-p6xm",
    {
      title: "braces: stack exhaustion through deeply nested patterns",
      why: "No fixed release exists — braces 3.0.3 is both the latest and the last affected. Reached only through tailwindcss 3.4.x (chokidar, fast-glob → micromatch), which is a build-time file watcher and not part of anything the tool serves. Tailwind 4 would drop the path but is a real migration: 231 utility-class call sites and a CSS-first config.",
      added: "2026-10-04",
      recheck: "2026-12-01",
      ref: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    },
  ],
]);

/**
 * Today, UTC calendar day. Read from the system clock once and nowhere else:
 * no argument, no environment seam — an escape hatch here would be an escape
 * hatch in CI, and the date is what makes the exception reviewable at all.
 */
const TODAY_UTC = new Date().toISOString().slice(0, 10);

/** Calendar day as a day number, or null when the string is not a real UTC date. */
function utcDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Round trip: the lenient parser rolls 2026-02-30 over to 2026-03-02.
  if (new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms / 86_400_000;
}

/** Why an entry no longer counts, or null while it still does. */
function expiryReason(entry) {
  const added = utcDay(entry.added);
  const recheck = utcDay(entry.recheck);
  if (added === null) return `added "${entry.added}" is not a real UTC date`;
  if (recheck === null) return `recheck "${entry.recheck}" is not a real UTC date`;
  if (recheck < utcDay(TODAY_UTC)) return `recheck ${entry.recheck} is past due`;
  if (recheck < added) return `recheck ${entry.recheck} is before added ${entry.added}`;
  if (recheck - added > RECHECK_CAP_DAYS)
    return (
      `recheck ${entry.recheck} is more than ${RECHECK_CAP_DAYS} days ` +
      `past added ${entry.added}`
    );
  return null;
}

/**
 * Exceptions that are still good today. An expired or malformed entry is not a
 * pass: the advisory simply stops being explained and lands in the failing list.
 */
const ACCEPTED = new Map();
const inert = [];
for (const [id, entry] of ALLOWED) {
  const reason = expiryReason(entry);
  if (reason) inert.push({ id, reason });
  else ACCEPTED.set(id, entry);
}
const inertNote = (dead) =>
  `${dead.id} is listed in ALLOWED but does not count: ${dead.reason} (today ${TODAY_UTC} UTC)`;

function audit() {
  try {
    return JSON.parse(
      execFileSync("npm", ["audit", "--json"], { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }),
    );
  } catch (e) {
    // npm audit exits non-zero when it finds anything — the report is still on stdout.
    const out = e.stdout?.toString();
    if (!out) throw e;
    return JSON.parse(out);
  }
}

/**
 * A complete report, or nothing. `npm audit` prints valid JSON for transport
 * errors too, so a parseable answer is not yet an answer — and while a build is
 * running, two npm processes can make the registry call fail once. Retrying a
 * bounded number of times measures the audit again; accepting an incomplete
 * report would silently turn a security gate into a pass.
 */
const ATTEMPTS = [
  0,
  ...(process.env.AUDIT_GATE_RETRY_MS ?? "2000,5000")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n)),
];
let report;
const incomplete = (r) =>
  !r ||
  r.error ||
  !r.metadata?.vulnerabilities ||
  !r.vulnerabilities ||
  typeof r.vulnerabilities !== "object" ||
  Array.isArray(r.vulnerabilities);

let lastError = null;
for (let attempt = 0; attempt < ATTEMPTS.length; attempt++) {
  // Every attempt after the first is announced, even a wait of 0: the line is
  // the proof that the audit was measured again, and a silent retry would make
  // the gate's own test count nothing while it still ran.
  if (attempt > 0) {
    const wait = ATTEMPTS[attempt];
    if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait /* ms */);
    console.log(`retrying the audit after ${wait / 1000}s (attempt ${attempt + 1}) …`);
  }
  let candidate = null;
  try {
    candidate = audit();
    lastError = null;
  } catch (error) {
    lastError = error;
  }
  if (candidate && !incomplete(candidate)) {
    report = candidate;
    break;
  }
  if (!lastError) lastError = new Error("npm did not return a complete vulnerability report");
  report = null;
}

if (lastError || incomplete(report)) {
  console.error(
    `FAIL — dependency audit could not be completed: ${lastError?.message ?? "incomplete report"}`,
  );
  process.exit(1);
}
const vulns = report.vulnerabilities;

/** Advisory ids a package carries directly (its own `via` entries that are advisories). */
function directIds(v) {
  const ids = new Set();
  for (const via of v.via ?? []) {
    if (typeof via === "string") continue; // a dependency, not an advisory
    const url = via.url ?? "";
    const m = url.match(/advisories\/(GHSA-[0-9a-z-]+|npm:\w+)/i);
    if (m) ids.add(m[1]);
    else if (via.name) ids.add(via.name);
  }
  return ids;
}

function severityOf(v) {
  return v.severity === "critical" || v.severity === "high" ? v.severity : null;
}

// A package is explained when its own advisories are all allowed AND every
// dependency it blames is itself explained. Iterate to a fixed point because
// the report is a graph, not a list.
const explained = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const [name, v] of Object.entries(vulns)) {
    if (explained.has(name)) continue;
    const sev = severityOf(v);
    if (!sev) {
      explained.add(name);
      grew = true;
      continue;
    }
    const own = [...directIds(v)];
    const deps = (v.via ?? []).filter((x) => typeof x === "string");
    const ownAllowed = own.length > 0 && own.every((id) => ACCEPTED.has(id));
    const depsExplained = deps.length > 0 && deps.every((d) => explained.has(d));
    if (
      (own.length === 0 || ownAllowed) &&
      (deps.length === 0 || depsExplained) &&
      own.length + deps.length > 0
    ) {
      explained.add(name);
      grew = true;
    }
  }
}

const failing = Object.entries(vulns).filter(([name, v]) => severityOf(v) && !explained.has(name));
const accepted = Object.entries(vulns).filter(([name, v]) => severityOf(v) && explained.has(name));

console.log(`npm audit: ${JSON.stringify(report.metadata?.vulnerabilities ?? {})}`);
if (accepted.length) {
  console.log(`\nAccepted by the gate (${accepted.length} package path(s)):`);
  for (const [name] of accepted) console.log(`  · ${name}`);
  // Only an exception that explains a real high/critical finding counts as one.
  const explainedIds = new Set(accepted.flatMap(([, v]) => [...directIds(v)]));
  for (const [id, a] of ACCEPTED) {
    if (!explainedIds.has(id)) continue;
    console.log(`\n  ${id} — ${a.title}`);
    console.log(`    why: ${a.why}`);
    console.log(`    added ${a.added}, re-check ${a.recheck} — ${a.ref}`);
  }
}
if (failing.length) {
  console.error(`\nFAIL — ${failing.length} high/critical finding(s) are not accepted:`);
  for (const [name, v] of failing) {
    console.error(`  · ${name} (${v.severity})`);
    for (const via of v.via ?? [])
      console.error(
        typeof via === "string" ? `      via package ${via}` : `      ${via.title} — ${via.url}`,
      );
    for (const id of directIds(v)) {
      const dead = inert.find((entry) => entry.id === id);
      if (dead) console.error(`      ${inertNote(dead)}`);
    }
  }
  console.error("\nFix the dependency, or add the advisory to ALLOWED with a reason and a date.");
  process.exit(1);
}
// Nothing failed, so an inert entry is not a finding — but it must not go unsaid.
for (const dead of inert) console.error(`note: ${inertNote(dead)}`);
/**
 * A waiver for an advisory the audit did not report today. Not a finding, so it
 * does not fail the gate — but it has to say itself out loud: an ALLOWED list
 * nobody can still match against a real report is how a threshold gets lowered
 * one silent entry at a time.
 */
const reportedIds = new Set(Object.values(vulns).flatMap((v) => [...directIds(v)]));
for (const [id, a] of ACCEPTED) {
  if (reportedIds.has(id) || inert.some((dead) => dead.id === id)) continue;
  console.error(
    `note: ${id} is listed in ALLOWED but no finding carried it today ` +
      `(added ${a.added}, re-check ${a.recheck}) — delete the entry or state why it stays.`,
  );
}
console.log("\nPASS — every high/critical finding is either fixed or explicitly accepted above.");
