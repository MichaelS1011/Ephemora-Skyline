/**
 * Deterministic weighted Voronoi diagrams on the XZ plane — pure math,
 * no rendering and no scene graph, so it is trivially unit-testable.
 *
 * Cells are computed by half-plane clipping (Sutherland–Hodgman): every
 * site's cell is the bounding square cut by the perpendicular bisector
 * against each other site. Lloyd relaxation then moves each site to its
 * cell's centroid, which turns random seeds into organic, evenly
 * distributed districts. O(iterations · sites²) — sites are top-level
 * directories, so n ≤ ~50 in practice.
 */

export interface Point {
  x: number;
  z: number;
}

export interface VoronoiSite {
  /** Identifies the site (e.g. directory path); seeds derive from it */
  key: string;
  /** Relative weight — heavier sites claim larger cells */
  weight: number;
}

export interface VoronoiCell {
  key: string;
  /** Convex polygon, counter-clockwise-ish (ordering is not guaranteed) */
  polygon: Point[];
  centroid: Point;
}

/** Deterministic hash — same as layout.ts (FNV-1a), kept in sync on purpose */
export function hashPoint(key: string, salt: number): number {
  let h = 2166136261;
  const s = `${key}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Initial seed positions: phyllotaxis spiral (golden angle) + path jitter */
export function seedSites(sites: VoronoiSite[], halfExtent: number): Point[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const total = sites.reduce((s, site) => s + Math.max(site.weight, 1e-6), 0);
  const sorted = [...sites].sort((a, b) => b.weight - a.weight);
  let consumed = 0;
  const radiusByRank = new Map<string, number>();
  for (const site of sorted) {
    // Heavier sites start closer to the centre
    const frac = (consumed + 0.5) / sites.length;
    consumed += Math.max(site.weight, 1e-6) / total;
    radiusByRank.set(site.key, Math.sqrt(frac) * halfExtent);
  }
  return sites.map((site, i) => {
    const baseRadius = radiusByRank.get(site.key) ?? halfExtent;
    const angle = golden * i + hashPoint(site.key, 1) * 0.8;
    const radius = baseRadius * (0.75 + hashPoint(site.key, 2) * 0.35);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

/** Clip polygon to the half-plane of points closer to p than q. */
export function clipByBisector(polygon: Point[], p: Point, q: Point): Point[] {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  // Half-plane: dot(point - p, q - p) <= |q-p|²/2
  const limit = (dx * dx + dz * dz) / 2;

  const inside = (v: Point): boolean => v.x * dx + v.z * dz <= p.x * dx + p.z * dz + limit;
  const intersect = (a: Point, b: Point): Point => {
    // Solve for t where the segment crosses the bisector line
    const fa = (a.x - p.x) * dx + (a.z - p.z) * dz - limit;
    const fb = (b.x - p.x) * dx + (b.z - p.z) * dz - limit;
    const t = fa / (fa - fb);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };

  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const cur = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length];
    if (!next) continue;
    const curIn = inside(cur);
    const nextIn = inside(next);
    if (curIn) out.push(cur);
    if (curIn !== nextIn) out.push(intersect(cur, next));
  }
  return out;
}

export function polygonCentroid(polygon: Point[]): Point {
  if (polygon.length === 0) return { x: 0, z: 0 };
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const cross = p.x * q.z - q.x * p.z;
    a += cross;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    // Degenerate (collinear) — fall back to the vertex average
    const sum = polygon.reduce((s, v) => ({ x: s.x + v.x, z: s.z + v.z }), { x: 0, z: 0 });
    return { x: sum.x / polygon.length, z: sum.z / polygon.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

/** Distance from centroid to the closest vertex — usable "incircle" proxy */
export function polygonMinRadius(polygon: Point[], c: Point): number {
  if (polygon.length === 0) return 0;
  return Math.min(...polygon.map((v) => Math.hypot(v.x - c.x, v.z - c.z)));
}

/**
 * Compute the diagram: seeds → Lloyd relaxation → final cells.
 * Deterministic for a given site list (weights + keys).
 */
export function computeVoronoi(
  sites: VoronoiSite[],
  halfExtent: number,
  relaxIterations = 4,
): VoronoiCell[] {
  if (sites.length === 0) return [];
  if (sites.length === 1) {
    const c = { x: 0, z: 0 };
    return [
      {
        key: sites[0]!.key,
        centroid: c,
        polygon: square(halfExtent),
      },
    ];
  }

  const bounding = square(halfExtent * 1.6);
  let points = seedSites(sites, halfExtent);

  for (let iter = 0; iter < relaxIterations; iter++) {
    points = points.map((p, i) => {
      let polygon = bounding;
      for (let j = 0; j < points.length; j++) {
        if (j === i) continue;
        const q = points[j]!;
        if (p.x === q.x && p.z === q.z) continue;
        polygon = clipByBisector(polygon, p, q);
        if (polygon.length === 0) break;
      }
      return polygon.length > 0 ? polygonCentroid(polygon) : p;
    });
  }

  return sites.map((site, i) => {
    const p = points[i]!;
    let polygon = bounding;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const q = points[j]!;
      if (p.x === q.x && p.z === q.z) continue;
      polygon = clipByBisector(polygon, p, q);
      if (polygon.length === 0) break;
    }
    const safe = polygon.length >= 3 ? polygon : square(halfExtent * 0.25, p);
    return { key: site.key, centroid: polygonCentroid(safe), polygon: safe };
  });
}

function square(halfExtent: number, center: Point = { x: 0, z: 0 }): Point[] {
  return [
    { x: center.x - halfExtent, z: center.z - halfExtent },
    { x: center.x + halfExtent, z: center.z - halfExtent },
    { x: center.x + halfExtent, z: center.z + halfExtent },
    { x: center.x - halfExtent, z: center.z + halfExtent },
  ];
}

/** Unique line segments from all cell boundaries (shared edges emitted once) */
export function cellBoundarySegments(cells: VoronoiCell[]): Array<{
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}> {
  const seen = new Set<string>();
  const out: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];
  for (const cell of cells) {
    for (let i = 0; i < cell.polygon.length; i++) {
      const p = cell.polygon[i]!;
      const q = cell.polygon[(i + 1) % cell.polygon.length]!;
      const key = [
        Math.round(p.x * 100),
        Math.round(p.z * 100),
        Math.round(q.x * 100),
        Math.round(q.z * 100),
      ]
        .sort((a, b) => a - b)
        .join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x1: p.x, z1: p.z, x2: q.x, z2: q.z });
    }
  }
  return out;
}
