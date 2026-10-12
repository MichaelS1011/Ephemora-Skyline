import { describe, it, expect } from "vitest";
import { getDemoResult } from "../src/server/routes/demo.js";
import { mapResultToCityData, type CityFile } from "../src/utils/cityMapper.js";
import { CATEGORY_IDS, categoryOf } from "../src/services/security/categories.js";
import { knowledgeFor } from "../src/services/security/finding-knowledge.js";
import type { AnalysisResult } from "../src/models/index.js";

/**
 * The demo is generated, not analyzed — so it may only claim what its own
 * synthetic files support. These checks keep the summary from carrying numbers
 * no pipeline produced, and keep the findings from wearing a scanner's badge.
 */
describe("demo city claims only what its own data supports", () => {
  const demo = getDemoResult();

  /**
   * Item 12: a finding with no category has no German counterpart line, so the
   * panel stopped translating exactly where the demo shows the user what the
   * program does. Measured before: 0 of the demo's 7 findings carried one,
   * while a real scan's finding carried its CWE and answered in both languages.
   */
  it("classifies every finding it shows, with the CWE the scanner would give it", () => {
    const findings = demo.files.flatMap((f) => f.vulnerabilities);
    expect(findings.length).toBe(7);
    for (const v of findings) {
      expect(v.category, `${v.type} has no category`).toBeTruthy();
      expect(CATEGORY_IDS).toContain(v.category);
      // the category is the one its own CWE maps to, not a label typed in here
      expect(categoryOf(v.type, v.cwe), v.type).toBe(v.category);
      expect(v.cwe, `${v.type} has no CWE`).toBeTruthy();
      expect(knowledgeFor(v.type).explain, `${v.type} has no explanation`).toBeTruthy();
    }
  });

  /**
   * The card's code frame is the product's answer to "why should I believe
   * this?". Measured before: 0 of the demo's 7 findings carried one, so the
   * frame the README promises was invisible on the first screen every visitor
   * opens. The demo names the line its rule matched, so that line is the frame;
   * the two neighbours a real scan reads are absent, because no file was read.
   */
  it("shows the line each of its findings was raised on", () => {
    const all = demo.files.flatMap((f) => f.vulnerabilities);
    expect(all.length).toBe(7);
    for (const v of all) {
      expect(v.snippet, `${v.type} carries no code frame`).toBeTruthy();
      expect(v.snippet!.line.length, `${v.type} has an empty frame`).toBeGreaterThan(0);
      expect(v.snippet!.number, `${v.type} has no line number`).toBeGreaterThan(0);
      expect(v.snippet!.before, `${v.type} invented lines above`).toEqual([]);
      expect(v.snippet!.after, `${v.type} invented lines below`).toEqual([]);
    }
    // the frame quotes the line the spec names, not a paraphrase of it
    const jwt = all.find((v) => v.type === "HARDCODED_SECRET");
    expect(jwt!.snippet!.line).toContain("JWT_SECRET");
    expect(jwt!.snippet!.number).toBe(23);

    // and it survives the mapping, because the panel draws it from the city tree
    const city = mapResultToCityData(demo);
    const walk = (node: typeof city.tree): CityFile[] => [
      ...node.detailFiles,
      ...node.children.flatMap(walk),
    ];
    const drawn = walk(city.tree).flatMap((f) => f.findings);
    expect(drawn.length).toBe(7);
    for (const v of drawn) expect(v.snippet, `${v.type} lost its frame on the way`).toBeTruthy();
  });

  it("derives the complexity summary from the files it ships", () => {
    const scores = demo.files.map((f) => f.complexity.cyclomatic);
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
    expect(demo.summary.avgCyclomatic).toBe(avg);
    expect(demo.summary.maxCyclomatic).toBe(Math.max(...scores));
    expect(demo.summary.totalLines).toBe(demo.files.reduce((s, f) => s + f.lines.total, 0));
  });

  it("aggregates each district from the files inside it", () => {
    expect(demo.summary.totalDirectories).toBe(demo.directories.length);
    for (const dir of demo.directories) {
      const inside = demo.files.filter((f) => f.path.startsWith(dir.path + "/"));
      expect(dir.fileCount, dir.path).toBe(inside.length);
      expect(dir.totalLines, dir.path).toBe(inside.reduce((s, f) => s + f.lines.total, 0));
      expect(dir.vulnerabilityCount, dir.path).toBe(
        inside.reduce((s, f) => s + f.vulnerabilities.length, 0),
      );
      const mean =
        inside.reduce((s, f) => s + f.complexity.cyclomatic, 0) / Math.max(1, inside.length);
      expect(dir.avgComplexity, dir.path).toBe(Math.round(mean * 100) / 100);
    }
  });

  it("says which engines did not run, and attributes its findings to the demo", () => {
    const provenance = demo.summary.scanProvenance;
    expect(provenance).toBeDefined();
    expect(Object.entries(provenance ?? {})).toHaveLength(9);
    for (const [engine, ran] of Object.entries(provenance ?? {})) {
      expect(ran, `${engine} did not run on a synthetic folder`).toBe(false);
    }

    const findings = demo.files.flatMap((f) => f.vulnerabilities);
    expect(findings.length).toBe(demo.summary.totalVulnerabilities);
    for (const finding of findings) {
      expect(finding.provenance).toBe("demo");
    }
    expect(demo.repo.cloneUrl).toBe("");
  });

  it("hands the missing depth to the city payload", () => {
    const city = mapResultToCityData(demo);
    expect(city.scanProvenance?.semgrep).toBe(false);
    expect(city.scanProvenance?.gitleaks).toBe(false);
    // Nothing was ignored by a .gitignore either — the demo never read one.
    expect(city.skippedByGitignore).toBeUndefined();
    expect(city.findingsBySeverity.P0).toBeGreaterThan(0);
  });

  it("is deterministic, apart from when it was asked", () => {
    const withoutStamp = (r: AnalysisResult) => ({
      ...r,
      createdAt: "",
      repo: { ...r.repo, analyzedAt: "" },
    });
    expect(withoutStamp(getDemoResult())).toEqual(withoutStamp(demo));
  });
});
