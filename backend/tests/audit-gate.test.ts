import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GATE = path.resolve(import.meta.dirname, "../../scripts/audit-gate.mjs");

/** The marker in the shipped gate that a test copy replaces with a fixture. */
const EMPTY_ALLOWED = "const ALLOWED = new Map();";

/**
 * The subject is the shipped `scripts/audit-gate.mjs` gate itself: each case
 * spawns that script with a fake `npm` on PATH that prints a canned report, so
 * the real npm-audit network call is never made. The forked process is the
 * thing under test, not a scanner engine — this stays real on purpose.
 *
 * `gateSource` replaces the gate file for one case; see `gateWithEntry`.
 */
function runAudit(report: unknown, status: number, gateSource?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "skyline-audit-test-"));
  try {
    writeFileSync(
      path.join(dir, "npm"),
      `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify(report))});\nprocess.exit(${status});\n`,
      { mode: 0o755 },
    );
    let script = GATE;
    if (gateSource !== undefined) {
      script = path.join(dir, "audit-gate.substituted.mjs");
      writeFileSync(script, gateSource);
    }
    return spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
        // The gate retries a broken audit call. Tests measure the behaviour, not
        // the waiting, so the backoff is silenced here and pinned separately.
        AUDIT_GATE_RETRY_MS: "0,0",
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A recheck case cannot use the shipped dates: the shipped list carries no
 * entry today. So each case spawns a copy with one fixture advisory and its own
 * dates. The assertions here are the proof that the substitution really
 * happened — a no-op swap would make the case green for the wrong reason.
 */
function gateWithEntry(added: string, recheck: string) {
  const src = readFileSync(GATE, "utf8");
  expect(src.split(EMPTY_ALLOWED).length - 1).toBe(1);
  const entry = `const ALLOWED = new Map([["GHSA-vfj7-8cjw-p6xm", { title: "braces", why: "test fixture", added: ${JSON.stringify(added)}, recheck: ${JSON.stringify(recheck)}, ref: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }]]);`;
  const patched = src.replace(EMPTY_ALLOWED, entry);
  expect(patched).not.toBe(src);
  expect(patched).toContain(`added: ${JSON.stringify(added)}`);
  expect(patched).toContain(`recheck: ${JSON.stringify(recheck)}`);
  return patched;
}

/** One high finding, explained only by the ALLOWED braces advisory. */
function bracesOnlyReport() {
  return {
    vulnerabilities: {
      braces: {
        severity: "high",
        via: [
          {
            name: "braces",
            title: "braces: stack exhaustion through deeply nested patterns",
            url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
          },
        ],
      },
    },
    metadata: { vulnerabilities: { high: 1, critical: 0 } },
  };
}

describe("dependency audit release gate", () => {
  it("does not let an accepted advisory conceal an unaccepted dependency", () => {
    const result = runAudit(
      {
        vulnerabilities: {
          wrapper: {
            severity: "high",
            via: [
              { name: "braces", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" },
              "unsafe",
            ],
          },
          unsafe: {
            severity: "high",
            via: [{ name: "unsafe", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }],
          },
        },
        metadata: { vulnerabilities: { high: 2, critical: 0 } },
      },
      1,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wrapper (high)");
  });
  it("refuses a network error instead of claiming an empty audit passed", () => {
    const result = runAudit({ error: { code: "ENOTFOUND" } }, 1);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not be completed");
    expect(result.stdout).not.toContain("PASS");
    expect(
      (result.stdout.match(/retrying the audit/g) ?? []).length,
      "a transport error is measured again, not accepted",
    ).toBe(2);
  });

  it("keeps a real backoff between the retries", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../../scripts/audit-gate.mjs"),
      "utf8",
    );
    expect(source, "die Wartezeiten sind 2s und 5s, nicht 0").toContain("2000,5000");
  });
  it("refuses an incomplete report even when npm exits successfully", () => {
    const result = runAudit({}, 0);
    expect(result.status).toBe(1);
    expect(result.stdout, "gueltiges JSON ohne Bericht ist kein Bericht").toContain(
      "retrying the audit",
    );
  });
  it("accepts a complete clean report, and ships no waiver to explain", () => {
    const result = runAudit(
      { vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } },
      0,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).not.toContain("listed in ALLOWED");
  });
  it("still rejects an unaccepted high advisory from npm's nonzero result", () => {
    const result = runAudit(
      {
        vulnerabilities: {
          example: {
            severity: "high",
            via: [
              {
                name: "example",
                title: "Example",
                url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
              },
            ],
          },
        },
        metadata: { vulnerabilities: { high: 1 } },
      },
      1,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not accepted");
  });

  it("fails when an accepted advisory's recheck date is past due", () => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2026-10-04", "2000-01-01"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("2000-01-01");
    expect(result.stderr).toContain(todayUtc);
    expect(result.stderr).toContain("braces (high)");
    expect(result.stdout).not.toContain("PASS");
  });

  it("fails when a recheck date is not a real UTC calendar date", () => {
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2026-10-04", "2026-13-45"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("2026-13-45");
    expect(result.stdout).not.toContain("PASS");
  });

  it("accepts a future recheck inside the 180-day cap, with the substituted dates", () => {
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2098-01-01", "2098-04-01"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("added 2098-01-01, re-check 2098-04-01");
    expect(result.stdout).toContain("· braces");
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).not.toContain("FAIL");
  });

  it("fails one calendar day past the 180-day cap: added 2098-01-01, recheck 2098-07-01", () => {
    // 2098 is not a leap year, so 2098-07-01 sits 181 days after 2098-01-01.
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2098-01-01", "2098-07-01"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("more than 180 days");
    expect(result.stderr).toContain("2098-07-01");
    expect(result.stderr).toContain("braces (high)");
    expect(result.stdout).not.toContain("PASS");
  });

  it("accepts a recheck on exactly the 180th day: added 2098-01-01, recheck 2098-06-30", () => {
    // 2098-06-30 is the last calendar day inside the cap; one day more fails.
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2098-01-01", "2098-06-30"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("added 2098-01-01, re-check 2098-06-30");
    expect(result.stdout).toContain("· braces");
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).not.toContain("FAIL");
  });

  it("says out loud when a waiver matches no finding today", () => {
    // A silent exception list is how a gate accumulates waivers nobody can
    // still check against reality. The shipped list is empty today, so this
    // case injects one fixture entry and hands it a clean report.
    const result = runAudit(
      { vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } },
      0,
      gateWithEntry("2026-10-04", "2026-12-01"),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).toContain(
      "GHSA-vfj7-8cjw-p6xm is listed in ALLOWED but no finding carried it today",
    );
  });

  it("stays quiet about the waiver while a finding still carries it", () => {
    const result = runAudit(bracesOnlyReport(), 1, gateWithEntry("2026-10-04", "2026-12-01"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("· braces");
    expect(result.stderr).not.toContain("no finding carried it today");
  });
});
