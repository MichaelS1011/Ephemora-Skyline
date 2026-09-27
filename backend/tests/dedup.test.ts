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
