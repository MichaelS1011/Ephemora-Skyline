import { describe, expect, it } from "vitest";
import {
  buildSidewalkNetwork,
  graphPath,
  nearestNode,
  plazaLanes,
  CURB_OFFSET,
} from "../src/city/sidewalks";
import type { StreetLine } from "../src/city/layout";

/** A plus-shaped street grid: two crossing streets. */
const CROSS_STREETS: StreetLine[] = [
  { x1: -20, z1: 0, x2: 20, z2: 0 },
  { x1: 0, z1: -20, x2: 0, z2: 20 },
];

describe("plazaLanes", () => {
  it("creates lanes between adjacent columns and rows of the plaza grid", () => {
    const buildings = [
      { x: -6.4, z: -6.4, w: 3, d: 3 },
      { x: 0, z: -6.4, w: 3, d: 3 },
      { x: -6.4, z: 0, w: 3, d: 3 },
      { x: 0, z: 0, w: 3, d: 3 },
    ];
    const lanes = plazaLanes(buildings);
    const vertical = lanes.filter((l) => Math.abs(l.x1 - l.x2) < 0.01);
    const horizontal = lanes.filter((l) => Math.abs(l.z1 - l.z2) < 0.01);
    expect(vertical).toHaveLength(1);
    expect(horizontal).toHaveLength(1);
    // the vertical lane runs between the two columns
    expect(vertical[0]!.x1).toBeCloseTo(-3.2, 5);
    // and spans beyond the building rows
    expect(vertical[0]!.z1).toBeLessThan(-6.4);
    expect(vertical[0]!.z2).toBeGreaterThan(0);
  });

  it("returns nothing for a single building", () => {
    expect(plazaLanes([{ x: 0, z: 0, w: 3, d: 3 }])).toHaveLength(0);
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
