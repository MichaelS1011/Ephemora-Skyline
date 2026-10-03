import { describe, expect, it } from "vitest";
import { computeVoronoi, polygonMinRadius, seedSites, type VoronoiSite } from "../src/city/voronoi";

/**
 * Geometry contracts for the district Voronoi (task #28):
 *
 * 1. seedSites must spread seeds over the full disc — each site's radius is
 *    the centre of its own equal-area weight band (sqrt of the cumulative
 *    share), NOT (consumed + 0.5) / n, which collapsed every seed into the
 *    inner sqrt(0.5/n) zone and left the rim unsown (sliver outer cells).
 * 2. polygonMinRadius is the true incircle proxy: perpendicular distance to
 *    the nearest edge segment, not the centroid→vertex distance, which
 *    overestimates the safe plot radius by up to 1/cos(30°) and more for
 *    slivers (measured 1.32–1.97x on the standard city).
 * Everything stays hash-deterministic — no randomness.
 */

function uniformSites(n: number, weight = 1): VoronoiSite[] {
  return Array.from({ length: n }, (_, i) => ({ key: `site-${i}`, weight }));
}

function radiusOf(p: { x: number; z: number }): number {
  return Math.hypot(p.x, p.z);
}

describe("seedSites — equal-area band centres", () => {
  it("spreads 20 sites out to the rim: outermost seed >= 0.8 * halfExtent", () => {
    const halfExtent = 100;
    const seeds = seedSites(uniformSites(20), halfExtent);
    const radii = seeds.map(radiusOf);
    // Buggy formula maxed out at sqrt((0.95+0.5)/20) ≈ 0.27 * halfExtent.
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(0.8 * halfExtent);
    expect(Math.min(...radii)).toBeLessThan(0.3 * halfExtent);
  });

  it("never lets sqrt(frac) * halfExtent exceed the rim (jitter ceiling 1.1x)", () => {
    const halfExtent = 50;
    const cases: VoronoiSite[][] = [
      uniformSites(1),
      uniformSites(2),
      uniformSites(20),
      [
        { key: "heavy", weight: 1e6 },
        { key: "light", weight: 1 },
      ],
      [
        { key: "a", weight: 900 },
        { key: "b", weight: 7 },
        { key: "c", weight: 2 },
        { key: "d", weight: 1 },
      ],
    ];
    for (const sites of cases) {
      for (const p of seedSites(sites, halfExtent)) {
        expect(radiusOf(p)).toBeLessThanOrEqual(1.1 * halfExtent);
      }
    }
  });

  it("1 site: seed sits at the half-area radius sqrt(0.5), not at the centre", () => {
    const [p] = seedSites(uniformSites(1), 100);
    expect(p).toBeDefined();
    const r = radiusOf(p!);
    // base = sqrt(0.5)*100 = 70.71, jitter multiplies by [0.75, 1.10]
    expect(r).toBeGreaterThanOrEqual(0.75 * Math.SQRT1_2 * 100 - 1e-9);
    expect(r).toBeLessThanOrEqual(1.1 * Math.SQRT1_2 * 100 + 1e-9);
  });

  it("2 sites: the lighter one claims the outer band (measured values pinned)", () => {
    const seeds = seedSites(
      [
        { key: "a", weight: 5 },
        { key: "b", weight: 3 },
      ],
      100,
    );
    const [ra, rb] = seeds.map(radiusOf);
    // fracs 0.3125 and 0.6875 -> bases 55.9 and 82.9, jitter applied on top.
    // Same keys/hashes => deterministic; previously both were <= 0.63*HE.
    expect(rb!).toBeGreaterThan(ra!);
    expect(rb!).toBeGreaterThanOrEqual(0.8 * 100);
  });

  it("extreme skew: the tiny site still reaches the outer ring", () => {
    const seeds = seedSites(
      [
        { key: "heavy", weight: 1e6 },
        { key: "light", weight: 1 },
      ],
      100,
    );
    const radii = seeds.map(radiusOf);
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(0.75 * 100);
  });

  it("is deterministic: same input twice -> identical output", () => {
    const sites = uniformSites(12, 7);
    expect(seedSites(sites, 64)).toEqual(seedSites(sites, 64));
  });
});

describe("polygonMinRadius — true incircle (segment distance)", () => {
  it("regular hexagon: incircle = 0.866 * circumcircle, not the vertex distance", () => {
    const R = 10;
    const hex = Array.from({ length: 6 }, (_, i) => ({
      x: R * Math.cos((i * Math.PI) / 3),
      z: R * Math.sin((i * Math.PI) / 3),
    }));
    const r = polygonMinRadius(hex, { x: 0, z: 0 });
    expect(r).toBeCloseTo(R * Math.cos(Math.PI / 6), 10); // 8.660254...
    expect(r).toBeLessThan(R); // centroid->vertex would report 10
  });

  it("uses the perpendicular foot when it lies on the edge", () => {
    const square = [
      { x: -5, z: -5 },
      { x: 5, z: -5 },
      { x: 5, z: 5 },
      { x: -5, z: 5 },
    ];
    expect(polygonMinRadius(square, { x: 3, z: 0 })).toBeCloseTo(2, 10);
    expect(polygonMinRadius(square, { x: 0, z: 0 })).toBeCloseTo(5, 10);
  });

  it("clamps the foot to the segment when the projection falls outside", () => {
    // Right triangle; the closest feature for the test point is a vertex,
    // and the unclamped line distance would be smaller than the truth.
    const tri = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 0, z: 1 },
    ];
    const c = { x: -4, z: 3 };
    // The foot on the bottom edge (z=0) would sit at (-4,0) — outside the
    // segment — so the clamped minimum is the distance to vertex (0,1) = sqrt(20).
    // An unclamped line distance would wrongly report 3.
    expect(polygonMinRadius(tri, c)).toBeCloseTo(Math.sqrt(20), 10);
  });

  it("empty polygon reports 0", () => {
    expect(polygonMinRadius([], { x: 0, z: 0 })).toBe(0);
  });

  it("a plot sized from the radius (1.35x, as layout.ts does) stays inside every cell", () => {
    const halfExtent = 80;
    const cells = computeVoronoi(uniformSites(20), halfExtent, 4);
    expect(cells.length).toBe(20);
    for (const cell of cells) {
      const r = polygonMinRadius(cell.polygon, cell.centroid);
      const half = (r * 1.35) / 2; // square plot side w = r * 1.35
      const c = cell.centroid;
      const corners = [
        { x: c.x - half, z: c.z - half },
        { x: c.x + half, z: c.z - half },
        { x: c.x + half, z: c.z + half },
        { x: c.x - half, z: c.z + half },
      ];
      for (const pt of corners) {
        expect(pointInConvex(pt, cell.polygon)).toBe(true);
      }
      // The segment radius is never larger than the old vertex radius:
      const vertexMin = Math.min(...cell.polygon.map((v) => Math.hypot(v.x - c.x, v.z - c.z)));
      expect(r).toBeLessThanOrEqual(vertexMin + 1e-9);
    }
  });
});

/** Convex point test with orientation normalised via the signed area. */
function pointInConvex(
  p: { x: number; z: number },
  poly: Array<{ x: number; z: number }>,
): boolean {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  const sign = area >= 0 ? 1 : -1;
  const eps = 1e-6;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (sign * cross < -eps) return false;
  }
  return true;
}

describe("computeVoronoi — contract after the seed fix", () => {
  it("1 site returns the full square", () => {
    const [cell] = computeVoronoi([{ key: "only", weight: 10 }], 40, 4);
    expect(cell!.polygon).toHaveLength(4);
    expect(cell!.centroid).toEqual({ x: 0, z: 0 });
  });

  it("empty site list stays empty", () => {
    expect(computeVoronoi([], 40, 4)).toEqual([]);
  });

  it("deterministic: same weights + keys twice -> identical diagram", () => {
    const sites = [
      { key: "__plaza__", weight: 5000 },
      { key: "a/b", weight: 900 },
      { key: "a/c", weight: 480 },
      { key: "a/d", weight: 12 },
    ];
    expect(computeVoronoi(sites, 60, 4)).toEqual(computeVoronoi(sites, 60, 4));
  });

  it("seed positions come only from hashes, never from randomness", () => {
    const a = seedSites(uniformSites(8), 30);
    const b = seedSites(uniformSites(8), 30);
    expect(a).toEqual(b);
  });
});
