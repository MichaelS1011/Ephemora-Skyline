import { describe, it, expect } from "vitest";
import { getDemoResult } from "../src/server/routes/demo.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import type { AnalysisResult } from "../src/models/index.js";

/**
 * The demo is generated, not analyzed — so it may only claim what its own
 * synthetic files support. These checks keep the summary from carrying numbers
 * no pipeline produced, and keep the findings from wearing a scanner's badge.
 */
describe("demo city claims only what its own data supports", () => {
  const demo = getDemoResult();

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
