import { describe, expect, it } from "vitest";
import type { AnalysisResult, FileAnalysis, SecurityIssue } from "../src/models/index.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";

/**
 * The case book of `.qoder-scratch/fixture-repo` as a unit test: 249 lines of
 * code and 300 lines of data catalogue add up to 549, and until now the city
 * published 549 as "lines of code" with JSON as its largest language.
 * Building height is already right (data gets complexity 1), so this is about
 * the numbers the panel shows — not about geometry.
 */
function makeFile(
  overrides: Partial<FileAnalysis> & { path: string; language: string },
): FileAnalysis {
  const code = overrides.lines?.code ?? 0;
  return {
    lines: { total: code, code, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: [],
    ...overrides,
  };
}

function issue(severity: SecurityIssue["severity"], line: number): SecurityIssue {
  return { type: "SQL_INJECTION", severity, score: 5, line, code: "x", message: "m" };
}

const CASE_BOOK: FileAnalysis[] = [
  makeFile({
    path: "src/patterns.ts",
    language: "TypeScript",
    lines: { total: 153, code: 134, comments: 19, blank: 0 },
  }),
  makeFile({
    path: "src/legacy.php",
    language: "PHP",
    lines: { total: 95, code: 58, comments: 37, blank: 0 },
    vulnerabilities: [issue("P0", 38)],
  }),
  makeFile({
    path: "tools/cleanup.sh",
    language: "Shell",
    lines: { total: 52, code: 39, comments: 13, blank: 0 },
    vulnerabilities: [issue("P1", 40)],
  }),
  makeFile({
    path: "web/mailer.php",
    language: "PHP",
    lines: { total: 6, code: 5, comments: 1, blank: 0 },
    vulnerabilities: [issue("P0", 4)],
  }),
  makeFile({
    path: "scripts/deploy.sh",
    language: "Shell",
    lines: { total: 6, code: 6, comments: 0, blank: 0 },
    vulnerabilities: [issue("P0", 3), issue("P1", 4), issue("P0", 5)],
  }),
  makeFile({
    path: "db/migrations/001_init.sql",
    language: "SQL",
    lines: { total: 4, code: 4, comments: 0, blank: 0 },
  }),
  makeFile({
    path: "infra/main.tf",
    language: "Terraform",
    lines: { total: 3, code: 3, comments: 0, blank: 0 },
  }),
  makeFile({
    path: "assets/i18n/de.json",
    language: "JSON",
    lines: { total: 146, code: 146, comments: 0, blank: 0 },
  }),
  makeFile({
    path: "assets/i18n/en.json",
    language: "JSON",
    lines: { total: 146, code: 146, comments: 0, blank: 0 },
  }),
  makeFile({
    path: "package.json",
    language: "JSON",
    lines: { total: 8, code: 8, comments: 0, blank: 0 },
    vulnerabilities: [issue("P1", 5)],
  }),
];

function makeResult(
  files: FileAnalysis[],
  summaryOverrides: Partial<AnalysisResult["summary"]> = {},
): AnalysisResult {
  return {
    id: "data-lines-1",
    repo: {
      owner: "local",
      name: "casebook",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    },
    files,
    directories: [],
    summary: {
      totalFiles: files.length,
      totalDirectories: 0,
      totalLines: files.reduce((s, f) => s + f.lines.total, 0),
      avgCyclomatic: 1,
      maxCyclomatic: 1,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
      ...summaryOverrides,
    },
    createdAt: new Date().toISOString(),
    status: "complete",
  };
}

const cityOf = () => mapResultToCityData(makeResult(CASE_BOOK));

describe("data lines are split out of the code totals", () => {
  it("reports code lines and data lines separately instead of one mixed number", () => {
    const city = cityOf();
    expect(city.codeLines).toBe(249);
    expect(city.dataLines).toBe(300);
    // the sum is still what the analyzer measured — disclosure, not a new lie
    expect(city.totalLines).toBe(549);
  });

  it("keeps data languages out of the language bar", () => {
    const city = cityOf();
    expect(city.languages).toEqual({
      TypeScript: 134,
      PHP: 63,
      Shell: 45,
      SQL: 4,
      Terraform: 3,
    });
    expect(city.dataLanguages).toEqual({ JSON: 300 });
  });

  it("counts a translation-only district as no code", () => {
    const city = cityOf();
    const assets = city.tree.children.find((d) => d.name === "assets")!;
    const i18n = assets.children.find((d) => d.name === "i18n")!;
    expect(i18n.codeLines).toBe(0);
    expect(i18n.dataLines).toBe(292);
    expect(i18n.languages).toEqual({});
    expect(i18n.dataLanguages).toEqual({ JSON: 292 });
    // geometry stays untouched: the plot is still sized by all its lines
    expect(i18n.linesOfCode).toBe(292);
    expect(assets.codeLines).toBe(0);
  });

  it("leaves declared infrastructure and migrations in the code total", () => {
    // The analyzer scores a .tf with complexity 1 because HCL has no control
    // flow. Its 3 lines are still read as code, so they must not move into the
    // data bucket — the case book counts them under "code" too.
    const city = cityOf();
    const infra = city.tree.children.find((d) => d.name === "infra")!;
    expect(infra.codeLines).toBe(3);
    expect(infra.dataLines).toBe(0);
    const db = city.tree.children.find((d) => d.name === "db")!;
    expect(db.codeLines).toBe(4);
  });

  it("carries the split down to every directory and sums without leftovers", () => {
    const city = cityOf();
    const sum = (d: typeof city.tree): number => d.codeLines + d.dataLines;
    expect(sum(city.tree)).toBe(549);
    for (const child of city.tree.children) {
      expect(child.codeLines + child.dataLines).toBe(child.linesOfCode);
    }
  });

  it("does not change what a data file does to the finding counts", () => {
    const city = cityOf();
    expect(city.findingsBySeverity).toEqual({ P0: 4, P1: 3, P2: 0 });
    expect(city.tree.findingsBySeverity.P0 + city.tree.findingsBySeverity.P1).toBe(7);
  });
});

describe("the panel can explain what the city left out", () => {
  it("ships the draw limits the layout was built under", () => {
    const city = cityOf();
    expect(city.limits.skylineTowers).toBe(6);
    expect(city.limits.buildingsPerDirectory).toBe(35);
  });

  it("reports the real cap when a folder outgrows its plots", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      makeFile({
        path: `big/file${String(i).padStart(2, "0")}.ts`,
        language: "TypeScript",
        lines: { total: 10, code: 10, comments: 0, blank: 0 },
      }),
    );
    const city = mapResultToCityData(makeResult(many));
    const big = city.tree.children.find((d) => d.name === "big")!;
    expect(city.limits.buildingsPerDirectory).toBe(35);
    expect(big.detailFiles).toHaveLength(35);
    expect(big.remainingFiles).toBe(25);
  });

  it("passes the .gitignore counts through to the city", () => {
    const city = mapResultToCityData(
      makeResult(CASE_BOOK, { skippedByGitignore: { files: 49, directories: 3 } }),
    );
    expect(city.skippedByGitignore).toEqual({ files: 49, directories: 3 });
  });

  it("stays absent for a result that was scanned before the counter existed", () => {
    const city = cityOf();
    expect(city.skippedByGitignore).toBeUndefined();
  });
});
