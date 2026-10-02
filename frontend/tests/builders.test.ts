import { describe, expect, it } from "vitest";
import { planBuildSites } from "../src/city/sidewalks";
import type { DirLayout } from "../src/city/layout";
import type { CityDir, CityFile } from "../src/city/types";

function makeDir(name: string, path: string): CityDir {
  return {
    name,
    path,
    fileCount: 0,
    linesOfCode: 100,
    languages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [],
    remainingFiles: 0,
    districtFiles: [],
  };
}

function makeFile(id: string, path: string): CityFile {
  return {
    id,
    name: `${id}.ts`,
    path,
    language: "TypeScript",
    linesOfCode: 120,
    cyclomaticComplexity: 3,
    threatLevel: "safe",
    findings: [],
  };
}

/** 2 blocks + 3 plaza buildings, square footprints like the real layouts. */
const LAYOUT: DirLayout = {
  dir: makeDir("root", ""),
  blocks: [
    { dir: makeDir("api", "/api"), x: -20, z: -14, w: 10, d: 10, skyline: [] },
    { dir: makeDir("web", "/web"), x: 18, z: 16, w: 6, d: 6, skyline: [] },
  ],
  buildings: [
    { file: makeFile("f1", "src/a.ts"), x: 0, z: 0, w: 3, d: 3, h: 8 },
    { file: makeFile("f2", "src/b.ts"), x: -6.4, z: 2, w: 2.6, d: 2.6, h: 5 },
    { file: makeFile("f3", "src/c.ts"), x: 6.4, z: -2, w: 3.2, d: 3.2, h: 5 },
  ],
  // podium present on purpose: it must NOT receive a site
  podium: { count: 4, x: 12, z: 12 },
  streets: [],
  bounds: 40,
  plazaExtent: 10,
};

describe("planBuildSites", () => {
  it("maps every block and building to a site — the podium gets none", () => {
    const sites = planBuildSites(LAYOUT);
    expect(sites).toHaveLength(5);
  });

  it("orders sites blocks first, then buildings — at the CityTree door points", () => {
    const sites = planBuildSites(LAYOUT);
    // blocks in layout.blocks order, door margin 1.1
    expect(sites[0]!.x).toBe(-20);
    expect(sites[0]!.doorZ).toBeCloseTo(-14 + 10 / 2 + 1.1, 10);
    expect(sites[1]!.x).toBe(18);
    expect(sites[1]!.doorZ).toBeCloseTo(16 + 6 / 2 + 1.1, 10);
    // buildings in layout.buildings order, door margin 0.9
    expect(sites[2]!.x).toBe(0);
    expect(sites[2]!.doorZ).toBeCloseTo(0 + 3 / 2 + 0.9, 10);
    expect(sites[3]!.x).toBe(-6.4);
    expect(sites[3]!.doorZ).toBeCloseTo(2 + 2.6 / 2 + 0.9, 10);
    expect(sites[4]!.x).toBe(6.4);
    expect(sites[4]!.doorZ).toBeCloseTo(-2 + 3.2 / 2 + 0.9, 10);
  });

  it("places every work point outside its plot footprint", () => {
    const placements: Array<{ x: number; z: number; w: number; d: number }> = [
      ...LAYOUT.blocks,
      ...LAYOUT.buildings,
    ];
    const sites = planBuildSites(LAYOUT);
    expect(sites).toHaveLength(placements.length);
    placements.forEach((p, i) => {
      const s = sites[i]!;
      // the work point sits at the plot edge, clear of the footprint
      const outside =
        Math.abs(s.doorX - p.x) >= p.w / 2 + 0.5 || Math.abs(s.doorZ - p.z) >= p.d / 2 + 0.5;
      expect(outside).toBe(true);
      // and at a straight-line distance clear of the half-extent + margin
      const dist = Math.hypot(s.doorX - p.x, s.doorZ - p.z);
      expect(dist).toBeGreaterThanOrEqual(Math.max(p.w, p.d) / 2 + 0.5);
    });
  });

  it("is deterministic — same layout, same sites", () => {
    expect(planBuildSites(LAYOUT)).toEqual(planBuildSites(LAYOUT));
  });
});
