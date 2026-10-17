import { describe, it, expect } from "vitest";
import {
  blockFootprint,
  byRisk,
  resolveDir,
  getDirLayout,
  setLayoutMode,
  allFiles,
  searchFiles,
  riskScore,
  landmarkFileId,
  tourStops,
  revealPulseFileId,
  armRevealPulse,
  REVEAL_FLIGHT_MS,
} from "../src/city/layout";
import type { CityData, CityFile, Severity } from "../src/city/types";

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

describe("test code in the risk ranking", () => {
  function risky(id: string, path: string, role: "code" | "test", findings: Severity[]): CityFile {
    return {
      id,
      name: path.split("/").pop() ?? path,
      path,
      language: "TypeScript",
      linesOfCode: 100,
      cyclomaticComplexity: 3,
      threatLevel: findings.includes("P0") ? "critical" : "medium",
      role,
      findings: findings.map((severity, i) => ({
        type: "SQL_INJECTION",
        severity,
        line: i + 1,
        message: "m",
      })),
    };
  }

  it("puts shipped code above a fixture that scores higher", () => {
    const shipped = risky("c1", "src/app.ts", "code", ["P2"]);
    const fixture = risky("t1", "tests/app.test.ts", "test", ["P0", "P0", "P0"]);
    expect(riskScore(fixture)).toBeGreaterThan(riskScore(shipped));
    expect(byRisk(shipped, fixture)).toBeLessThan(0);
    expect(byRisk(fixture, shipped)).toBeGreaterThan(0);
  });

  it("still ranks two fixtures against each other by their findings", () => {
    const a = risky("t1", "tests/a.test.ts", "test", ["P2"]);
    const b = risky("t2", "tests/b.test.ts", "test", ["P0"]);
    expect(byRisk(b, a)).toBeLessThan(0);
  });

  it("names the shipped file as the city's landmark when a fixture outscores it", () => {
    const city = createMockCity();
    const fixture = risky("t9", "tests/fixture.test.ts", "test", ["P0", "P0", "P0"]);
    const shipped = risky("c9", "src/real.ts", "code", ["P1"]);
    city.tree.children[0]!.detailFiles = [fixture, shipped];
    city.tree.children[0]!.districtFiles = [fixture, shipped];
    expect(landmarkFileId(city)).toBe("c9");
    expect(tourStops(city)[0]?.file.id).toBe("c9");
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

  /**
   * The plaza packs by the WIDEST footprint it hosts, so a level full of broad
   * buildings is the case that breaks packing. Measured on a 2901-file city
   * after the voxel base was allowed to grow with a file's volume: three pairs
   * of neighbours stood 0.17–0.29 m inside each other, because the grid pitch
   * only cleared the footprint by 0.8 m while each of the two could be thrown
   * 0.7 m by its own jitter.
   */
  describe("plaza packing with wide buildings", () => {
    const fat = (i: number): CityFile => ({
      id: `w${i}`,
      name: `module-${i}.ts`,
      path: `src/big/module-${i}.ts`,
      language: "TypeScript",
      linesOfCode: 5200 + i * 130,
      cyclomaticComplexity: 40,
      threatLevel: "safe",
      findings: [],
      exportedSymbols: 3,
      importCount: 12,
      sections: Array.from({ length: 8 }, (_, k) => ({
        name: `s${k}`,
        kind: "function",
        start: k * 600 + 1,
        end: k * 600 + 600,
        codeLines: 600,
        depth: 4,
      })),
    });

    const wideCity = (): CityData => {
      const c = createMockCity();
      c.tree.detailFiles = Array.from({ length: 12 }, (_, i) => fat(i));
      c.tree.fileCount = c.tree.detailFiles.length;
      return c;
    };

    for (const mode of ["voronoi", "grid"] as const) {
      it(`${mode}: no two plaza buildings share ground, and the grid is not tighter than the pitch`, () => {
        const city = wideCity();
        setLayoutMode(mode);
        const layout = getDirLayout(city, []);
        const bs = layout.buildings;
        expect(bs.length).toBeGreaterThan(1);
        // Sanity: these really are the wide ones (0.8× the mapping footprint)
        expect(Math.max(...bs.map((b) => b.w))).toBeGreaterThan(4);
        for (let i = 0; i < bs.length; i++)
          for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i]!;
            const b = bs[j]!;
            const ox =
              Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
            const oz =
              Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2);
            expect(ox > 0.01 && oz > 0.01).toBe(false);
          }
        // Placement must use the voxel footprint, not the mapping one
        for (const b of bs) {
          expect(b.w).toBeCloseTo(b.voxels!.footprintW, 6);
          expect(b.d).toBeCloseTo(b.voxels!.footprintD, 6);
        }
        setLayoutMode("grid");
      });
    }
  });
});

/**
 * V3 (S-P3): the reveal pulse must light exactly the building that carries the
 * worst REAL finding of the level the reveal frames — and never a synthetic
 * demo finding, because the demo is honest about being nobody's analysis.
 */
describe("the reveal pulse picks the worst real finding", () => {
  it("targets the P0 file drawn on the level the reveal frames", () => {
    const city = createMockCity();
    // src plaza holds server.ts (P0) and utils.ts (P2) — the P0 wins
    expect(revealPulseFileId(city, ["src"])).toBe("f1");
  });

  it("finds the worst finding through the district skyline, where most repos keep it", () => {
    const city = createMockCity();
    // the root overview frames districts: server.ts stands as a skyline tower
    // of the src block — the pulse targets that tower, not nothing
    expect(revealPulseFileId(city, [])).toBe("f1");
  });

  it("prefers severity over anything else: a P1 beats a P2 pair", () => {
    const city = createMockCity();
    const [server, utils] = city.tree.children[0]!.detailFiles as [CityFile, CityFile];
    server.findings = [
      {
        type: "REGEX_DOS",
        severity: "P2",
        line: 10,
        message: "Inefficient regex",
      },
    ];
    utils.findings = [
      {
        type: "WEAK_HASH",
        severity: "P1",
        line: 3,
        message: "Weak hash",
      },
    ];
    expect(revealPulseFileId(city, ["src"])).toBe("f2");
  });

  it("stays dark when the worst finding is not drawn on the framed level", () => {
    const city = createMockCity();
    // demote the plaza files so the only P0 lives deep down
    const [server, utils] = city.tree.children[0]!.detailFiles as [CityFile, CityFile];
    server.findings = [
      { type: "REGEX_DOS", severity: "P2", line: 10, message: "Inefficient regex" },
    ];
    utils.findings = [
      { type: "REGEX_DOS", severity: "P2", line: 12, message: "Inefficient regex" },
    ];
    const deep: CityFile = {
      id: "f-deep",
      name: "deep.ts",
      path: "src/deep/deep.ts",
      language: "TypeScript",
      linesOfCode: 40,
      cyclomaticComplexity: 2,
      threatLevel: "critical",
      findings: [{ type: "EVAL_USAGE", severity: "P0", line: 1, message: "eval" }],
    };
    const drawn: CityFile = {
      id: "f-drawn",
      name: "drawn.ts",
      path: "src/deep/drawn.ts",
      language: "TypeScript",
      linesOfCode: 20,
      cyclomaticComplexity: 1,
      threatLevel: "safe",
      findings: [],
    };
    // the deep district's skyline names ONLY the clean file — deep.ts is
    // neither plaza nor skyline on the src level, so nothing may pulse
    city.tree.children[0]!.children = [
      {
        name: "deep",
        path: "src/deep",
        fileCount: 2,
        linesOfCode: 60,
        languages: { TypeScript: 60 },
        findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
        threatScore: 10,
        topFindings: deep.findings,
        children: [],
        detailFiles: [deep, drawn],
        remainingFiles: 0,
        districtFiles: [drawn],
      },
    ];
    expect(revealPulseFileId(city, ["src"])).toBeNull();
  });

  it("never lights a demo finding — synthetic examples are not scan results", () => {
    const city = createMockCity();
    for (const f of city.tree.children[0]!.detailFiles) {
      for (const finding of f.findings) finding.provenance = "demo";
    }
    expect(revealPulseFileId(city, ["src"])).toBeNull();
    expect(revealPulseFileId(city, [])).toBeNull();
    // the demo city DOES carry findings — the pulse must ignore them, not
    // pretend the scan found nothing
    expect(city.findingsBySeverity.P0).toBe(1);
  });

  it("stays dark for a scan without findings", () => {
    const city = createMockCity();
    for (const f of city.tree.children[0]!.detailFiles) f.findings = [];
    expect(revealPulseFileId(city, ["src"])).toBeNull();
  });
});

describe("the reveal pulse is armed with the reveal flight", () => {
  it("begins when the flight ends, and at once under reduced motion", () => {
    const city = createMockCity();
    const at = 1000;
    expect(REVEAL_FLIGHT_MS).toBe(1400);
    // defaultOverviewPath is [] for a small city; the worst file stands on
    // the src skyline, so the pulse targets its tower
    expect(armRevealPulse(city, at, false)).toEqual({ fileId: "f1", startAt: at + 1400 });
    expect(armRevealPulse(city, at, true)).toEqual({ fileId: "f1", startAt: at });
  });

  it("arms nothing for a city with no real finding", () => {
    const city = createMockCity();
    for (const f of city.tree.children[0]!.detailFiles) {
      for (const finding of f.findings) finding.provenance = "demo";
    }
    expect(armRevealPulse(city, 1000, false)).toBeNull();
    expect(armRevealPulse(null, 1000, false)).toBeNull();
  });
});
