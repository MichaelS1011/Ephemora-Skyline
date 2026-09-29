import { describe, it, expect } from "vitest";
import {
  blockFootprint,
  resolveDir,
  getDirLayout,
  setLayoutMode,
  allFiles,
  searchFiles,
  riskScore,
  landmarkFileId,
  tourStops,
} from "../src/city/layout";
import type { CityData, CityFile } from "../src/city/types";

function createMockCity(): CityData {
  const file1: CityFile = {
    id: "f1",
    name: "server.ts",
    path: "src/server.ts",
    language: "TypeScript",
    linesOfCode: 500,
    cyclomaticComplexity: 12,
    threatLevel: "critical",
    findings: [
      {
        type: "CMD_INJECTION",
        severity: "P0",
        line: 42,
        message: "Command injection vulnerability",
      },
    ],
  };

  const file2: CityFile = {
    id: "f2",
    name: "utils.ts",
    path: "src/utils.ts",
    language: "TypeScript",
    linesOfCode: 150,
    cyclomaticComplexity: 4,
    threatLevel: "medium",
    findings: [
      {
        type: "REGEX_DOS",
        severity: "P2",
        line: 10,
        message: "Inefficient regex",
      },
    ],
  };

  const file3: CityFile = {
    id: "f3",
    name: "README.md",
    path: "README.md",
    language: "Markdown",
    linesOfCode: 30,
    cyclomaticComplexity: 1,
    threatLevel: "safe",
    findings: [],
  };

  return {
    repo: {
      owner: "acme",
      name: "cyber-app",
      branch: "main",
    },
    totalFiles: 3,
    renderedFiles: 3,
    totalLines: 680,
    findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
    languages: { TypeScript: 650, Markdown: 30 },
    tree: {
      name: "",
      path: "",
      fileCount: 3,
      linesOfCode: 680,
      languages: { TypeScript: 650, Markdown: 30 },
      findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
      threatScore: 13,
      topFindings: file1.findings,
      children: [
        {
          name: "src",
          path: "src",
          fileCount: 2,
          linesOfCode: 650,
          languages: { TypeScript: 650 },
          findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
          threatScore: 13,
          topFindings: file1.findings,
          children: [],
          detailFiles: [file1, file2],
          remainingFiles: 0,
          districtFiles: [file1, file2],
        },
      ],
      detailFiles: [file3],
      remainingFiles: 0,
      districtFiles: [file1, file2, file3],
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

describe("City Layout Calculations", () => {
  it("calculates clamped block footprints", () => {
    expect(blockFootprint(0)).toBeCloseTo(8.3, 1);
    expect(blockFootprint(100)).toBeCloseTo(8 + 10 * 0.3, 1);
    expect(blockFootprint(1000000)).toBe(20);
  });

  it("resolves nested directories and falls back gracefully", () => {
    const city = createMockCity();
    const root = resolveDir(city.tree, []);
    expect(root.name).toBe("");

    const src = resolveDir(city.tree, ["src"]);
    expect(src.name).toBe("src");
    expect(src.detailFiles.length).toBe(2);

    const nonExistent = resolveDir(city.tree, ["src", "unknown"]);
    expect(nonExistent.name).toBe("src");
  });

  it("computes deterministic layout with bounds and placements", () => {
    const city = createMockCity();
    const rootLayout1 = getDirLayout(city, []);
    const rootLayout2 = getDirLayout(city, []);

    expect(rootLayout1).toBe(rootLayout2); // cached reference
    expect(rootLayout1.bounds).toBeGreaterThan(0);
    expect(rootLayout1.buildings.length).toBe(1); // README.md in root
    expect(rootLayout1.blocks.length).toBe(1); // src block

    const srcLayout = getDirLayout(city, ["src"]);
    expect(srcLayout.buildings.length).toBe(2);
    expect(srcLayout.buildings.some((b) => b.file.name === "server.ts")).toBe(true);
  });

  it("indexes and searches files across the hierarchy", () => {
    const city = createMockCity();
    const files = allFiles(city);
    expect(files.length).toBe(3);

    const hit = searchFiles(city, "server");
    expect(hit.length).toBe(1);
    expect(hit[0]?.file.name).toBe("server.ts");
    expect(hit[0]?.chain).toEqual(["src"]);

    const mdHit = searchFiles(city, "markdown");
    expect(mdHit.length).toBe(1);
    expect(mdHit[0]?.file.name).toBe("README.md");

    expect(searchFiles(city, "")).toEqual([]);
  });

  it("identifies highest risk file and orders tour stops", () => {
    const city = createMockCity();
    expect(landmarkFileId(city)).toBe("f1");

    const stops = tourStops(city);
    expect(stops.length).toBe(2);
    expect(stops[0]?.file.id).toBe("f1"); // P0 risk score 10
    expect(stops[1]?.file.id).toBe("f2"); // P2 risk score 3

    expect(riskScore(stops[0]!.file)).toBe(10);
    expect(riskScore(stops[1]!.file)).toBe(3);
  });
});

describe("Voronoi layout mode", () => {
  it("produces the same DirLayout contract as the grid", () => {
    const city = createMockCity();
    setLayoutMode("voronoi");
    const layout = getDirLayout(city, []);
    expect(layout.buildings.length).toBe(1);
    expect(layout.blocks.length).toBe(1);
    expect(layout.bounds).toBeGreaterThan(0);
    expect(layout.streets.length).toBeGreaterThan(0); // cell boundaries
    expect(layout.blocks[0]!.skyline.length).toBeGreaterThan(0);
    setLayoutMode("grid");
  });

  it("is deterministic across mode switches and repeated calls", () => {
    const city = createMockCity();
    setLayoutMode("voronoi");
    const a = getDirLayout(city, []);
    const b = getDirLayout(city, []);
    expect(a).toBe(b); // cached reference, per mode
    setLayoutMode("grid");
    const grid = getDirLayout(city, []);
    expect(grid).not.toBe(a);
    setLayoutMode("voronoi");
    expect(getDirLayout(city, [])).toBe(a); // separate cache slot per mode
    setLayoutMode("grid");
  });

  it("separates blocks — no overlapping block plots", () => {
    const city = createMockCity();
    // Give the tree several children by hand
    const mk = (name: string, loc: number): CityFile => ({
      id: `f-${name}`,
      name: `${name}.ts`,
      path: `${name}/${name}.ts`,
      language: "TypeScript",
      linesOfCode: loc,
      cyclomaticComplexity: 3,
      threatLevel: "safe",
      findings: [],
    });
    city.tree.children = ["services", "utils", "ui", "infra", "api", "docs", "db", "jobs"].map(
      (n) => ({
        name: n,
        path: n,
        fileCount: 1,
        linesOfCode: 400,
        languages: { TypeScript: 400 },
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
        threatScore: 0,
        topFindings: [],
        children: [],
        detailFiles: [mk(n, 400)],
        remainingFiles: 0,
        districtFiles: [mk(n, 400)],
      }),
    );
    setLayoutMode("voronoi");
    const layout = getDirLayout(city, []);
    expect(layout.blocks.length).toBe(8);
    for (let i = 0; i < layout.blocks.length; i++) {
      for (let j = i + 1; j < layout.blocks.length; j++) {
        const a = layout.blocks[i]!;
        const b = layout.blocks[j]!;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        expect(dist).toBeGreaterThan((a.w + b.w) / 2 - 1.5); // plots don't overlap (jitter margin)
      }
    }
    setLayoutMode("grid");
  });

  it("keeps the plaza buildings in one compact cluster", () => {
    const city = createMockCity();
    setLayoutMode("voronoi");
    const layout = getDirLayout(city, []);
    if (layout.buildings.length > 1) {
      const cx = layout.buildings.reduce((s, b) => s + b.x, 0) / layout.buildings.length;
      const cz = layout.buildings.reduce((s, b) => s + b.z, 0) / layout.buildings.length;
      for (const b of layout.buildings) {
        // Compact plaza: every building near the cluster centre
        expect(Math.hypot(b.x - cx, b.z - cz)).toBeLessThan(layout.plazaExtent * 2 + 12);
      }
    }
    setLayoutMode("grid");
  });
});
