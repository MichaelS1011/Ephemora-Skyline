import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * The subject is the shipped `scripts/audit-gate.mjs` gate itself: each case
 * spawns that script with a fake `npm` on PATH that prints a canned report, so
 * the real npm-audit network call is never made. The forked process is the
 * thing under test, not a scanner engine — this stays real on purpose.
 */
function runAudit(report: unknown, status: number) {
  const dir = mkdtempSync(path.join(tmpdir(), "skyline-audit-test-"));
  try {
    writeFileSync(
      path.join(dir, "npm"),
      `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify(report))});\nprocess.exit(${status});\n`,
      { mode: 0o755 },
    );
    return spawnSync(
      process.execPath,
      [path.resolve(import.meta.dirname, "../../scripts/audit-gate.mjs")],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
});
