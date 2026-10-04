import { describe, expect, it } from "vitest";
import { FINDING_KNOWLEDGE } from "../src/services/security/finding-knowledge.js";
import { REGEX_PATTERNS } from "../src/services/security/adapters/regex-adapter.js";
import {
  CATEGORY_IDS,
  FINDING_CATEGORIES,
  categoryOf,
  categoryInfo,
} from "../src/services/security/categories.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * Before this table existed, the only grouping was the finding's own type
 * string — and that string is open (ruff invents QUALITY_<code> at runtime).
 * A user who wanted "the injection, not the hygiene" had nothing to click.
 */
const RUFF_MAPPED = [
  "QUALITY_ASSERT",
  "QUALITY_F401",
  "QUALITY_F811",
  "QUALITY_F841",
  "QUALITY_F821",
  "QUALITY_E711",
  "QUALITY_E712",
  "QUALITY_B006",
];

describe("the category table covers what the scanner can emit", () => {
  it("classifies every curated finding type", () => {
    const unclassified = Object.keys(FINDING_KNOWLEDGE).filter(
      (type) => categoryOf(type, FINDING_KNOWLEDGE[type]?.cwe) === "unclassified",
    );
    expect(unclassified).toEqual([]);
  });

  it("classifies every built-in regex rule by its own declared CWE", () => {
    const loose = REGEX_PATTERNS.filter(
      (p) => categoryOf(p.type, p.cwe ?? FINDING_KNOWLEDGE[p.type]?.cwe) === "unclassified",
    ).map((p) => p.type);
    expect(loose).toEqual([]);
  });

  it("puts the ruff quality codes in hygiene, not in a bucket nobody reads", () => {
    for (const type of RUFF_MAPPED) expect(categoryOf(type)).toBe("hygiene");
  });

  it("inherits the category from the CWE, so a new rule needs no table edit", () => {
    expect(categoryOf("SECURITY_custom_sql_rule", "CWE-89")).toBe("injection");
    expect(categoryOf("SECURITY_custom_secret_rule", "CWE-798")).toBe("secrets");
    expect(categoryOf("anything", "CWE-999999")).toBe("unclassified");
    expect(categoryOf("anything")).toBe("unclassified");
  });

  it("refuses to guess ruff's bandit codes into hygiene", () => {
    // S105 is a hardcoded secret and S108 a world-writable path — sorting the
    // whole family into "hygiene" would hide them behind the filter a user is
    // most likely to turn off.
    expect(categoryOf("SECURITY_S105")).toBe("unclassified");
  });

  it("names the engines that can fill each category", () => {
    expect(CATEGORY_IDS).toHaveLength(FINDING_CATEGORIES.length);
    expect(categoryInfo("secrets").engines).toContain("gitleaks");
    expect(categoryInfo("dependencies").engines).toContain("dependencies");
    for (const c of FINDING_CATEGORIES) expect(c.meaning.length).toBeGreaterThan(20);
  });
});

describe("the category reaches the finding", () => {
  it("is attached by the scanner, not only by the table", async () => {
    const scanner = new SecurityScanner(undefined, undefined);
    const issues = await scanner.scanFile(
      "src/db.ts",
      'const q = "SELECT * FROM t WHERE id = " + req.params.id;\nexport default q;\n',
    );
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(CATEGORY_IDS).toContain(issue.category);
    expect(issues.some((i) => i.category === "injection")).toBe(true);
  });
});

describe("the category axis is a scan decision", () => {
  it("keeps only the selected kinds", async () => {
    const { config, errors } = resolveConfig({
      profile: "standard",
      enabledCategories: ["injection"],
    });
    expect(errors).toEqual([]);
    expect(config.enabledCategories).toEqual(["injection"]);
    const scanner = new SecurityScanner(undefined, config);
    const issues = await scanner.scanFile(
      "src/app.ts",
      'const q = "SELECT * FROM t WHERE id = " + req.params.id;\nconsole.log(q);\neval(q);\n',
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(new Set(issues.map((i) => i.category))).toEqual(new Set(["injection"]));
  });

  it("rejects a category it does not know instead of quietly ignoring it", () => {
    const { errors } = resolveConfig({ enabledCategories: ["injection", "alL"] });
    expect(errors.join(" ")).toContain("unknown category");
  });

  it("deduplicates and caps the list", () => {
    const { config } = resolveConfig({
      enabledCategories: ["injection", "injection", ...Array(40).fill("secrets")],
    });
    expect(config.enabledCategories).toEqual(["injection", "secrets"]);
  });

  it("means every category when the list is empty", () => {
    const { config } = resolveConfig({ profile: "standard" });
    expect(config.enabledCategories).toEqual([]);
  });
});

describe("the city publishes its categories", () => {
  function file(path: string, issues: SecurityIssue[]): FileAnalysis {
    return {
      path,
      language: "TypeScript",
      lines: { total: 40, code: 40, comments: 0, blank: 0 },
      complexity: { cyclomatic: 2 },
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      vulnerabilities: issues,
    } as FileAnalysis;
  }

  const issue = (type: string, severity: SecurityIssue["severity"]): SecurityIssue => ({
    type,
    severity,
    score: 5,
    line: 3,
    code: "x",
    message: "m",
    category: categoryOf(type, FINDING_KNOWLEDGE[type]?.cwe),
  });

  it("counts per folder and for the whole city", () => {
    const city = mapResultToCityData({
      id: "c",
      repo: { owner: "local", name: "cat", branch: "main" },
      files: [
        file("src/a.ts", [issue("SQL_INJECTION", "P0"), issue("CONSOLE_USAGE", "P2")]),
        file("src/b.ts", [issue("HARDCODED_SECRET", "P0")]),
      ],
      summary: {
        totalFiles: 2,
        totalLines: 80,
        totalComplexity: 2,
        avgComplexity: 2,
        languages: {},
        findingsBySeverity: { P0: 2, P1: 0, P2: 1 },
      },
    } as never);
    expect(city.findingsByCategory.injection).toBe(1);
    expect(city.findingsByCategory.secrets).toBe(1);
    expect(city.findingsByCategory.hygiene).toBe(1);
    const src = city.tree.children.find((d) => d.name === "src");
    expect(src?.findingsByCategory.injection).toBe(1);
    expect(city.findingsByCategory.unclassified).toBe(0);
  });
});
