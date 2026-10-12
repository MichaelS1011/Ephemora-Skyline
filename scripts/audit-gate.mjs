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
 * below with a reason and a re-check date. Anything else fails the build.
 *
 *   node scripts/audit-gate.mjs
 */
import { execFileSync } from "child_process";

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

let report;
try {
  report = audit();
  // npm also prints JSON for transport errors. That is not an empty audit.
  if (
    !report ||
    report.error ||
    !report.metadata?.vulnerabilities ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities)
  ) {
    throw new Error("npm did not return a complete vulnerability report");
  }
} catch (error) {
  console.error(`FAIL — dependency audit could not be completed: ${error.message}`);
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
    const ownAllowed = own.length > 0 && own.every((id) => ALLOWED.has(id));
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
  for (const [id, a] of ALLOWED) {
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
  }
  console.error("\nFix the dependency, or add the advisory to ALLOWED with a reason and a date.");
  process.exit(1);
}
console.log("\nPASS — every high/critical finding is either fixed or explicitly accepted above.");
