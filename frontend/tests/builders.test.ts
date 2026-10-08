import { describe, expect, it } from "vitest";
import { builtExtent, craneShot, OVERVIEW_FACTOR, planConstruction } from "../src/city/layout";
import type { BlockPlacement, BuildSite, BuildingPlacement, DirLayout } from "../src/city/layout";
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
 *
 * Distance from the plaza decides the BUILD ORDER, so the ranks are not the
 * array order: f1 (0) < f2 = f3 (6.7) < podium (17.0) < web (24.08) < api
 * (24.41) — api is listed first and built fifth on purpose.
 */
const LAYOUT: DirLayout = {
  centre: { x: 0, z: 0 },
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
  plazaCenter: { x: 0, z: 0 },
};

const plan = planConstruction(LAYOUT, 1000);

/** slot `k` of the schedule, in build order */
const at = (k: number): number => 1000 + k * plan.step;

/**
 * A work point by what it is and where it stands — never by its index. The
 * schedule is ordered by geometry, so a test that hardcoded the result of the
 * sort would break whenever a layout moved without anything being wrong.
 */
function siteAt(kind: BuildSite["kind"], x: number, z: number): BuildSite {
  const found = plan.sites.find((s) => s.kind === kind && s.x === x && s.z === z);
  if (!found) throw new Error(`no ${kind} work point at (${x}, ${z})`);
  return found;
}

/** Everything the builders stand on, with the footprint they must clear */
const STANDS: Array<{ kind: BuildSite["kind"]; x: number; z: number; d: number }> = [
  { kind: "district", x: -20, z: -14, d: 10 }, // api plot
  { kind: "tower", x: -22, z: -16, d: 2.6 }, // t1
  { kind: "tower", x: -17.5, z: -13, d: 2 }, // t2
  { kind: "district", x: 18, z: 16, d: 6 }, // web plot
  { kind: "building", x: 0, z: 0, d: 3 },
  { kind: "building", x: -6.4, z: 2, d: 2.6 },
  { kind: "building", x: 6.4, z: -2, d: 3.2 },
];

describe("planConstruction sites", () => {
  it("counts every rising unit but staffs only the ones that stand somewhere", () => {
    // 2 plots + 2 towers + 3 plaza buildings + 1 podium
    expect(plan.total).toBe(8);
    expect(plan.sites).toHaveLength(7);
    expect(plan.sites.some((s) => s.kind === "district" && s.x === 12)).toBe(false);
  });

  it("emits work points in rise order, one per unit", () => {
    const offsets = plan.sites.map((s) => s.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    // the schedule and the work points are written by the same walk
    expect(siteAt("building", 0, 0).offset).toBeCloseTo(plan.plazaAt[0]! - 1000, 6);
    expect(siteAt("district", 18, 16).offset).toBeCloseTo(plan.blockAt[1]! - 1000, 6);
    expect(siteAt("district", -20, -14).offset).toBeCloseTo(plan.blockAt[0]! - 1000, 6);
    expect(siteAt("tower", -22, -16).offset).toBeCloseTo(plan.skylineAt[0]![0]! - 1000, 6);
  });

  it("puts a district tower's work point at the tower, not at the plot centre", () => {
    const t = siteAt("tower", -22, -16); // api's first skyline tower, local (-2, -2)
    expect(t.doorX).toBe(-22);
    expect(t.doorZ).toBeCloseTo(-16 + 2.6 / 2 + 0.7, 10);
  });

  it("keeps every work point clear of the footprint it builds", () => {
    expect(plan.sites).toHaveLength(STANDS.length);
    for (const p of STANDS) {
      const s = siteAt(p.kind, p.x, p.z);
      expect(Math.hypot(s.doorX - p.x, s.doorZ - p.z)).toBeGreaterThanOrEqual(p.d / 2 + 0.5);
    }
  });

  it("hands the builder the height the block lands at", () => {
    expect(siteAt("tower", -22, -16).h).toBe(9); // t1
    expect(siteAt("building", 0, 0).h).toBe(8); // f1
    // a district plot opens as a pad, not a tower
    expect(siteAt("district", -20, -14).h).toBeLessThan(1);
  });

  it("carries the unit's own footprint — that is what the crane frames", () => {
    // A shot sized to the plot fills the frame for a three-file module and a
    // forty-file package alike; sized to nothing it can only guess.
    expect(siteAt("district", -20, -14).span).toBe(10); // the api plot, 10×10
    expect(siteAt("tower", -22, -16).span).toBe(2.6); // t1's own footprint
    expect(siteAt("building", 0, 0).span).toBe(3); // f1 on the plaza
  });

  it("colours the carried block with the language the unit is made of", () => {
    expect(siteAt("building", -6.4, 2).color).toBe(languageColor("Python"));
    expect(siteAt("building", 6.4, -2).color).toBe(languageColor("Rust"));
    // a district is built from its own dominant language
    expect(siteAt("district", -20, -14).color).toBe(languageColor("TypeScript"));
  });

  it("is deterministic — same layout, same schedule", () => {
    expect(planConstruction(LAYOUT, 1000)).toEqual(plan);
  });
});

describe("planConstruction builds from the centre out", () => {
  it("ranks the units by distance from the plaza, not by array order", () => {
    expect(plan.sites.map((s) => [s.kind, s.x])).toEqual([
      ["building", 0], // the level's own files are the centre
      ["building", -6.4],
      ["building", 6.4],
      ["district", 18], // web (r 24.08) before api (r 24.41), listed second
      ["district", -20],
      ["tower", -22], // and api's skyline rises on its own plot
      ["tower", -17.5],
    ]);
  });

  it("gives every rising unit exactly one slot, none skipped, none shared", () => {
    const ranks = [...plan.blockAt, ...plan.skylineAt.flat(), ...plan.plazaAt, plan.podiumAt]
      .map((t) => Math.round((t - 1000) / plan.step))
      .sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: plan.total }, (_, i) => i));
  });

  it("keeps a plot and its own skyline in one unbroken run", () => {
    // api is the OUTER district here, so it closes the schedule: pad, towers
    expect(plan.blockAt[0]).toBe(at(5));
    expect(plan.skylineAt[0]).toEqual([at(6), at(7)]);
    expect(plan.skylineAt[1]).toEqual([]); // web has no skyline to raise
  });

  it("lands the podium at its own distance instead of trailing the rim", () => {
    // (12,12) is r 17.0: outside the plaza, inside every district — so it used
    // to land after the whole city, far from anything the eye was on
    expect(plan.podiumAt).toBe(at(3));
    expect(plan.podiumAt).toBeLessThan(Math.min(...plan.blockAt));
  });

  it("stays index-aligned with the layout it scheduled", () => {
    // blockAt/skylineAt/plazaAt are re-ordered in TIME, never in INDEX — the
    // renderer addresses them by placement, so a shift would mislabel plots
    expect(plan.blockAt).toHaveLength(LAYOUT.blocks.length);
    expect(plan.plazaAt).toHaveLength(LAYOUT.buildings.length);
    expect(plan.skylineAt.map((s) => s.length)).toEqual(LAYOUT.blocks.map((b) => b.skyline.length));
  });
});

describe("builtExtent and craneShot", () => {
  const marks = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((f) =>
    builtExtent(plan.sites, f * plan.durationMs),
  );
  const start = marks[0]!;
  const end = marks[marks.length - 1]!;

  it("starts on the plaza instead of on the rim", () => {
    // before the change, the first unit was a district 60.8 of 71.5 out and
    // 87 % of the final extent stood at t = 0 — nothing left to grow into
    expect(start.radius).toBeCloseTo(1.5, 6); // f1's centre plus half its width
    expect(start.top).toBe(8);
    expect(start.radius / end.radius).toBeLessThan(0.1);
    expect(end.radius).toBeCloseTo(29.41, 1); // api's plot edge, the outermost
    expect(end.top).toBe(9); // t1, the tallest crown
  });

  it("only ever grows — the crane never has to pull back in", () => {
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i]!.radius).toBeGreaterThanOrEqual(marks[i - 1]!.radius);
      expect(marks[i]!.top).toBeGreaterThanOrEqual(marks[i - 1]!.top);
    }
    const dists = marks.map((m) => craneShot(m.radius, m.top).dist);
    dists.forEach((d, i) => {
      if (i > 0) expect(d).toBeGreaterThanOrEqual(dists[i - 1]!);
    });
    expect(dists[0]).toBe(26); // the street shot: the centre fills the frame
    expect(dists[dists.length - 1]).toBeCloseTo(29.41 * OVERVIEW_FACTOR, 1);
  });

  it("counts nothing that has not started rising yet", () => {
    expect(builtExtent(plan.sites, -1)).toEqual({ radius: 0, top: 0 });
    expect(builtExtent([], 10_000)).toEqual({ radius: 0, top: 0 });
  });

  it("sizes the frame to width and crown, with a legibility floor", () => {
    expect(craneShot(0, 0)).toEqual({ dist: 26, targetY: 1.5, x: 0, z: 0 });
    expect(craneShot(40, 0).dist).toBeCloseTo(40 * OVERVIEW_FACTOR, 6);
    expect(craneShot(1, 20).dist).toBe(31); // 20 × 1.55 outranks everything else
    expect(craneShot(10, 20).targetY).toBe(7); // eye line follows the tallest
    expect(craneShot(10, 0.3).targetY).toBe(1.5); // never aim under the street
  });

  it("measures the built radius from the level's own centre", () => {
    // An organic plaza can sit 92 m off the world origin; a crane that still
    // measured from (0,0) would frame ground the level does not stand on.
    const sites = plan.sites.map((sb) => ({ ...sb, x: sb.x + 100 }));
    const off = builtExtent(sites, plan.durationMs, { x: 100, z: 0 });
    const on = builtExtent(plan.sites, plan.durationMs);
    expect(off.radius).toBeCloseTo(on.radius, 6);
    expect(builtExtent(sites, plan.durationMs).radius).toBeGreaterThan(on.radius * 3);
    expect(craneShot(10, 4, { x: 100, z: -20 })).toMatchObject({ x: 100, z: -20 });
  });

  it("ends where the built-city reveal begins", () => {
    // the handover has to be continuous: same factor, and the reveal only
    // adds the street margin bounds carries on top of the extent.
    // 1.6, not 1.75: the far-zoom heat grid takes the level over beyond
    // 1.8 × bounds, and a shot that lands past it frames flat tiles instead
    // of the city it just built. See tests/lodFraming.test.ts.
    expect(OVERVIEW_FACTOR).toBe(1.6);
    expect(craneShot(end.radius, end.top).dist).toBeGreaterThan(
      craneShot(start.radius, start.top).dist,
    );
  });
});
