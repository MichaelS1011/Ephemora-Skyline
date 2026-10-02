import { describe, expect, it } from "vitest";
import { planConstruction } from "../src/city/layout";
import type { BlockPlacement, BuildingPlacement, DirLayout } from "../src/city/layout";
import type { CityDir, CityFile } from "../src/city/types";
import { languageColor } from "../src/city/palette";

function makeDir(name: string, path: string, languages: Record<string, number> = {}): CityDir {
  return {
    name,
    path,
    fileCount: 0,
    linesOfCode: 100,
    languages,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [],
    remainingFiles: 0,
    districtFiles: [],
  };
}

function makeFile(id: string, path: string, language = "TypeScript"): CityFile {
  return {
    id,
    name: `${id}.ts`,
    path,
    language,
    linesOfCode: 120,
    cyclomaticComplexity: 3,
    threatLevel: "safe",
    findings: [],
  };
}

function tower(id: string, x: number, z: number, d: number, h: number): BuildingPlacement {
  return { file: makeFile(id, `src/${id}.ts`), x, z, w: 2, d, h };
}

function block(name: string, x: number, z: number, d: number, skyline: BuildingPlacement[]) {
  return {
    dir: makeDir(name, `/${name}`, { Markdown: 40, TypeScript: 260 }),
    x,
    z,
    w: 10,
    d,
    skyline,
  };
}

/**
 * 2 districts (one with two towers), 3 plaza buildings, podium present.
 * Eight rising units — but only seven of them are places a builder stands.
 */
const LAYOUT: DirLayout = {
  dir: makeDir("root", ""),
  blocks: [
    block("api", -20, -14, 10, [tower("t1", -2, -2, 2.6, 9), tower("t2", 2.5, 1, 2, 4)]),
    block("web", 18, 16, 6, []),
  ] as BlockPlacement[],
  buildings: [
    { file: makeFile("f1", "src/a.ts"), x: 0, z: 0, w: 3, d: 3, h: 8 },
    { file: makeFile("f2", "src/b.ts", "Python"), x: -6.4, z: 2, w: 2.6, d: 2.6, h: 5 },
    { file: makeFile("f3", "src/c.ts", "Rust"), x: 6.4, z: -2, w: 3.2, d: 3.2, h: 5 },
  ],
  // podium on purpose: it lands as a floor slab, so it gets no work point
  podium: { count: 4, x: 12, z: 12 },
  streets: [],
  bounds: 40,
  plazaExtent: 10,
};

const plan = planConstruction(LAYOUT, 1000);

describe("planConstruction sites", () => {
  it("counts every rising unit but staffs only the ones that stand somewhere", () => {
    // 2 plots + 2 towers + 3 plaza buildings + 1 podium
    expect(plan.total).toBe(8);
    expect(plan.sites).toHaveLength(7);
    expect(plan.sites.some((s) => s.kind === "district" && s.x === 12)).toBe(false);
  });

  it("orders sites in rise order, one slot per unit", () => {
    expect(plan.sites.map((s) => s.kind)).toEqual([
      "district",
      "tower",
      "tower",
      "district",
      "building",
      "building",
      "building",
    ]);
    const offsets = plan.sites.map((s) => s.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    // the schedule and the work points are written by the same walk
    expect(offsets[0]).toBeCloseTo(plan.blockAt[0]! - 1000, 6);
    expect(offsets[1]).toBeCloseTo(plan.skylineAt[0]![0]! - 1000, 6);
    expect(offsets[3]).toBeCloseTo(plan.blockAt[1]! - 1000, 6);
    expect(offsets[4]).toBeCloseTo(plan.plazaAt[0]! - 1000, 6);
  });

  it("puts a district tower's work point at the tower, not at the plot centre", () => {
    const t = plan.sites[1]!; // api's first skyline tower, local (-2, -2)
    expect(t.x).toBe(-22);
    expect(t.z).toBe(-16);
    expect(t.doorX).toBe(-22);
    expect(t.doorZ).toBeCloseTo(-16 + 2.6 / 2 + 0.7, 10);
  });

  it("keeps every work point clear of the footprint it builds", () => {
    const footprints = [
      { x: -20, z: -14, d: 10 }, // api plot
      { x: -22, z: -16, d: 2.6 }, // t1
      { x: -17.5, z: -13, d: 2 }, // t2
      { x: 18, z: 16, d: 6 }, // web plot
      { x: 0, z: 0, d: 3 },
      { x: -6.4, z: 2, d: 2.6 },
      { x: 6.4, z: -2, d: 3.2 },
    ];
    expect(plan.sites).toHaveLength(footprints.length);
    plan.sites.forEach((s, i) => {
      const p = footprints[i]!;
      expect(Math.hypot(s.doorX - p.x, s.doorZ - p.z)).toBeGreaterThanOrEqual(p.d / 2 + 0.5);
    });
  });

  it("hands the builder the height the block lands at", () => {
    expect(plan.sites[1]!.h).toBe(9); // t1
    expect(plan.sites[4]!.h).toBe(8); // f1
    // a district plot opens as a pad, not a tower
    expect(plan.sites[0]!.h).toBeLessThan(1);
  });

  it("carries the unit's own footprint — that is what the crane frames", () => {
    // A shot sized to the plot fills the frame for a three-file module and a
    // forty-file package alike; sized to nothing it can only guess.
    expect(plan.sites[0]!.span).toBe(10); // the api plot, 10×10
    expect(plan.sites[1]!.span).toBe(2.6); // t1's own footprint
    expect(plan.sites[4]!.span).toBe(3); // f1 on the plaza
  });

  it("colours the carried block with the language the unit is made of", () => {
    expect(plan.sites[5]!.color).toBe(languageColor("Python"));
    expect(plan.sites[6]!.color).toBe(languageColor("Rust"));
    // a district is built from its own dominant language
    expect(plan.sites[0]!.color).toBe(languageColor("TypeScript"));
  });

  it("is deterministic — same layout, same schedule", () => {
    expect(planConstruction(LAYOUT, 1000)).toEqual(plan);
  });
});
