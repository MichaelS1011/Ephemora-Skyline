import { describe, expect, it } from "vitest";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";
import { missingEnginesFor } from "../src/services/security/scan-depth.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";

/**
 * Measured on the Quick profile over this repo: 169 of 173 buildings were
 * painted with the colour of a clean scan while semgrep and ruff never ran.
 * "Nothing found" is only a result if something looked.
 */
const DEEP = { regex: true, gitleaks: true, semgrep: true, ruff: true, osv: true };
const QUICK = { regex: true, gitleaks: true, semgrep: false, ruff: false };

function file(
  path: string,
  language: string,
  findings: SecurityIssue["severity"][] = [],
): FileAnalysis {
  return {
    path,
    language,
    lines: { total: 50, code: 50, comments: 0, blank: 0 },
    complexity: { cyclomatic: 2 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: findings.map((severity, i) => ({
      type: "X",
      severity,
      score: 5,
      line: i + 1,
      code: "x",
      message: "m",
    })),
  } as FileAnalysis;
}

function city(files: FileAnalysis[], provenance: Record<string, boolean>) {
  return mapResultToCityData({
    id: "c",
    repo: { owner: "local", name: "depth", branch: "main" },
    files,
    summary: {
      totalFiles: files.length,
      totalLines: files.length * 50,
      totalComplexity: 2,
      avgComplexity: 2,
      languages: {},
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      scanProvenance: provenance,
    },
  } as never);
}

describe("missingEnginesFor", () => {
  it("names the engines that were off for the language", () => {
    expect(missingEnginesFor("TypeScript", QUICK)).toEqual(["semgrep"]);
    expect(missingEnginesFor("Python", QUICK)).toEqual(["semgrep", "ruff"]);
    expect(missingEnginesFor("TypeScript", DEEP)).toEqual([]);
  });

  it("asks gitleaks of every file and ruff of nothing but Python", () => {
    expect(missingEnginesFor("CSS", { ...QUICK, gitleaks: false })).toContain("gitleaks");
    expect(missingEnginesFor("CSS", QUICK)).toEqual([]);
    expect(missingEnginesFor("Shell", DEEP)).toEqual([]);
  });

  it("claims nothing about a result that carries no provenance", () => {
    expect(missingEnginesFor("TypeScript", undefined)).toEqual([]);
  });
});

describe("city payload carries the scan depth", () => {
  it("marks a clean file with the engines that never looked at it", () => {
    const c = city(
      [file("src/app.ts", "TypeScript"), file("src/deep.ts", "TypeScript", ["P0"])],
      QUICK,
    );
    const files = c.tree.children.flatMap((d) => d.detailFiles);
    const clean = files.find((f) => f.path === "src/app.ts");
    const found = files.find((f) => f.path === "src/deep.ts");
    expect(clean?.unverifiedBy).toEqual(["semgrep"]);
    // a file WITH findings was obviously looked at by something; the gap is
    // still true for it, and the panel says so per file
    expect(found?.unverifiedBy).toEqual(["semgrep"]);
    expect(c.unverifiedFiles).toBe(1);
  });

  it("counts every clean-but-unscanned building of a folder and the city", () => {
    const c = city(
      [
        file("src/a.ts", "TypeScript"),
        file("src/b.ts", "TypeScript"),
        file("src/c.py", "Python"),
        file("src/boom.ts", "TypeScript", ["P1"]),
      ],
      QUICK,
    );
    const src = c.tree.children.find((d) => d.name === "src");
    expect(src?.unverifiedFiles).toBe(3);
    expect(c.unverifiedFiles).toBe(3);
  });

  it("leaves the claim away when the profile ran everything", () => {
    const c = city([file("src/a.ts", "TypeScript")], DEEP);
    expect(c.unverifiedFiles).toBe(0);
    expect(c.tree.children[0]!.detailFiles[0]!.unverifiedBy).toBeUndefined();
  });
});
