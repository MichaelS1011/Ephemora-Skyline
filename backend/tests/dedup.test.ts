import { describe, it, expect } from "vitest";
import { dedupIssues } from "../src/services/security/dedup.js";
import type { SecurityIssue } from "../src/models/index.js";

function issue(over: Partial<SecurityIssue>): SecurityIssue {
  return {
    type: "XSS",
    severity: "P0",
    score: 7,
    line: 1,
    code: "",
    message: "test finding",
    provenance: "regex",
    ruleId: "regex:XSS",
    ...over,
  } as SecurityIssue;
}

describe("dedupIssues (cross-provenance merge contract)", () => {
  it("drops identical line+type+ruleId duplicates", () => {
    const a = issue({ line: 5 });
    const b = issue({ line: 5 });
    const out = dedupIssues([a, b]);
    expect(out).toHaveLength(1);
  });

  it("keeps the higher-severity finding when scanners disagree on severity", () => {
    const regex = issue({ line: 5, severity: "P0", provenance: "regex" });
    const semgrep = issue({ line: 5, severity: "P1", provenance: "semgrep", ruleId: "sg:xss" });
    const out = dedupIssues([semgrep, regex]); // lower severity arrives first
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("P0");
    expect(out[0]!.provenance).toBe("regex");
  });

  it("merges same line+type across provenances (regex XSS + semgrep XSS)", () => {
    const a = issue({ line: 7, provenance: "regex", ruleId: "regex:XSS" });
    const b = issue({ line: 7, provenance: "semgrep", ruleId: "sg:generic-xss" });
    const out = dedupIssues([a, b]);
    expect(out).toHaveLength(1);
  });

  it("suppresses entropy-fallback secrets on lines real gitleaks flagged", () => {
    const real = issue({
      line: 9,
      type: "HARDCODED_SECRET",
      provenance: "gitleaks",
      ruleId: "github-pat",
    });
    const fallback = issue({
      line: 9,
      type: "HARDCODED_SECRET",
      provenance: "gitleaks-fallback",
      ruleId: "gitleaks:generic-api-key",
    });
    const out = dedupIssues([fallback, real]);
    expect(out).toHaveLength(1);
    expect(out[0]!.provenance).toBe("gitleaks");
  });

  it("keeps different finding types on the same line", () => {
    const xss = issue({ line: 3, type: "XSS" });
    const sqli = issue({ line: 3, type: "SQL_INJECTION" });
    expect(dedupIssues([xss, sqli])).toHaveLength(2);
  });
});

/**
 * Characterization of the merge ORDER dedupIssues has always produced: severity
 * P0 > P1 > P2, then ascending line, arrival order for exact ties, and no
 * ranking by provenance or commit. Written against the public function (not a
 * sorting helper) so it pins behaviour for the comparator extraction.
 */
describe("dedupIssues order contract (characterization)", () => {
  const codes = (issues: SecurityIssue[]) => issues.map((i) => i.code);

  it("sorts P0 before P1 before P2 and ascending line inside a severity", () => {
    const input = [
      issue({ code: "q1", severity: "P1", line: 4, type: "XSS" }),
      issue({ code: "q2", severity: "P0", line: 9, type: "SQL_INJECTION" }),
      issue({ code: "q3", severity: "P2", line: 2, type: "CONSOLE_USAGE" }),
      issue({ code: "q4", severity: "P0", line: 3, type: "PATH_TRAVERSAL" }),
      issue({ code: "q5", severity: "P1", line: 11, type: "INSECURE_CRYPTO" }),
    ];
    expect(codes(dedupIssues(input))).toEqual(["q4", "q2", "q1", "q5", "q3"]);
  });

  it("lets severity outrank line: a late P0 still precedes an early P1", () => {
    const early = issue({ code: "early", severity: "P1", line: 1, type: "XSS" });
    const late = issue({ code: "late", severity: "P0", line: 900, type: "SQL_INJECTION" });
    expect(codes(dedupIssues([early, late]))).toEqual(["late", "early"]);
  });

  it("keeps arrival order for exact ties (same severity, same line)", () => {
    const xss = issue({ code: "xss", severity: "P1", line: 6, type: "XSS" });
    const sqli = issue({ code: "sqli", severity: "P1", line: 6, type: "SQL_INJECTION" });
    expect(codes(dedupIssues([xss, sqli]))).toEqual(["xss", "sqli"]);
    expect(codes(dedupIssues([sqli, xss]))).toEqual(["sqli", "xss"]);
  });

  it("orders historyCommit variants by severity then line, never by commit", () => {
    const a1 = issue({
      code: "a1",
      severity: "P1",
      line: 2,
      type: "XSS",
      historyCommit: "commit-a",
    });
    const b1 = issue({
      code: "b1",
      severity: "P0",
      line: 7,
      type: "SQL_INJECTION",
      historyCommit: "commit-b",
    });
    const a2 = issue({
      code: "a2",
      severity: "P0",
      line: 1,
      type: "PATH_TRAVERSAL",
      historyCommit: "commit-a",
    });
    const b2 = issue({
      code: "b2",
      severity: "P1",
      line: 7,
      type: "XSS",
      historyCommit: "commit-b",
    });
    expect(codes(dedupIssues([b1, a1, b2, a2]))).toEqual(["a2", "b1", "a1", "b2"]);
  });

  it("keeps the same line+type from two commits and orders the tie by arrival", () => {
    const head = issue({
      code: "head",
      severity: "P1",
      line: 5,
      type: "XSS",
      historyCommit: "commit-a",
    });
    const old = issue({
      code: "old",
      severity: "P1",
      line: 5,
      type: "XSS",
      historyCommit: "commit-b",
    });
    expect(codes(dedupIssues([old, head]))).toEqual(["old", "head"]);
    expect(codes(dedupIssues([head, old]))).toEqual(["head", "old"]);
  });
});
