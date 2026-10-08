import { describe, it, expect } from "vitest";
import { buildSidewalkNetwork, plazaLanes } from "../src/city/sidewalks";
import { distanceToSegment } from "../src/city/openWorldStreets";
import { getDirLayout, type StreetLine } from "../src/city/layout";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * `RoadSystem` draws its kerb stones from the walking graph, not from the street
 * list — which is what makes a plaza lane visible at all, and what stops a curb
 * at the mouth of a junction. These two claims are measured here, on a real
 * layout: a painted curb that runs under a carriageway is a stone in the road,
 * and a kerb node with no painted curb under it is a figure standing on nothing.
 */

const HALF_ASPHALT = 1.9;

function file(path: string, lines: number): CityFile {
  return {
    id: path,
    name: path.split("/").pop()!,
    path,
    language: "TypeScript",
    linesOfCode: lines,
    cyclomaticComplexity: 6,
    threatLevel: "safe",
    findings: [],
  };
}

function dir(name: string, files: CityFile[]): CityDir {
  return {
    name,
    path: name,
    fileCount: files.length,
    linesOfCode: files.reduce((s, f) => s + f.linesOfCode, 0),
    languages: { TypeScript: 1 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 1,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
}

const dirs = ["src", "server", "docs"].map((d) =>
  dir(
    d,
    Array.from({ length: 9 }, (_, i) => file(`${d}/m${i}.ts`, 140 + i * 45)),
  ),
);
const all = dirs.flatMap((d) => d.detailFiles);
const city = {
  repo: { owner: "acme", name: "app", branch: "main" },
  totalFiles: all.length,
  renderedFiles: all.length,
  totalLines: all.reduce((s, f) => s + f.linesOfCode, 0),
  findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  languages: { TypeScript: 1 },
  tree: { ...dir("", all), children: dirs, detailFiles: [], districtFiles: all },
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
} as unknown as CityData;

const levels = ([[], ["src"]] as string[][]).map((focus) => {
  const layout = getDirLayout(city, focus);
  const lanes = plazaLanes(layout.buildings, layout.streets);
  return {
    name: focus.join("/") || "overview",
    layout,
    lanes,
    net: buildSidewalkNetwork(layout.streets, lanes),
  };
});

const CROSS: StreetLine[] = [
  { x1: -20, z1: 0, x2: 20, z2: 0 },
  { x1: 0, z1: -20, x2: 0, z2: 20 },
];

describe("the painted kerb and the walked kerb", () => {
  it("has kerb stretches to draw on a level with plaza lanes", () => {
    const district = levels.find((l) => l.name === "src")!;
    expect(district.lanes.length).toBeGreaterThan(0);
    expect(district.net.kerbs.length).toBeGreaterThan(district.layout.streets.length * 2);
  });

  for (const level of [
    ...levels,
    { name: "a plus", layout: null, lanes: [], net: buildSidewalkNetwork(CROSS) },
  ]) {
    it(`stands every kerb node of ${level.name} on a painted kerb`, () => {
      for (const n of level.net.nodes) {
        const onStone = level.net.kerbs.some((k) => distanceToSegment(n.x, n.z, k) < 0.02);
        expect(onStone, `node ${n.x.toFixed(1)},${n.z.toFixed(1)} has no curb`).toBe(true);
      }
    });

    it(`keeps every painted kerb of ${level.name} out of a carriageway`, () => {
      const streets = level.layout ? [...level.layout.streets, ...level.lanes] : CROSS;
      for (const k of level.net.kerbs) {
        const mid = { x: (k.x1 + k.x2) / 2, z: (k.z1 + k.z2) / 2 };
        for (const s of streets) {
          // the stone belongs to one of the lines it frames; every other line it
          // may only pass beside, never under
          if (distanceToSegment(k.x1, k.z1, s) < 0.02 && distanceToSegment(k.x2, k.z2, s) < 0.02)
            continue;
          expect(
            distanceToSegment(mid.x, mid.z, s),
            `kerb ${k.x1.toFixed(1)},${k.z1.toFixed(1)} lies on the road at ${mid.x.toFixed(1)},${mid.z.toFixed(1)}`,
          ).toBeGreaterThan(HALF_ASPHALT);
        }
      }
    });
  }
});
