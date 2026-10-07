/**
 * Sidewalk network — the graph the Ephe's actually walk on.
 *
 * Built from the street lines (district boundaries, plaza ring) plus the
 * plaza lanes between the file buildings. Nodes sit on the curb line of
 * every street, both sides, evenly spaced — and they stop at the mouth of a
 * side street, because that stretch of the curb line is the other street's
 * carriageway. The corner nodes of the two lines are close enough to link, so
 * the kerb wraps around the junction instead of running through it.
 * Edges connect:
 * - along each curb (consecutive nodes of one side, within one stretch)
 * - across the asphalt every few nodes (crosswalk — also rendered as stripes)
 * - wherever two lines pass close (street corners, lane intersections)
 *
 * Deterministic: the same streets always produce the same network, so the
 * walkers, the crosswalk stripes and the street furniture agree.
 */

import type { StreetLine } from "./layout";

export interface SidewalkNode {
  x: number;
  z: number;
  adj: number[];
}

export interface Crosswalk {
  x: number;
  z: number;
  rotY: number;
}

export interface SidewalkNetwork {
  nodes: SidewalkNode[];
  crosswalks: Crosswalk[];
}

/** Sidewalk center distance from the street centerline (= curb line). */
export const CURB_OFFSET = 2.18;
/** Spacing of sidewalk nodes along a street. */
const NODE_STEP = 3.4;
/** Two nodes from different lines within this radius connect (corners). */
const LINK_RADIUS = 2.9;
/** Every n-th interior node pair on a street gets a crosswalk. */
const CROSSWALK_EVERY = 5;
const MAX_CROSSWALKS = 60;
/**
 * Half a carriageway. `RoadSystem` paints asphalt 3.8 wide and so does the open
 * world's own grid, so a point nearer than this to a street's centre line is
 * standing on road — a kerb node there is a figure in a lane.
 */
const CARRIAGE_HALF = 1.9;
/** Clearance a kerb node keeps from the lane of the street running into it. The
 *  mouth of a side street is where the walking surface ends; the corner link
 *  picks the walker up on the other side of it. */
const MOUTH_CLEARANCE = 0.22;
/** A kerb stretch shorter than this is the corner itself, not a place to stand. */
const MOUTH_MIN_STUB = 0.6;

/** Plaza lanes: clear walking lines BETWEEN the plaza's file buildings. */
export function plazaLanes(
  buildings: Array<{ x: number; z: number; w: number; d: number }>,
): StreetLine[] {
  if (buildings.length < 2) return [];
  const centers = (values: number[]): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(v - g[g.length - 1]!) < 3.2) g.push(v);
      else groups.push([v]);
    }
    return groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
  };
  const cols = centers(buildings.map((b) => b.x));
  const rows = centers(buildings.map((b) => b.z));
  if (cols.length < 2 && rows.length < 2) return [];
  const minZ = Math.min(...buildings.map((b) => b.z)) - 6;
  const maxZ = Math.max(...buildings.map((b) => b.z)) + 6;
  const minX = Math.min(...buildings.map((b) => b.x)) - 6;
  const maxX = Math.max(...buildings.map((b) => b.x)) + 6;
  const lanes: StreetLine[] = [];
  for (let i = 0; i + 1 < cols.length; i++) {
    const x = (cols[i]! + cols[i + 1]!) / 2;
    lanes.push({ x1: x, z1: minZ, x2: x, z2: maxZ });
  }
  for (let i = 0; i + 1 < rows.length; i++) {
    const z = (rows[i]! + rows[i + 1]!) / 2;
    lanes.push({ x1: minX, z1: z, x2: maxX, z2: z });
  }
  return lanes;
}

/**
 * Where the walking surface of one line is interrupted, stated in the line's own
 * along-coordinates: `a` to `b` is a stretch a figure can stand on.
 */
interface Span {
  a: number;
  b: number;
}

/** Narrow `out` to the u where lo < v + k*u < hi holds. False when the u range
 *  comes out empty, or when a constant `k` already fails the inequality. */
function clipToStrip(v: number, k: number, lo: number, hi: number, out: Span): boolean {
  if (Math.abs(k) < 1e-9) return v > lo && v < hi;
  const a = (lo - v) / k;
  const b = (hi - v) / k;
  out.a = Math.max(out.a, Math.min(a, b));
  out.b = Math.min(out.b, Math.max(a, b));
  return out.a < out.b;
}

/**
 * The kerb stretches of `line` that no carriageway runs over.
 *
 * A side street's mouth is not a kerb: it is where the sidewalk stops and the
 * junction begins. Every street that crosses this line cuts a stretch out of it,
 * both sides are asked and the wider cut wins — so the two kerb sides keep one
 * node grid and a crosswalk link still pairs a node with the node directly
 * opposite it. A line left with no stretch worth standing on keeps its full
 * placement, because a stranded kerb line is worse than one node too close to a
 * lane (streets drawn on top of each other do happen in a city).
 */
function kerbSpans(
  line: StreetLine,
  streets: StreetLine[],
  len: number,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
): Span[] {
  const cuts: Span[] = [];
  for (const s of streets) {
    if (s === line) continue;
    const sdx = s.x2 - s.x1;
    const sdz = s.z2 - s.z1;
    const slen = Math.hypot(sdx, sdz);
    if (slen < 3) continue;
    const sx = sdx / slen;
    const sz = sdz / slen;
    const snx = -sz;
    const snz = sx;
    const reach = CARRIAGE_HALF + MOUTH_CLEARANCE;
    for (const side of [1, -1]) {
      // the kerb point at along-coordinate u: start + u*dir + side*CURB*normal
      const ox = line.x1 + nx * CURB_OFFSET * side;
      const oz = line.z1 + nz * CURB_OFFSET * side;
      const span: Span = { a: 0, b: len };
      // across the other street: |perpendicular| < reach is its lane
      if (
        !clipToStrip(
          (ox - s.x1) * snx + (oz - s.z1) * snz,
          ux * snx + uz * snz,
          -reach,
          reach,
          span,
        )
      )
        continue;
      // and it has to be within that street's own span to be a mouth
      if (
        !clipToStrip(
          (ox - s.x1) * sx + (oz - s.z1) * sz,
          ux * sx + uz * sz,
          -reach,
          slen + reach,
          span,
        )
      )
        continue;
      cuts.push({ a: span.a, b: span.b });
    }
  }
  cuts.sort((p, q) => p.a - q.a);
  const free: Span[] = [];
  let u = 0;
  for (const c of cuts) {
    if (c.a > u + 1e-6) free.push({ a: u, b: Math.min(c.a, len) });
    if (c.b > u) u = c.b;
  }
  if (u < len - 1e-6) free.push({ a: Math.max(u, 0), b: len });
  const stubs = free.filter((f) => f.b - f.a >= MOUTH_MIN_STUB);
  return stubs.length > 0 ? stubs : [{ a: 0, b: len }];
}

export function buildSidewalkNetwork(
  streets: StreetLine[],
  lanes: StreetLine[] = [],
): SidewalkNetwork {
  const nodes: SidewalkNode[] = [];
  const crosswalks: Crosswalk[] = [];
  const addNode = (x: number, z: number): number => {
    nodes.push({ x, z, adj: [] });
    return nodes.length - 1;
  };
  const link = (a: number, b: number): void => {
    if (a === b) return;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    if (!na.adj.includes(b)) na.adj.push(b);
    if (!nb.adj.includes(a)) nb.adj.push(a);
  };

  const allLines = [...streets, ...lanes];
  lines: for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li]!;
    const dx = line.x2 - line.x1;
    const dz = line.z2 - line.z1;
    const len = Math.hypot(dx, dz);
    if (len < 3) continue;
    const isStreet = li < streets.length;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    // The kerb breaks wherever a carriageway runs into it, so that no node of
    // this graph — every one of them a place a figure can stand — is on road.
    const spans = kerbSpans(line, streets, len, ux, uz, nx, nz);
    const sideA: number[] = [];
    const sideB: number[] = [];
    const along: number[] = [];
    for (const sp of spans) {
      const segLen = sp.b - sp.a;
      const count = Math.max(2, Math.round(segLen / NODE_STEP) + 1);
      for (let k = 0; k < count; k++) {
        const u = sp.a + (segLen * k) / (count - 1);
        along.push(u);
        sideA.push(
          addNode(line.x1 + ux * u + nx * CURB_OFFSET, line.z1 + uz * u + nz * CURB_OFFSET),
        );
        sideB.push(
          addNode(line.x1 + ux * u - nx * CURB_OFFSET, line.z1 + uz * u - nz * CURB_OFFSET),
        );
      }
    }
    // The kerb breaks where the mouth is, but the walk does not: the two ends of
    // the stretch either side of a side street are still one step apart, and
    // stepping over a mouth is what a kerb at a junction is for. That is the
    // case `openWorldStreets.atStreetMouth` declares legal — a crossing there is
    // not a jaywalk, only a crossing in the middle of a block has to be a zebra.
    for (let i = 0; i + 1 < sideA.length; i++) {
      link(sideA[i]!, sideA[i + 1]!);
      link(sideB[i]!, sideB[i + 1]!);
    }
    if (!isStreet) continue;
    for (let i = 2; i + 2 < sideA.length; i += CROSSWALK_EVERY) {
      if (crosswalks.length >= MAX_CROSSWALKS) break lines;
      const u = along[i]!;
      link(sideA[i]!, sideB[i]!);
      crosswalks.push({
        x: line.x1 + ux * u,
        z: line.z1 + uz * u,
        rotY: -Math.atan2(dz, dx),
      });
    }
  }

  // Corners and lane intersections: near nodes of different lines connect
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i]!.x - nodes[j]!.x;
      const dz = nodes[i]!.z - nodes[j]!.z;
      if (dx * dx + dz * dz < LINK_RADIUS * LINK_RADIUS) link(i, j);
    }
  }

  return { nodes, crosswalks };
}

/** Index of the graph node nearest to a point (door hops, curb spawns). */
export function nearestNode(net: SidewalkNetwork, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < net.nodes.length; i++) {
    const n = net.nodes[i]!;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Breadth-first path of node indices from `from` to `to` (excl. `from`). */
export function graphPath(net: SidewalkNetwork, from: number, to: number): number[] {
  if (from === to) return [];
  const prev = new Int32Array(net.nodes.length).fill(-1);
  prev[from] = from;
  const queue: number[] = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    for (const nb of net.nodes[cur]!.adj) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path: number[] = [];
        let c = to;
        while (c !== from) {
          path.push(c);
          c = prev[c]!;
        }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return [];
}
