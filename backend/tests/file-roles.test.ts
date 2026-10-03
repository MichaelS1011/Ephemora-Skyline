import { describe, expect, it } from "vitest";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";
import { roleOfPath } from "../src/services/analyzer/metrics.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";

/**
 * Measured on the first self-scan of this repo: 35 of 56 findings sat in
 * `backend/tests/*.test.ts`, and the panel called the scanner's own test file
 * the project's highest risk. Test code keeps its findings — it stops leading.
 */
function file(path: string, findings: SecurityIssue["severity"][] = []): FileAnalysis {
  return {
    path,
    language: "TypeScript",
    lines: { total: 100, code: 100, comments: 0, blank: 0 },
    complexity: { cyclomatic: 2 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: findings.map((severity, i) => ({
      type: "SQL_INJECTION",
      severity,
      score: 5,
      line: i + 1,
      code: "x",
      message: "m",
    })),
  };
}

function city(files: FileAnalysis[]) {
  return mapResultToCityData({
    id: "c1",
    repo: { owner: "local", name: "roles", branch: "main" },
    files,
    summary: {
      totalFiles: files.length,
      totalLines: files.length * 100,
      totalComplexity: 2,
      avgComplexity: 2,
      languages: { TypeScript: files.length * 100 },
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    },
  } as never);
}

describe("roleOfPath", () => {
  it("knows the test conventions of the languages the scanner reads", () => {
    expect(roleOfPath("backend/tests/security-scanner.test.ts")).toBe("test");
    expect(roleOfPath("frontend/tests/layout.test.ts")).toBe("test");
    expect(roleOfPath("src/__tests__/Button.spec.tsx")).toBe("test");
    expect(roleOfPath("app/e2e/checkout.spec.ts")).toBe("test");
    expect(roleOfPath("py/tests/test_orders.py")).toBe("test");
    expect(roleOfPath("pkg/store_test.go")).toBe("test");
    expect(roleOfPath("lib/rs/spec/cart_spec.rb")).toBe("test");
    expect(roleOfPath("py/conftest.py")).toBe("test");
  });

  it("leaves product code alone, even when the path says test", () => {
    expect(roleOfPath("backend/src/server/routes/tests.ts")).toBe("code");
    expect(roleOfPath("src/testing/harness.ts")).toBe("code");
    expect(roleOfPath("frontend/src/components/ContextCard.tsx")).toBe("code");
    expect(roleOfPath("latest.ts")).toBe("code");
  });
});

describe("city risk with test code", () => {
  it("scores the folder from shipped code and counts the fixtures apart", () => {
    const c = city([file("src/app.ts", ["P2"]), file("tests/app.test.ts", ["P0", "P0", "P0"])]);
    expect(c.tree.findingsBySeverity).toEqual({ P0: 3, P1: 0, P2: 1 });
    expect(c.tree.threatScore).toBe(3);
    expect(c.tree.testThreatScore).toBe(30);
    expect(c.tree.findingsInTests).toBe(3);
    expect(c.tree.testFiles).toBe(1);
    expect(c.findingsInTests).toBe(3);
    expect(c.testFiles).toBe(1);
  });

  it("still reports a risk for a project that is nothing but tests", () => {
    const c = city([file("tests/only.test.ts", ["P1"])]);
    const tests = c.tree.children.find((d) => d.name === "tests");
    expect(tests?.threatScore).toBe(0);
    expect(tests?.testThreatScore).toBe(7);
    // the file keeps its own verdict — nothing is hidden from the findings list
    const hit = c.tree.children.flatMap((d) => d.detailFiles).find((f) => f.role === "test");
    expect(hit?.threatLevel).toBe("high");
    expect(hit?.findings).toHaveLength(1);
  });

  it("picks the worst findings of a folder from shipped code first", () => {
    const c = city([file("src/app.ts", ["P2"]), file("tests/app.test.ts", ["P0", "P0"])]);
    expect(c.tree.topFindings.map((f) => f.inTest)).toEqual([true, true, false]);
    const src = c.tree.children.find((d) => d.name === "src");
    expect(src?.topFindings[0]?.inTest).toBe(false);
  });

  it("does not let a fixture become the tower the city shows from orbit", () => {
    const c = city([
      file("src/small.ts", ["P2"]),
      file("tests/big.test.ts", ["P0", "P0", "P0", "P0", "P0", "P0", "P0"]),
    ]);
    const skyline = c.tree.districtFiles.map((f) => f.path);
    expect(skyline[0]).toBe("src/small.ts");
  });

  it("labels every file with the role it was mapped from", () => {
    const c = city([file("src/app.ts"), file("tests/app.test.ts")]);
    const roles = new Map(
      c.tree.children.flatMap((d) => d.detailFiles).map((f) => [f.path, f.role]),
    );
    expect(roles.get("src/app.ts")).toBe("code");
    expect(roles.get("tests/app.test.ts")).toBe("test");
  });
});
