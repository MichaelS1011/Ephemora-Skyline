import { describe, expect, it } from "vitest";
import { searchFindings } from "../src/city/layout";
import { findingKey } from "../src/reviews";
import type { CityData, CityFile, CityFinding, Severity } from "../src/city/types";

function makeFile(
  id: string,
  name: string,
  path: string,
  findings: CityFinding[],
  linesOfCode = 100,
): CityFile {
  return {
    id,
    name,
    path,
    language: "TypeScript",
    linesOfCode,
    cyclomaticComplexity: 1,
    threatLevel: "safe",
    findings,
  };
}

function f(severity: Severity, type: string, message: string, ruleId?: string): CityFinding {
  return { type, severity, line: 1, message, ruleId };
}

function makeCity(files: CityFile[]): CityData {
  return {
    repo: { owner: "local", name: "test", branch: "main" },
    totalFiles: files.length,
    renderedFiles: files.length,
    totalLines: files.reduce((s, file) => s + file.linesOfCode, 0),
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    languages: { TypeScript: 100 },
    tree: {
      name: "test",
      path: "",
      fileCount: files.length,
      linesOfCode: 100,
      languages: { TypeScript: 100 },
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      threatScore: 0,
      topFindings: [],
      children: [],
      detailFiles: files,
      remainingFiles: 0,
      districtFiles: [],
    },
    fileConnections: [],
    dirConnections: [],
    meta: {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
  };
}

const alpha = makeFile("file:src/alpha.ts", "alpha.ts", "src/alpha.ts", [
  f("P2", "Complexity", "Function too long"),
  f("P0", "Injection", "SQL injection risk", "no-sql-injection"),
  f("P1", "XSS", "Unsafe innerHTML in render"),
]);
const beta = makeFile("file:src/deep/beta.py", "beta.py", "src/deep/beta.py", [
  f("P0", "Secrets", "Hardcoded secret key"),
  f("P1", "Style", "Line too long"),
]);
const gamma = makeFile("file:src/gamma.ts", "gamma.ts", "src/gamma.ts", []);

const city = makeCity([alpha, beta, gamma]);

describe("searchFindings", () => {
  it("matches by ruleId, type, message, severity, file name and path (case-insensitive)", () => {
    // ruleId wins over type as the searchable identifier
    expect(searchFindings(city, "no-sql-injection", 10).map((h) => h.index)).toEqual([1]);
    // type
    expect(searchFindings(city, "xss", 10).map((h) => h.index)).toEqual([2]);
    // message
    expect(searchFindings(city, "innerHTML", 10).map((h) => h.index)).toEqual([2]);
    // severity token
    expect(searchFindings(city, "p0", 10).map((h) => [h.file.id, h.index])).toEqual([
      ["file:src/alpha.ts", 1],
      ["file:src/deep/beta.py", 0],
    ]);
    // file name
    expect(searchFindings(city, "BETA", 10).map((h) => h.index)).toEqual([0, 1]);
    // file path segment
    expect(searchFindings(city, "deep", 10).map((h) => h.file.id)).toEqual([
      "file:src/deep/beta.py",
      "file:src/deep/beta.py",
    ]);
  });

  it("returns nothing for an empty or blank query", () => {
    expect(searchFindings(city, "", 10)).toEqual([]);
    expect(searchFindings(city, "   ", 10)).toEqual([]);
  });

  it("respects the limit", () => {
    // query "src" matches every file path -> all 5 findings
    expect(searchFindings(city, "src", 3)).toHaveLength(3);
    expect(searchFindings(city, "src", 10)).toHaveLength(5);
  });

  it("orders by severity, then file risk, then message", () => {
    // risk: alpha = P2+P0+P1 = 20, beta = P0+P1 = 17
    expect(searchFindings(city, "src", 10).map((h) => [h.file.id, h.index])).toEqual([
      ["file:src/alpha.ts", 1], // P0, risk 20
      ["file:src/deep/beta.py", 0], // P0, risk 17
      ["file:src/alpha.ts", 2], // P1, risk 20
      ["file:src/deep/beta.py", 1], // P1, risk 17
      ["file:src/alpha.ts", 0], // P2
    ]);
  });

  it("keeps index pointing into the file's FULL findings list (findingKey contract)", () => {
    for (const hit of searchFindings(city, "src", 10)) {
      expect(hit.finding).toBe(hit.file.findings[hit.index]);
      expect(findingKey(hit.file.id, hit.index)).toBe(`${hit.file.id}#${hit.index}`);
    }
  });

  it("is deterministic across repeated calls", () => {
    const a = searchFindings(city, "src", 10);
    const b = searchFindings(city, "src", 10);
    expect(a.map((h) => [h.file.id, h.index])).toEqual(b.map((h) => [h.file.id, h.index]));
  });

  it("returns nothing for a query that matches no finding and no file", () => {
    expect(searchFindings(city, "kryptonite", 10)).toEqual([]);
  });
});
