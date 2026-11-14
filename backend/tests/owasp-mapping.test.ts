import { describe, it, expect } from "vitest";
import {
  FINDING_KNOWLEDGE,
  owaspOf,
  enrichIssues,
} from "../src/services/security/finding-knowledge.js";
import { categoryOf, FINDING_CATEGORIES } from "../src/services/security/categories.js";
import { buildHandoffLines } from "../src/server/routes/agent.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";
import type { FindingCategory, SecurityIssue } from "../src/models/index.js";

/**
 * The OWASP axis is a table, not a vibe — so the table is what gets tested,
 * in the voice of finding-categories.test.ts: a curated type that would land
 * in `unclassified` through no fault of its own is a bug in the table, and
 * so is a hygiene finding promoted to a Top-10 bucket it does not belong in.
 * The bucket is derived from the CWE the finding already carries; these tests
 * keep the two rows of deliberate exceptions true (path traversal is access
 * control, deserialization is integrity) and every other row honest.
 */

function issue(overrides: Partial<SecurityIssue> & { type: string }): SecurityIssue {
  return {
    severity: "P1",
    score: 7,
    line: 1,
    code: "x",
    message: "m",
    ...overrides,
  };
}

describe("owaspOf — the curated table", () => {
  it("gives every curated knowledge type a bucket its category can carry", () => {
    for (const [type, knowledge] of Object.entries(FINDING_KNOWLEDGE)) {
      const category = categoryOf(type, knowledge.cwe);
      const bucket = owaspOf(type, knowledge.cwe, category);
      if (category === "hygiene" || category === "unclassified") {
        // A dead import is not on the Top 10 — and nothing curated is unknown.
        expect(bucket, type).toBe("unclassified");
      } else {
        expect(bucket, type).not.toBe("unclassified");
      }
    }
  });

  it("names every category the categories table can produce", () => {
    // If a category exists but no curated type ever reaches it, the coverage
    // above proves nothing about it — say which categories the OWASP axis
    // has actually seen a finding for.
    const seen = new Set<FindingCategory>();
    for (const type of Object.keys(FINDING_KNOWLEDGE))
      seen.add(categoryOf(type, FINDING_KNOWLEDGE[type]?.cwe));
    for (const info of FINDING_CATEGORIES) {
      if (info.id === "unclassified") continue; // by definition nothing curated lands there
      expect(seen.has(info.id), `category ${info.id} is never produced by a curated type`).toBe(
        true,
      );
    }
  });

  it("files the deliberate exceptions where OWASP 2021 files them", () => {
    const cases: Array<[string, string, string]> = [
      ["SQL_INJECTION", "CWE-89", "A03"],
      ["CMD_INJECTION", "CWE-78", "A03"],
      ["XSS", "CWE-79", "A03"],
      ["PATH_TRAVERSAL", "CWE-22", "A01"], // access control, not injection
      ["UNSAFE_DESERIALIZATION", "CWE-502", "A08"], // integrity, not injection
      ["CURL_PIPE_BASH", "CWE-494", "A08"],
      ["INSTALL_HOOKS", "CWE-829", "A08"],
      ["SSRF", "CWE-918", "A10"],
      ["CORS", "CWE-942", "A05"],
      ["HARDCODED_SECRET", "CWE-798", "A07"],
      ["WEAK_CRYPTO", "CWE-327", "A02"],
      ["INSECURE_HTTP", "CWE-319", "A02"],
      ["WORLD_WRITABLE", "CWE-732", "A01"],
      ["VULNERABLE_DEPENDENCY", "CWE-1104", "A06"],
    ];
    for (const [type, cwe, bucket] of cases) {
      expect(owaspOf(type, cwe), type).toBe(bucket);
    }
  });

  it("keeps hygiene out of the Top 10 even when its CWE says otherwise", () => {
    // CONSOLE_USAGE carries CWE-532; promoting it would make every console.log
    // a "logging failure" while a real secret-in-logs rule citing the same CWE
    // must still reach A09.
    expect(owaspOf("CONSOLE_USAGE", "CWE-532")).toBe("unclassified");
    expect(owaspOf("semgrep:security-audit", "CWE-532")).toBe("A09");
    expect(owaspOf("LOOSE_EQUALITY")).toBe("unclassified");
  });

  it("returns unclassified for a CWE the table does not know — never a guess", () => {
    expect(owaspOf("CUSTOM_RULE", "CWE-999999")).toBe("unclassified");
    expect(owaspOf("CUSTOM_RULE")).toBe("unclassified");
  });
});

describe("enrichIssues attaches the bucket", () => {
  it("derives it from the curated CWE without being told", () => {
    const issues = [issue({ type: "SQL_INJECTION" }), issue({ type: "PATH_TRAVERSAL" })];
    enrichIssues(issues);
    expect(issues[0]!.owasp).toBe("A03");
    expect(issues[1]!.owasp).toBe("A01");
  });

  it("respects a bucket already present", () => {
    const issues = [issue({ type: "SQL_INJECTION", owasp: "unclassified" })];
    enrichIssues(issues);
    expect(issues[0]!.owasp).toBe("unclassified");
  });
});

describe("handoff carries the bucket without inventing one", () => {
  it("spreads owasp when the finding has one and omits it when it does not", () => {
    const result = makeResult([
      makeFile({ path: "a.js", vulnerabilities: [issue({ type: "SQL_INJECTION", owasp: "A03" })] }),
      makeFile({ path: "b.js", vulnerabilities: [issue({ type: "MYSTERY_RULE" })] }),
    ]);
    const lines = buildHandoffLines(result);
    expect(lines.find((l) => l.path === "a.js")!.owasp).toBe("A03");
    expect(lines.find((l) => l.path === "b.js")!.owasp).toBeUndefined();
  });
});
