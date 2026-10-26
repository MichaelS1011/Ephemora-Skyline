import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GATE = path.resolve(import.meta.dirname, "../../scripts/audit-gate.mjs");

/** The two date literals the shipped ALLOWED entry carries in the gate source. */
const SHIPPED_ADDED = 'added: "2026-10-04"';
const SHIPPED_RECHECK = 'recheck: "2026-12-01"';

/**
 * The subject is the shipped `scripts/audit-gate.mjs` gate itself: each case
 * spawns that script with a fake `npm` on PATH that prints a canned report, so
 * the real npm-audit network call is never made. The forked process is the
 * thing under test, not a scanner engine — this stays real on purpose.
 *
 * `gateSource` replaces the gate file for one case; see `gateWithDates`.
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
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A recheck case cannot use the shipped dates: they are fixed in the gate and
 * would silently change meaning as time passes. So each case spawns a copy with
 * those two literals swapped. The assertions here are the proof that the
 * substitution really happened — a no-op swap would make the case green for the
 * wrong reason. The child output is asserted against the swapped dates too.
 */
function gateWithDates(added: string, recheck: string) {
  const src = readFileSync(GATE, "utf8");
  expect(src.split(SHIPPED_ADDED).length - 1).toBe(1);
  expect(src.split(SHIPPED_RECHECK).length - 1).toBe(1);
  const patched = src
    .replace(SHIPPED_ADDED, `added: ${JSON.stringify(added)}`)
    .replace(SHIPPED_RECHECK, `recheck: ${JSON.stringify(recheck)}`);
  expect(patched).not.toBe(src);
  expect(patched).toContain(`added: ${JSON.stringify(added)}`);
  expect(patched).toContain(`recheck: ${JSON.stringify(recheck)}`);
  expect(patched).not.toContain(SHIPPED_RECHECK);
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
  });
  it("refuses an incomplete report even when npm exits successfully", () => {
    expect(runAudit({}, 0).status).toBe(1);
  });
  it("accepts a complete clean report", () => {
    expect(
      runAudit({ vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } }, 0)
        .status,
    ).toBe(0);
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
    const result = runAudit(bracesOnlyReport(), 1, gateWithDates("2026-10-04", "2000-01-01"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("2000-01-01");
    expect(result.stderr).toContain(todayUtc);
    expect(result.stderr).toContain("braces (high)");
    expect(result.stdout).not.toContain("PASS");
  });

  it("fails when a recheck date is not a real UTC calendar date", () => {
    const result = runAudit(bracesOnlyReport(), 1, gateWithDates("2026-10-04", "2026-13-45"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("2026-13-45");
    expect(result.stdout).not.toContain("PASS");
  });

  it("accepts a future recheck inside the 180-day cap, with the substituted dates", () => {
    const result = runAudit(bracesOnlyReport(), 1, gateWithDates("2098-01-01", "2098-04-01"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("added 2098-01-01, re-check 2098-04-01");
    expect(result.stdout).toContain("· braces");
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).not.toContain("FAIL");
  });

  it("fails one calendar day past the 180-day cap: added 2098-01-01, recheck 2098-07-01", () => {
    // 2098 is not a leap year, so 2098-07-01 sits 181 days after 2098-01-01.
    const result = runAudit(bracesOnlyReport(), 1, gateWithDates("2098-01-01", "2098-07-01"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(result.stderr).toContain("more than 180 days");
    expect(result.stderr).toContain("2098-07-01");
    expect(result.stderr).toContain("braces (high)");
    expect(result.stdout).not.toContain("PASS");
  });

  it("accepts a recheck on exactly the 180th day: added 2098-01-01, recheck 2098-06-30", () => {
    // 2098-06-30 is the last calendar day inside the cap; one day more fails.
    const result = runAudit(bracesOnlyReport(), 1, gateWithDates("2098-01-01", "2098-06-30"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("added 2098-01-01, re-check 2098-06-30");
    expect(result.stdout).toContain("· braces");
    expect(result.stdout).toContain("PASS");
    expect(result.stderr).not.toContain("FAIL");
  });
});
