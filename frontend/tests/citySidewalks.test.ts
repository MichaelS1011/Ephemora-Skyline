import { describe, it, expect } from "vitest";
import { buildSidewalkNetwork, plazaLanes, graphPath, CURB_OFFSET } from "../src/city/sidewalks";
import {
  crossesStreetOffCrosswalk,
  distanceToSegment,
  distanceToSidewalk,
} from "../src/city/openWorldStreets";
import { getDirLayout } from "../src/city/layout";
import type { CityData, CityFile, CityDir } from "../src/city/types";

/**
 * The built city walks the same kerb rules as the empty world, because both
 * hand their streets to the same network builder. F1 proved the empty world:
 * its grid is a plus of straight lines, and the mouth cut that keeps a kerb node
 * out of a carriageway was measured there. This is the other half of that
 * promise — a real scan, real blocks, plaza lanes between the buildings — stated
 * as the one rule the crowd lives by: an Ephe changes sides of a street only at
 * a zebra or at a junction mouth, and never through a building.
 */

function file(path: string, complexity: number, lines: number): CityFile {
  return {
    id: path,
    name: path.split("/").pop()!,
    path,
    language: path.endsWith(".md") ? "Markdown" : "TypeScript",
    linesOfCode: lines,
    cyclomaticComplexity: complexity,
    threatLevel: complexity > 20 ? "high" : "safe",
    findings: complexity > 20 ? [{ type: "X", severity: "P1", line: 3, message: "m" }] : [],
  };
}

function dir(name: string, path: string, files: CityFile[]): CityDir {
  return {
    name,
    path,
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

/** A scanned repository: several districts, each with enough files to be blocks. */
function scannedCity(): CityData {
  const dirs = ["src", "server", "frontend", "infra", "tests", "docs"].map((d, di) =>
    dir(
      d,
      d,
      Array.from({ length: 9 }, (_, i) => file(`${d}/m${i}.ts`, 4 + ((di + i) % 30), 120 + i * 40)),
    ),
  );
  const all = dirs.flatMap((d) => d.detailFiles);
  return {
    repo: { owner: "acme", name: "app", branch: "main" },
    totalFiles: all.length,
    renderedFiles: all.length,
    totalLines: all.reduce((s, f) => s + f.linesOfCode, 0),
    findingsBySeverity: { P0: 0, P1: 4, P2: 0 },
    languages: { TypeScript: 1 },
    tree: {
      ...dir("", "", all),
      children: dirs,
      detailFiles: [],
      districtFiles: all,
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
  } as CityData;
}

const city = scannedCity();
/**
 * Two levels, because they are two different cities to the walker: the overview,
 * where a district stands as one block, and a focused district, where the files
 * are the buildings and the plaza lanes between them are the streets a figure
 * has to cross. The open question from F1 was about those plaza lanes — they cut
 * across the street grid and are not painted with zebras by RoadSystem — so a
 * proof that only ran on the overview would prove nothing.
 */
const levels = [
  { name: "the overview", focus: [] as string[] },
  { name: "a district", focus: ["src"] },
];

const built = levels.map(({ name, focus }) => {
  const layout = getDirLayout(city, focus);
  const lanes = plazaLanes(layout.buildings);
  const network = buildSidewalkNetwork(layout.streets, lanes)!;
  // The walking surface is the streets AND the plaza lanes: a node on a lane's
  // kerb is as much on a kerb as one on a street's.
  const lines = [...layout.streets, ...lanes];
  return {
    name,
    layout,
    lanes,
    lines,
    network,
    rules: { streets: lines, crosswalks: network.crosswalks },
  };
});

describe("the built city's street network", () => {
  it("has streets, plaza lanes and a kerb graph worth testing", () => {
    const district = built.find((b) => b.name === "a district")!;
    const overview = built.find((b) => b.name === "the overview")!;
    expect(district.layout.streets.length).toBeGreaterThanOrEqual(2);
    expect(district.layout.buildings.length).toBeGreaterThan(3);
    expect(
      district.lanes.length,
      "no plaza lanes were derived, so the case is untested",
    ).toBeGreaterThan(0);
    expect(district.network.nodes.length).toBeGreaterThan(40);
    expect(overview.layout.streets.length).toBeGreaterThan(10);
    expect(overview.network.nodes.length).toBeGreaterThan(20);
  });
});

/** How many kerb nodes the crowd can walk to from the first one. */
function reachableFromFirst(level: (typeof built)[number]): number {
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    for (const nb of level.network.nodes[queue.shift()!]!.adj) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      queue.push(nb);
    }
  }
  return seen.size;
}

/** Kerb nodes standing inside a building footprint. */
function nodesInBuildings(level: (typeof built)[number]): string[] {
  const bad: string[] = [];
  for (const n of level.network.nodes) {
    for (const b of level.layout.buildings) {
      if (
        n.x > b.x - b.w / 2 &&
        n.x < b.x + b.w / 2 &&
        n.z > b.z - b.d / 2 &&
        n.z < b.z + b.d / 2
      ) {
        bad.push(`${n.x.toFixed(1)},${n.z.toFixed(1)}`);
        break;
      }
    }
  }
  return bad;
}

/** Graph edges that cross a carriageway mid-block with no zebra under them. */
function unpaintedCrossings(level: (typeof built)[number]): string[] {
  const onZebra = (x: number, z: number): boolean =>
    level.network.crosswalks.some((cw) => Math.hypot(cw.x - x, cw.z - z) < 2.6);
  const bad: string[] = [];
  for (let u = 0; u < level.network.nodes.length; u++) {
    const a = level.network.nodes[u]!;
    for (const v of a.adj) {
      if (v <= u) continue;
      const b = level.network.nodes[v]!;
      for (const s of level.lines) {
        const d1 = distanceToSegment(a.x, a.z, s);
        const d2 = distanceToSegment(b.x, b.z, s);
        if (d1 > CURB_OFFSET + 1.2 || d2 > CURB_OFFSET + 1.2) continue;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (distanceToSegment(mid.x, mid.z, s) > 1.2) continue;
        if (!onZebra(mid.x, mid.z)) bad.push(`${mid.x.toFixed(1)},${mid.z.toFixed(1)}`);
      }
    }
  }
  return bad;
}

for (const level of built) {
  describe(`the built city's sidewalk edges — ${level.name}`, () => {
    it("stands on a kerb, never in a carriageway", () => {
      for (const n of level.network.nodes) {
        expect(distanceToSidewalk({ streets: level.lines }, n.x, n.z)).toBeLessThan(0.02);
      }
    });

    it("never crosses a street outside a zebra or a junction mouth", () => {
      // The exact predicate the live crowd is measured with — so what passes here
      // is the rule the browser tape checks against actual positions.
      const bad: string[] = [];
      for (let u = 0; u < level.network.nodes.length; u++) {
        const a = level.network.nodes[u]!;
        for (const v of a.adj) {
          if (v <= u) continue;
          const b = level.network.nodes[v]!;
          const hit = crossesStreetOffCrosswalk(level.rules, a.x, a.z, b.x, b.z);
          if (hit && bad.length < 6) {
            bad.push(
              `(${a.x.toFixed(1)}, ${a.z.toFixed(1)}) → (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) at ${hit.x.toFixed(1)}, ${hit.z.toFixed(1)}`,
            );
          }
        }
      }
      expect(bad, "sidewalk edges crossing the road").toEqual([]);
    });
  });
}

describe("the built city's kerb graph — the overview", () => {
  it("is one piece: every kerb node reachable from the first", () => {
    const overview = built.find((b) => b.name === "the overview")!;
    expect(reachableFromFirst(overview)).toBe(overview.network.nodes.length);
    const path = graphPath(overview.network, 0, overview.network.nodes.length - 1);
    expect(path.length).toBeGreaterThan(2);
  });
});

// ── the known defects, registered so they fail loud when they are fixed ────

/**
 * A focused district is not a street grid: it has two through roads at its
 * bounding box and every walking line inside the block is a plaza lane derived
 * from the gaps between buildings. Three things are wrong with those lanes, and
 * all three measured IDENTICAL at HEAD (92/160 reachable, the same node at
 * −5.6,−5.5 inside a building, 31 unpainted crossings before the kerb mouth cut
 * and 27 after it) — so this is not damage from the open world's work, it is the
 * district pedestrian network waiting for its own lane.
 *
 * The diagnosis, for whoever picks it up: `plazaLanes` puts a lane at the
 * midpoint of two building COLUMNS, not of their faces, and the kerb band is
 * 2 × CURB_OFFSET = 4.36 units wide while the measured face-to-face gap in this
 * block is 2.0; and the lanes stop at the building extent ±6, which is 25 units
 * from the district's roads, so nothing within LINK_RADIUS ever joins them to
 * the street kerbs. A lane is only a lane if people can walk beside it without
 * standing in a wall, and it has to reach a street.
 *
 * `it.fails` is the register: these go red the moment somebody fixes them.
 */
const district = built.find((b) => b.name === "a district")!;

describe("a focused district's plaza lanes — known defects", () => {
  it.fails("joins its plaza lanes to the street kerbs", () => {
    expect(reachableFromFirst(district)).toBe(district.network.nodes.length);
  });

  it.fails("keeps its kerb nodes out of the buildings they walk past", () => {
    expect(nodesInBuildings(district)).toEqual([]);
  });

  it.fails("paints a zebra under every crossing it uses", () => {
    expect(unpaintedCrossings(district)).toEqual([]);
  });
});
