import { describe, expect, it } from "vitest";
import type { FileAnalysis } from "../src/models/index.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";

describe("mapResultToCityData", () => {
  it("builds a hierarchical tree with honest subtree counts", () => {
    const result = mapResultToCityData(
      makeResult([
        makeFile({ path: "src/app.ts" }),
        makeFile({ path: "src/util.ts" }),
        makeFile({ path: "lib/helper.ts" }),
        makeFile({ path: "README.md" }),
      ]),
    );

    expect(result.tree.fileCount).toBe(4); // full count, root included
    const childNames = result.tree.children.map((c) => c.name).sort();
    expect(childNames).toEqual(["lib", "src"]);
    const src = result.tree.children.find((c) => c.name === "src")!;
    expect(src.fileCount).toBe(2);
    expect(src.detailFiles).toHaveLength(2);
    // README sits in the root node itself
    expect(result.tree.detailFiles.map((f) => f.path)).toContain("README.md");
    expect(result.renderedFiles).toBe(4);
    expect(result.totalFiles).toBe(4);
  });

  it("resolves relative imports to file connections", () => {
    const result = mapResultToCityData(
      makeResult([
        makeFile({
          path: "src/app.ts",
          imports: [{ source: "./util", named: ["a"], isExternal: false, line: 1 }],
        }),
        makeFile({ path: "src/util.ts" }),
        makeFile({
          path: "src/other.ts",
          imports: [{ source: "../lib/helper", named: ["b"], isExternal: false, line: 2 }],
        }),
        makeFile({ path: "lib/helper.ts" }),
      ]),
    );

    const edge = result.fileConnections.find(
      (c) =>
        c.from.endsWith(
          result.tree.children
            .find((c) => c.name === "src")!
            .detailFiles.find((f) => f.name === "app.ts")!.id,
        ) === false,
    );
    // precise check: app.ts -> util.ts edge exists
    const src = result.tree.children.find((c) => c.name === "src")!;
    const app = src.detailFiles.find((f) => f.name === "app.ts")!;
    const util = src.detailFiles.find((f) => f.name === "util.ts")!;
    expect(result.fileConnections).toContainEqual({ from: app.id, to: util.id, weight: 1 });

    // cross-directory edge aggregated at top level: src -> lib
    expect(result.dirConnections.some((c) => c.from === "src" && c.to === "lib")).toBe(true);
    expect(edge).toBeDefined();
  });

  it("handles TS-ESM .js import specifiers and index files", () => {
    const result = mapResultToCityData(
      makeResult([
        makeFile({
          path: "a/main.ts",
          imports: [{ source: "./ui/Button.js", named: ["Button"], isExternal: false, line: 1 }],
        }),
        makeFile({ path: "a/ui/Button.ts" }),
        makeFile({
          path: "b/main.ts",
          imports: [{ source: "../b/api", named: ["api"], isExternal: false, line: 1 }],
        }),
        makeFile({ path: "b/api/index.ts" }),
      ]),
    );

    expect(result.fileConnections).toHaveLength(2);
  });

  it("marks files critical on P0 findings and aggregates severity upward", () => {
    const result = mapResultToCityData(
      makeResult([
        makeFile({
          path: "src/db.ts",
          vulnerabilities: [
            { type: "SQL_INJECTION", severity: "P0", score: 10, line: 5, code: "x", message: "m" },
          ],
        }),
      ]),
    );

    const db = result.tree.children[0]!.detailFiles[0]!;
    expect(db.threatLevel).toBe("critical");
    expect(result.tree.findingsBySeverity.P0).toBe(1);
    expect(result.tree.threatScore).toBe(10);
    expect(result.tree.topFindings[0]!.type).toBe("SQL_INJECTION");
  });

  it("caps detail files per directory and reports the rest as remainingFiles", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      makeFile({
        path: `big/file${String(i).padStart(2, "0")}.ts`,
        lines: { total: 10, code: 10 + i, comments: 0, blank: 0 },
      }),
    );
    const result = mapResultToCityData(makeResult(many));
    const big = result.tree.children[0]!;
    expect(big.detailFiles.length).toBeLessThanOrEqual(35);
    expect(big.fileCount).toBe(60);
    expect(big.detailFiles.length + big.remainingFiles).toBe(60);
    expect(result.renderedFiles).toBeLessThan(60);
    expect(result.totalFiles).toBe(60);
  });

  it("preserves all findings and files beyond the visual budget", () => {
    const files = Array.from({ length: 60 }, (_, i) =>
      makeFile({
        path: `big/f${i}.ts`,
        vulnerabilities: Array.from({ length: 9 }, (_, line) => ({
          type: "EVAL_USAGE",
          severity: "P0" as const,
          score: 10,
          line: line + 1,
          code: "eval(input)",
          message: "Review execution",
        })),
      }),
    );
    const city = mapResultToCityData(makeResult(files));
    const all = [...city.tree.children[0]!.detailFiles, ...(city.additionalFiles ?? [])];
    expect(new Set(all.map((f) => f.id)).size).toBe(60);
    expect(all.reduce((n, f) => n + f.findings.length, 0)).toBe(540);
  });

  it("never double-counts remainingFiles in nested trees", () => {
    // 21 files across backend/src/{server/routes(8), services(10), models(3)}
    // — all rendered (under the cap), so NO level may report remaining files.
    const files: FileAnalysis[] = [];
    for (let i = 0; i < 8; i++)
      files.push(makeFile({ path: `backend/src/server/routes/r${i}.ts` }));
    for (let i = 0; i < 10; i++) files.push(makeFile({ path: `backend/src/services/s${i}.ts` }));
    for (let i = 0; i < 3; i++) files.push(makeFile({ path: `backend/src/models/m${i}.ts` }));
    const result = mapResultToCityData(makeResult(files));

    const backend = result.tree.children[0]!;
    const src = backend.children[0]!;
    expect(backend.name).toBe("backend");
    expect(src.name).toBe("src");
    expect(backend.fileCount).toBe(21);
    expect(backend.remainingFiles).toBe(0);
    expect(src.remainingFiles).toBe(0);
    expect(result.renderedFiles).toBe(21);
  });

  it("selects representative districtFiles from the whole subtree (risk first)", () => {
    const files: FileAnalysis[] = [
      // deep, small but P0 → must surface in the district skyline
      makeFile({
        path: "app/deep/nested/tiny.ts",
        lines: { total: 10, code: 10, comments: 0, blank: 0 },
        vulnerabilities: [
          { type: "EVAL_USAGE", severity: "P0", score: 10, line: 1, code: "x", message: "m" },
        ],
      }),
      // large but clean
      makeFile({
        path: "app/deep/big1.ts",
        lines: { total: 900, code: 900, comments: 0, blank: 0 },
      }),
      makeFile({ path: "app/big2.ts", lines: { total: 800, code: 800, comments: 0, blank: 0 } }),
    ];
    const result = mapResultToCityData(makeResult(files));
    const app = result.tree.children[0]!;
    expect(app.districtFiles.length).toBeGreaterThanOrEqual(2);
    const paths = app.districtFiles.map((f) => f.path);
    expect(paths).toContain("app/deep/nested/tiny.ts"); // risk beats size
    const appView = result.tree.children[0]!;
    expect(appView.districtFiles[0]!.threatLevel).toBe("critical");
  });

  it("carries scanProvenance through to the city", () => {
    // ScanSummary decides "clear" or "unlooked" from the city payload alone,
    // so the truth the orchestrator wrote has to survive the mapping.
    const provenance = {
      regex: true,
      gitleaks: true,
      semgrep: false,
      dependencies: false,
      osv: false,
      ruff: false,
    };
    const analysis = makeResult([makeFile({ path: "src/app.ts" })]);
    analysis.summary.scanProvenance = provenance;
    expect(mapResultToCityData(analysis).scanProvenance).toEqual(provenance);
  });

  it("leaves provenance absent for a result that never scanned", () => {
    const city = mapResultToCityData(makeResult([makeFile({ path: "src/app.ts" })]));
    expect(city.scanProvenance).toBeUndefined();
  });

  it("carries dependencyRunner through, not only the booleans", () => {
    // `dependencies` is one boolean for two different programs, so the card can
    // only name the right one from the field that says which answered. A mapper
    // that rebuilt the object from a known key list would drop it here and leave
    // the panel crediting `npm audit` for a scan only osv-scanner took part in.
    const provenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      dependencyRunner: "osv",
      osv: true,
    };
    const analysis = makeResult([makeFile({ path: "src/app.ts" })]);
    analysis.summary.scanProvenance = provenance;

    const city = mapResultToCityData(analysis);
    expect(city.scanProvenance?.dependencyRunner).toBe("osv");
    expect(city.scanProvenance).toStrictEqual(provenance);
  });

  it("invents no runner for a city JSON written before the field existed", () => {
    // A stored result with no `dependencyRunner` key at all: the mapping has to
    // run through and hand back exactly what was stored. The engine the card
    // falls back to is the frontend's reading of the flag — the mapper must not
    // answer that question by writing a field the scan never produced.
    const provenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      osv: true,
    };
    const analysis = makeResult([makeFile({ path: "src/app.ts" })]);
    analysis.summary.scanProvenance = provenance;

    const city = mapResultToCityData(analysis);
    expect(city.scanProvenance?.dependencyRunner).toBeUndefined();
    expect(city.scanProvenance).toStrictEqual(provenance);
  });

  it("keeps an explicit null runner and a false dependencies flag", () => {
    // Nothing dependency-related ran, but osv is irrelevant here: `osv: true`
    // never means `dependencies: true`, and it never names a runner either. A
    // mapper that derived one flag from another would turn "the audit did not
    // run" into a claim about an engine that was never asked.
    const provenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: false,
      dependencyRunner: null,
      osv: true,
    };
    const analysis = makeResult([makeFile({ path: "src/app.ts" })]);
    analysis.summary.scanProvenance = provenance;

    const city = mapResultToCityData(analysis);
    expect(city.scanProvenance?.dependencies).toBe(false);
    expect(city.scanProvenance?.dependencyRunner).toBeNull();
    expect(city.scanProvenance).toStrictEqual(provenance);
  });
});
