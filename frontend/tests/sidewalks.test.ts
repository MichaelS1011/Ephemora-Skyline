import { describe, expect, it } from "vitest";
import {
  buildSidewalkNetwork,
  graphPath,
  nearestNode,
  plazaLanes,
  CURB_OFFSET,
} from "../src/city/sidewalks";
import type { StreetLine } from "../src/city/layout";
import { crossesStreetOffCrosswalk } from "../src/city/openWorldStreets";

/** A plus-shaped street grid: two crossing streets. */
const CROSS_STREETS: StreetLine[] = [
  { x1: -20, z1: 0, x2: 20, z2: 0 },
  { x1: 0, z1: -20, x2: 0, z2: 20 },
];

/** A four-lot plaza ringed by roads, so every lane has a street to reach. */
function plazaStreets(half = 30): StreetLine[] {
  return [
    { x1: -half, z1: -half, x2: half, z2: -half },
    { x1: half, z1: -half, x2: half, z2: half },
    { x1: half, z1: half, x2: -half, z2: half },
    { x1: -half, z1: half, x2: -half, z2: -half },
  ];
}

describe("plazaLanes", () => {
  /** Two columns 6.4 apart, 3 wide each: a corridor of 3.4 between the façades. */
  const tight = [
    { x: -6.4, z: -6.4, w: 3, d: 3 },
    { x: 0, z: -6.4, w: 3, d: 3 },
    { x: -6.4, z: 0, w: 3, d: 3 },
    { x: 0, z: 0, w: 3, d: 3 },
  ];

  it("gives a narrow corridor the one pavement that fits, on the façade", () => {
    const lanes = plazaLanes(tight, plazaStreets());
    const vertical = lanes.filter((l) => Math.abs(l.x1 - l.x2) < 0.01);
    expect(vertical).toHaveLength(1);
    // A corridor of 3.4 cannot pay for the two bands of a street (4.36), so the
    // lane is one-sided and its axis is the left building's face, not the middle
    // of the two columns.
    expect(vertical[0]!.oneSided).toBe(true);
    expect(vertical[0]!.x1).toBeCloseTo(-6.4 + 1.5, 5);
    // and it reaches the roads on both sides of the block
    expect(Math.min(vertical[0]!.z1, vertical[0]!.z2)).toBeLessThanOrEqual(-30 + 0.01);
    expect(Math.max(vertical[0]!.z1, vertical[0]!.z2)).toBeGreaterThanOrEqual(30 - 0.01);
    // written so the pavement is on the +normal side of the axis
    const dz = vertical[0]!.z2 - vertical[0]!.z1;
    expect(-dz).toBeGreaterThan(0);
  });

  it("gives a wide corridor both pavements, centred between the façades", () => {
    const wide = [
      { x: -8, z: -6.4, w: 3, d: 3 },
      { x: 4, z: -6.4, w: 3, d: 3 },
      { x: -8, z: 0, w: 3, d: 3 },
      { x: 4, z: 0, w: 3, d: 3 },
    ];
    const lanes = plazaLanes(wide, plazaStreets());
    const vertical = lanes.filter((l) => Math.abs(l.x1 - l.x2) < 0.01);
    expect(vertical).toHaveLength(1);
    expect(vertical[0]!.oneSided).toBeUndefined();
    // 8.0 between the faces, so the axis is the middle of the FACES at -2, not
    // the middle of the two column centres at -4.
    expect(vertical[0]!.x1).toBeCloseTo(-2, 5);
  });

  it("draws no lane through an alley, and none that reaches no street", () => {
    // A 2×2 block with 0.5 between every pair of facing façades: a kerb node in
    // any of those corridors stands in a wall, so there is no lane at all.
    const alley = [
      { x: -5, z: -5, w: 3, d: 3 },
      { x: -1.5, z: -5, w: 3, d: 3 },
      { x: -5, z: -1.5, w: 3, d: 3 },
      { x: -1.5, z: -1.5, w: 3, d: 3 },
    ];
    expect(plazaLanes(alley, plazaStreets())).toHaveLength(0);
    // the same block with nothing around it has no road to join
    expect(plazaLanes(tight, [])).toHaveLength(0);
    expect(plazaLanes([{ x: 0, z: 0, w: 3, d: 3 }], plazaStreets())).toHaveLength(0);
  });

  it("cuts the lane where a footprint reaches into its band", () => {
    // A lot pushed into the corridor from the row beyond: the lane cannot run
    // past it, so it stops at the wall — and the piece it keeps still reaches
    // a street.
    const blocked = [
      ...tight,
      { x: -4.2, z: 7, w: 3, d: 3 },
      { x: 6, z: -6.4, w: 3, d: 3 },
      { x: 6, z: 0, w: 3, d: 3 },
    ];
    const lanes = plazaLanes(blocked, plazaStreets());
    const vertical = lanes
      .filter((l) => Math.abs(l.x1 - l.x2) < 0.01 && Math.abs(l.x1 - -4.9) < 0.01)
      .sort((p, q) => p.z1 - q.z1);
    expect(vertical.length).toBeGreaterThan(0);
    for (const l of vertical) {
      const lo = Math.min(l.z1, l.z2);
      const hi = Math.max(l.z1, l.z2);
      // no fragment overlaps the intruding lot's frontage
      expect(hi <= 7 - 1.5 + 1e-6 || lo >= 7 + 1.5 - 1e-6).toBe(true);
    }
  });
});

describe("buildSidewalkNetwork", () => {
  const net = buildSidewalkNetwork(CROSS_STREETS);

  it("places nodes on the curb line of both street sides", () => {
    expect(net.nodes.length).toBeGreaterThan(8);
    const distToSeg = (p: { x: number; z: number }, s: StreetLine): number => {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.z - s.z1) * dz) / len2));
      return Math.hypot(p.x - (s.x1 + dx * t), p.z - (s.z1 + dz * t));
    };
    for (const n of net.nodes) {
      const dist = Math.min(...CROSS_STREETS.map((s) => distToSeg(n, s)));
      // every node hugs a curb — or stands on a crossing (intersection)
      expect(dist).toBeLessThanOrEqual(CURB_OFFSET + 0.05);
    }
    // most nodes sit exactly on the curb line
    const onCurb = net.nodes.filter((n) => {
      const dist = Math.min(...CROSS_STREETS.map((s) => distToSeg(n, s)));
      return Math.abs(dist - CURB_OFFSET) < 0.05;
    });
    expect(onCurb.length / net.nodes.length).toBeGreaterThan(0.8);
  });

  it("connects every node", () => {
    for (const n of net.nodes) expect(n.adj.length).toBeGreaterThan(0);
  });

  it("is fully traversable from any starting node", () => {
    const start = nearestNode(net, 0, CURB_OFFSET);
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of net.nodes[cur]!.adj) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    expect(seen.size).toBe(net.nodes.length);
  });

  it("adds crosswalks across the streets", () => {
    expect(net.crosswalks.length).toBeGreaterThan(0);
  });

  it("paints every crossing the graph takes, and takes every crossing it paints", () => {
    // The two halves of one claim, on streets AND a plaza lane: a zebra is paint
    // over a step the crowd can take, and a step over a carriageway has paint
    // under it. Without the first half the guard would be satisfied by stripes
    // nobody can walk to; without the second, by a crowd crossing where the
    // network never meant anybody to cross.
    const lane: StreetLine = { x1: 7, z1: -20, x2: 7, z2: 20 };
    const grid = buildSidewalkNetwork(CROSS_STREETS, [lane]);
    const lines = [...CROSS_STREETS, lane];
    const rules = { streets: lines, crosswalks: grid.crosswalks };
    const nodes = grid.nodes;
    let crossings = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (const j of nodes[i]!.adj) {
        if (j <= i) continue;
        const a = nodes[i]!;
        const b = nodes[j]!;
        const bad = crossesStreetOffCrosswalk(rules, a.x, a.z, b.x, b.z);
        expect(
          bad,
          `edge ${i}->${j} jaywalks at ${bad?.x.toFixed(1)},${bad?.z.toFixed(1)}`,
        ).toBeNull();
        crossings++;
      }
    }
    expect(crossings).toBeGreaterThan(4);
    // and every crosswalk is a step the graph can actually take
    for (const cw of grid.crosswalks) {
      const walked = nodes.some((a) =>
        a.adj.some((j) => {
          const b = nodes[j]!;
          return Math.hypot((a.x + b.x) / 2 - cw.x, (a.z + b.z) / 2 - cw.z) <= 0.35;
        }),
      );
      expect(walked, `crosswalk at ${cw.x.toFixed(1)},${cw.z.toFixed(1)} paints nothing`).toBe(
        true,
      );
    }
  });
});

describe("graphPath", () => {
  const net = buildSidewalkNetwork(CROSS_STREETS);

  it("finds a connected hop chain between two far nodes", () => {
    const from = nearestNode(net, -CURB_OFFSET, 0 + CURB_OFFSET);
    const to = nearestNode(net, 18, CURB_OFFSET);
    const path = graphPath(net, from, to);
    expect(path.length).toBeGreaterThan(0);
    let prev = from;
    for (const idx of path) {
      expect(net.nodes[prev]!.adj).toContain(idx);
      prev = idx;
    }
    expect(prev).toBe(to);
  });

  it("returns an empty path when start equals goal", () => {
    const idx = nearestNode(net, 0, CURB_OFFSET);
    expect(graphPath(net, idx, idx)).toHaveLength(0);
  });
});
