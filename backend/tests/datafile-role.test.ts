import { describe, expect, it } from "vitest";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";

/**
 * Measured on a real datablatt run (.qoder-scratch/artefakt-erfassung.mts):
 * a package-lock.json with 7 556 format lines became the tallest tower
 * (mapping height 11.7) and led its city's skyline, five of six skyline
 * slots went to JSON/Env data sheets, and every one of them carried
 * role "code" — complexity 1 notwithstanding, the city sold format as
 * structure. Data may be a plot with its size and its findings; it never
 * competes for the skyline on lines.
 */
function file(
  p: string,
  language: string,
  loc: number,
  findings: SecurityIssue["severity"][] = [],
): FileAnalysis {
  return {
    path: p,
    language,
    lines: { total: loc, code: loc, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: findings.map((severity, i) => ({
      type: "HARDCODED_SECRET",
      severity,
      score: 9,
      line: i + 1,
      code: "x",
      message: "m",
    })),
  } as FileAnalysis;
}

function city(files: FileAnalysis[]) {
  return mapResultToCityData({
    id: "datablatt-city",
    repo: { owner: "local", name: "datablatt", branch: "main" },
    files,
    directories: [],
    summary: { totalFiles: files.length, totalLines: 0 },
  } as never);
}

// four data sheets (the largest by whole orders of magnitude) against six
// modest code files and one test — the situation the self-scan measured
const CASE: FileAnalysis[] = [
  file("package-lock.json", "JSON", 7556),
  file("assets/i18n/de.json", "JSON", 146),
  file("db/migrations/001_init.sql", "SQL", 40),
  file("config/.env.production", "Env", 43),
  file("src/service.ts", "TypeScript", 120),
  file("src/handler.ts", "TypeScript", 90),
  file("src/store.ts", "TypeScript", 60),
  file("src/routes.ts", "TypeScript", 55),
  file("src/mailer.ts", "TypeScript", 50),
  file("src/report.ts", "TypeScript", 45),
  file("tests/service.test.ts", "TypeScript", 80),
];

describe("a data sheet joins the city as data, not as a code tower", () => {
  it("names the role on every mapped file", () => {
    const c = city(CASE);
    const detail: Array<{ path: string; role?: string }> = [];
    const walkTree = (d: {
      detailFiles: Array<{ path: string; role?: string }>;
      children: Array<{ detailFiles: never; children: unknown }>;
    }): void => {
      detail.push(...d.detailFiles);
      for (const child of d.children) walkTree(child as Parameters<typeof walkTree>[0]);
    };
    walkTree(c.tree as never);
    const roles = Object.fromEntries(detail.map((f) => [f.path, f.role]));
    expect(roles).toMatchObject({
      "package-lock.json": "data",
      "assets/i18n/de.json": "data",
      "db/migrations/001_init.sql": "data",
      "config/.env.production": "data",
      "src/service.ts": "code",
      "tests/service.test.ts": "test",
    });
  });

  it("keeps data sheets off the district skyline while real code is left", () => {
    const c = city(CASE);
    const towers = c.tree.districtFiles.map((f) => f.path);
    expect(towers).toContain("src/service.ts");
    expect(towers).not.toContain("package-lock.json");
    expect(towers).not.toContain("assets/i18n/de.json");
    expect(towers).not.toContain("db/migrations/001_init.sql");
  });

  it("ranks a findings-free data sheet below every code file on the podium", () => {
    // same directory, so the podium sort is what decides
    const c = city([
      file("package-lock.json", "JSON", 7556),
      file("copy.yml", "YAML", 5000),
      file("app.ts", "TypeScript", 10),
    ]);
    const podium = c.tree.detailFiles.map((f) => f.path);
    expect(podium.indexOf("app.ts")).toBeLessThan(podium.indexOf("package-lock.json"));
    expect(podium.indexOf("app.ts")).toBeLessThan(podium.indexOf("copy.yml"));
  });

  it("lifts a data sheet the moment a real finding lives in it", () => {
    // a secret in a lockfile is still a secret — visibility beats the flattening
    const c = city([...CASE, file("vendor/pnpm-lock.yaml", "YAML", 9000, ["P0"])]);
    const towers = c.tree.districtFiles;
    expect(towers[0]!.path).toBe("vendor/pnpm-lock.yaml");
    expect(towers[0]!.role).toBe("data");
    expect(c.findingsBySeverity.P0).toBe(1);
  });

  it("leaves the line split untouched: SQL lines stay code, catalogue lines stay data", () => {
    const c = city(CASE);
    expect(c.dataLines).toBe(7556 + 146 + 43); // JSON + Env
    expect(c.codeLines).toBe(40 + 120 + 90 + 60 + 55 + 50 + 45 + 80); // SQL + TS
  });
});
