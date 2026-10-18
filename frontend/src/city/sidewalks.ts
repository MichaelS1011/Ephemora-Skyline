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
  /**
   * The kerb stretches themselves, in world coordinates — the pieces of curb a
   * figure can actually stand beside, with the junction mouths cut out. The
   * street paint draws its kerb stones from these, so the curb you see is the
   * curb the crowd walks on, and a plaza lane shows the same stone as a street.
   */
  kerbs: Array<{ x1: number; z1: number; x2: number; z2: number }>;
}

/** Sidewalk center distance from the street centerline (= curb line). */
export const CURB_OFFSET = 2.18;
/** Spacing of sidewalk nodes along a street. */
const NODE_STEP = 3.4;
/** Two nodes from different lines within this radius connect (corners). */
const LINK_RADIUS = 2.9;
/** Every n-th interior node pair on a street gets a crosswalk. */
const CROSSWALK_EVERY = 5;
/**
 * Paint budget for one level. Junction crossings come first (they are the
 * places the walking rules actually need), the mid-block rhythm fills what is
 * left. The cap never stops a curb from being built — it used to `break` out of
 * the whole line loop, which stranded every street behind it off the graph.
 */
const MAX_CROSSWALKS = 120;
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
/**
 * Clearance a pavement keeps from the wall it runs beside. A plaza lane is only
 * drawn where the corridor between two façades can pay for `CURB_OFFSET` of
 * walking band plus this — a kerb node inside a footprint is a figure in a wall.
 */
const LANE_EDGE_MARGIN = 0.5;
/** Two facing buildings have to share this much frontage for the corridor
 *  between them to be a lane somebody walks rather than a diagonal sight line. */
const LANE_OVERLAP = 1;
/** Slack a face-to-face measurement keeps against floating-point ties. */
const EPS = 0.01;

type Axis = "x" | "z";
type LaneBox = { x: number; z: number; w: number; d: number };

const boxLo = (b: LaneBox, ax: Axis): number => (ax === "x" ? b.x - b.w / 2 : b.z - b.d / 2);
const boxHi = (b: LaneBox, ax: Axis): number => (ax === "x" ? b.x + b.w / 2 : b.z + b.d / 2);

/**
 * Plaza lanes: the walking lines BETWEEN the plaza's file buildings.
 *
 * The version this replaces averaged the buildings' centre coordinates and drew
 * a lane halfway between two columns. That is not a lane. The network builder
 * hangs a pavement at `CURB_OFFSET` on each side of every line it is given, so
 * the corridor has to be `2 × CURB_OFFSET` wide — while the measured face-to-face
 * gap between two columns of a real block is about 2.3 units. Both kerb rows
 * landed inside the façades they were meant to walk past (23 nodes standing in
 * buildings), and the lanes stopped at the building extent ±6, which is 25 units
 * short of the district's roads and past every link radius the graph has, so no
 * walker could reach them (92 of 160 kerb nodes reachable).
 *
 * The rule now, measured rather than assumed:
 * — a corridor is the gap between two FACING façades that share frontage;
 * — it gets both pavements when it is wider than `2 × (CURB_OFFSET + margin)`,
 *   one pavement hugging the nearer façade when it is wider than a single band,
 *   and nothing at all when it is an alley — a lane whose walker would have to
 *   stand in a wall is not a lane;
 * — a lane is cut wherever a footprint reaches into its band, so a fragment ends
 *   at the wall that blocks it instead of passing through it; and
 * — only a fragment that touches a street is drawn, because a walking line that
 *   ends in the middle of the plaza belongs to nobody's route.
 */
export function plazaLanes(
  buildings: Array<{ x: number; z: number; w: number; d: number }>,
  streets: StreetLine[] = [],
): StreetLine[] {
  if (buildings.length < 2) return [];
  return [...lanesAcross(buildings, streets, "x"), ...lanesAcross(buildings, streets, "z")];
}

/** The lanes whose corridor runs across `cross` (so the lane itself runs along
 *  the other axis). */
function lanesAcross(buildings: LaneBox[], streets: StreetLine[], cross: Axis): StreetLine[] {
  const along: Axis = cross === "x" ? "z" : "x";
  const band = CURB_OFFSET + LANE_EDGE_MARGIN;
  const candidates: Array<{
    axis: number;
    bandLo: number;
    bandHi: number;
    oneSided: boolean;
    frontage: number;
  }> = [];
  for (const a of buildings) {
    for (const b of buildings) {
      if (a === b) continue;
      const faceA = boxHi(a, cross);
      const faceB = boxLo(b, cross);
      const gap = faceB - faceA;
      if (gap < band) continue;
      const frontage =
        Math.min(boxHi(a, along), boxHi(b, along)) - Math.max(boxLo(a, along), boxLo(b, along));
      if (frontage < LANE_OVERLAP) continue;
      // The two have to face each other across an EMPTY strip. A pair with a
      // third lot standing between them has a wide "gap" whose middle is that
      // lot — and the lane drawn there would run its pavement through somebody
      // else's frontage.
      const between = buildings.some(
        (c) => c !== a && c !== b && boxLo(c, cross) > faceA && boxHi(c, cross) < faceB,
      );
      if (between) continue;
      const oneSided = gap < 2 * band;
      const axis = oneSided ? faceA : (faceA + faceB) / 2;
      candidates.push({
        axis,
        bandLo: oneSided ? axis : axis - CURB_OFFSET,
        bandHi: axis + CURB_OFFSET,
        oneSided,
        frontage,
      });
    }
  }
  // Two facing pairs in the same corridor rarely agree on the axis, because the
  // grid jitters every lot on its own. Keep the widest frontage of each corridor
  // and a two-sided lane over the one-sided ones it would duplicate.
  candidates.sort((p, q) =>
    p.oneSided === q.oneSided ? q.frontage - p.frontage : p.oneSided ? 1 : -1,
  );
  const kept: typeof candidates = [];
  for (const c of candidates) {
    if (kept.some((k) => Math.abs(k.axis - c.axis) < CURB_OFFSET)) continue;
    kept.push(c);
  }

  const out: StreetLine[] = [];
  for (const c of kept) {
    const reach = streetReach(buildings, streets, cross, c.axis);
    if (!reach) continue;
    // Every footprint that reaches into the band blocks the lane for its own
    // frontage; the lane runs in what is left.
    const blocks: Array<[number, number]> = [];
    for (const b of buildings) {
      if (boxLo(b, cross) < c.bandHi - EPS && boxHi(b, cross) > c.bandLo + EPS) {
        blocks.push([boxLo(b, along), boxHi(b, along)]);
      }
    }
    blocks.sort((p, q) => p[0] - q[0]);
    const segments: Array<[number, number]> = [];
    let u = reach.from;
    for (const [bs, be] of blocks) {
      if (bs > u + 1e-6) segments.push([u, Math.min(bs, reach.to)]);
      if (be > u) u = be;
    }
    if (u < reach.to - 1e-6) segments.push([Math.max(u, reach.from), reach.to]);
    for (const [s, e] of segments) {
      if (e - s < 3) continue;
      // Only a fragment that reaches the road: its ends are on the road, and an
      // interior fragment between two blocking walls is a passage to nowhere.
      if (s > reach.from + 1e-6 && e < reach.to - 1e-6) continue;
      out.push(makeLane(cross, c.axis, s, e, c.oneSided));
    }
  }
  return out;
}

/** The nearest street crossing the infinite line `cross = axis` on each side of
 *  the building field, or null when the lane would have no road to reach. */
function streetReach(
  buildings: LaneBox[],
  streets: StreetLine[],
  cross: Axis,
  axis: number,
): { from: number; to: number } | null {
  const along: Axis = cross === "x" ? "z" : "x";
  let fieldLo = Infinity;
  let fieldHi = -Infinity;
  for (const b of buildings) {
    fieldLo = Math.min(fieldLo, boxLo(b, along));
    fieldHi = Math.max(fieldHi, boxHi(b, along));
  }
  const ts: number[] = [];
  for (const s of streets) {
    const p1 = cross === "x" ? s.x1 : s.z1;
    const p2 = cross === "x" ? s.x2 : s.z2;
    const q1 = cross === "x" ? s.z1 : s.x1;
    const q2 = cross === "x" ? s.z2 : s.x2;
    if (Math.abs(p2 - p1) < EPS) continue;
    const t = (axis - p1) / (p2 - p1);
    if (t < -EPS || t > 1 + EPS) continue;
    ts.push(q1 + (q2 - q1) * t);
  }
  const from = ts.filter((t) => t <= fieldLo + EPS).reduce((m, t) => Math.max(m, t), -Infinity);
  const to = ts.filter((t) => t >= fieldHi - EPS).reduce((m, t) => Math.min(m, t), Infinity);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 3) return null;
  return { from, to };
}

/**
 * A lane across `cross` at `axis`, running from `s` to `e` in its own direction.
 * A one-sided lane is written so that the pavement it can pay for is on the
 * +normal side of the axis (`nx = -(z2 - z1), nz = x2 - x1`), which is the side
 * the corridor lies on — the convention `buildSidewalkNetwork` reads.
 */
function makeLane(cross: Axis, axis: number, s: number, e: number, oneSided: boolean): StreetLine {
  if (cross === "x") {
    return oneSided
      ? { x1: axis, z1: e, x2: axis, z2: s, oneSided: true }
      : { x1: axis, z1: s, x2: axis, z2: e };
  }
  return oneSided
    ? { x1: s, z1: axis, x2: e, z2: axis, oneSided: true }
    : { x1: s, z1: axis, x2: e, z2: axis };
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
 * junction begins. Every walking line that crosses this one cuts a stretch out
 * of it — plaza lanes included, because a lane meets a street the way a side
 * street does, and the two kerb ends that stop at the mouth are exactly one step
 * apart, which is what carries a walker around a junction. Only the sides this
 * line actually carries are asked (a one-sided lane has one pavement) and the
 * wider cut wins, so the kerb sides keep one node grid and a crosswalk link still
 * pairs a node with the node directly opposite it. A line left with no stretch
 * worth standing on keeps its full placement, because a stranded kerb line is
 * worse than one node too close to a lane (streets drawn on top of each other do
 * happen in a city).
 */
function kerbSpans(
  line: StreetLine,
  cutters: StreetLine[],
  len: number,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
  sides: number[],
): Span[] {
  const cuts: Span[] = [];
  for (const s of cutters) {
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
    for (const side of sides) {
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

/** Where two walking lines cross, in both of their own along-coordinates. */
function crossingOf(a: StreetLine, b: StreetLine): boolean {
  const adx = a.x2 - a.x1;
  const adz = a.z2 - a.z1;
  const bdx = b.x2 - b.x1;
  const bdz = b.z2 - b.z1;
  const lenA = Math.hypot(adx, adz);
  const lenB = Math.hypot(bdx, bdz);
  if (lenA < 3 || lenB < 3) return false;
  const det = adx * bdz - adz * bdx;
  if (Math.abs(det) < 1e-9) return false;
  const px = b.x1 - a.x1;
  const pz = b.z1 - a.z1;
  const ta = (px * bdz - pz * bdx) / det;
  const tb = (px * adz - pz * adx) / det;
  return ta >= 0 && ta <= lenA && tb >= 0 && tb <= lenB;
}

/**
 * The zebras at one crossing: one across each of the two lines, set where the
 * other line's kerb meets that line's axis — the exact point a walker stepping
 * over the mouth crosses it. A zebra is only painted where that step actually
 * exists: at the mouth of a line that ENDS on the other one there is no kerb
 * continuing past the carriageway, and paint nobody can walk is a claim without
 * a crossing (`openCityLife.test.ts` measures it).
 */
function addJunctionCrosswalks(a: StreetLine, b: StreetLine, out: Crosswalk[]): void {
  if (!crossingOf(a, b)) return;
  const reach = CARRIAGE_HALF + MOUTH_CLEARANCE;
  for (const [line, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const ldx = line.x2 - line.x1;
    const ldz = line.z2 - line.z1;
    const llen = Math.hypot(ldx, ldz);
    if (llen < 3) continue;
    const lnx = -ldz / llen;
    const lny = ldx / llen;
    const odx = other.x2 - other.x1;
    const odwz = other.z2 - other.z1;
    const olen = Math.hypot(odx, odwz);
    if (olen < 3) continue;
    const sux = odx / olen;
    const suz = odwz / olen;
    const onx = -suz;
    const onz = sux;
    const denom = sux * lnx + suz * lny;
    if (Math.abs(denom) < 1e-6) continue;
    const sides = other.oneSided ? [1] : [1, -1];
    for (const side of sides) {
      const qx = other.x1 + CURB_OFFSET * onx * side;
      const qz = other.z1 + CURB_OFFSET * onz * side;
      const tau = -((qx - line.x1) * lnx + (qz - line.z1) * lny) / denom;
      // the step along this kerb only crosses the other line's road if the kerb
      // carries on past it on both sides
      if (tau < reach || tau > olen - reach) continue;
      const x = qx + sux * tau;
      const z = qz + suz * tau;
      const along = ((x - line.x1) * ldx + (z - line.z1) * ldz) / llen;
      if (along < 0.4 || along > llen - 0.4) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 0.4)) continue;
      out.push({ x, z, rotY: -Math.atan2(ldz, ldx) });
    }
  }
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
  const kerbs: SidewalkNetwork["kerbs"] = [];
  const sidesOf = (line: StreetLine): number[] => (line.oneSided ? [1] : [1, -1]);
  for (let li = 0; li < allLines.length; li++) {
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
    const sides = sidesOf(line);
    // The kerb breaks wherever another carriageway runs into it, so that no node
    // of this graph — every one of them a place a figure can stand — is on road.
    const spans = kerbSpans(line, allLines, len, ux, uz, nx, nz, sides);
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
        if (sides.length > 1) {
          sideB.push(
            addNode(line.x1 + ux * u - nx * CURB_OFFSET, line.z1 + uz * u - nz * CURB_OFFSET),
          );
        }
      }
      // the stretch of curb this span is, both sides the line carries
      for (const side of sides) {
        const bx = line.x1 + nx * CURB_OFFSET * side;
        const bz = line.z1 + nz * CURB_OFFSET * side;
        kerbs.push({
          x1: bx + ux * sp.a,
          z1: bz + uz * sp.a,
          x2: bx + ux * sp.b,
          z2: bz + uz * sp.b,
        });
      }
    }
    // The kerb breaks where the mouth is, but the walk does not: the two ends of
    // the stretch either side of a side street are still one step apart, and
    // stepping over a mouth is what a kerb at a junction is for. That is the
    // case `openWorldStreets.atStreetMouth` declares legal — a crossing there is
    // not a jaywalk, only a crossing in the middle of a block has to be a zebra.
    for (let i = 0; i + 1 < sideA.length; i++) {
      link(sideA[i]!, sideA[i + 1]!);
      if (sides.length > 1) link(sideB[i]!, sideB[i + 1]!);
    }
    if (!isStreet) continue;
    for (let i = 2; i + 2 < sideA.length; i += CROSSWALK_EVERY) {
      if (crosswalks.length >= MAX_CROSSWALKS) break;
      const u = along[i]!;
      if (sides.length > 1) link(sideA[i]!, sideB[i]!);
      crosswalks.push({
        x: line.x1 + ux * u,
        z: line.z1 + uz * u,
        rotY: -Math.atan2(dz, dx),
      });
    }
  }

  // Every place two walking lines cross is a place a figure changes sides, so it
  // gets a zebra across each of them — painted where the OTHER line's kerb meets
  // this line's axis, which is exactly the point the mouth step crosses it. That
  // makes the paint and the graph the same claim: every crosswalk here is an edge
  // the crowd can take, and every edge that cuts a carriageway has paint under
  // it. `openCityLife.test.ts` holds both directions of that for the open world.
  // Where a plaza lane meets a street or another lane, the walkers change lines
  // by crossing, so that is where the paint goes. Two streets crossing each
  // other is a junction the rules already settle at the mouth (see
  // `openWorldStreets.atStreetMouth`), and painting every one of those would
  // multiply the stripes for crossings nobody has to make — the open world's
  // street paint is held to a plate budget for a reason.
  for (let i = 0; i < allLines.length; i++) {
    for (let j = i + 1; j < allLines.length; j++) {
      if (i < streets.length && j < streets.length) continue;
      addJunctionCrosswalks(allLines[i]!, allLines[j]!, crosswalks);
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

  return { nodes, crosswalks, kerbs };
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

/** A straight segment, in the same world coordinates the streets are drawn in. */
export interface Segment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

const orient = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number =>
  (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

/** Strict proper crossing of two segments — a shared endpoint is not a crossing. */
const crosses = (a: Segment, b: Segment): boolean => {
  const d1 = orient(a.x1, a.z1, a.x2, a.z2, b.x1, b.z1);
  const d2 = orient(a.x1, a.z1, a.x2, a.z2, b.x2, b.z2);
  const d3 = orient(b.x1, b.z1, b.x2, b.z2, a.x1, a.z1);
  const d4 = orient(b.x1, b.z1, b.x2, b.z2, a.x2, a.z2);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/**
 * The kerb a figure should finish its route from.
 *
 * `nearestNode` answers "which node is closest" by straight-line distance, and a
 * kerb on the far side of the carriageway is often the closest thing to a door.
 * The route then ends in a step that cuts across the street — measured as the
 * crowd's worst tell: residents walking diagonally over a junction while the
 * crosswalk they are routed to sits two metres away.
 *
 * So: prefer the nearest node from which the last step reaches its goal without
 * crossing a street line. Only when every candidate crosses one — a goal truly
 * in the middle of the road, or a network that does not serve it — fall back to
 * the plain nearest node, because standing still on the kerb is worse than the
 * short crossing.
 */
export function approachNode(
  net: SidewalkNetwork,
  streets: readonly Segment[],
  x: number,
  z: number,
): number {
  if (streets.length === 0 || net.nodes.length === 0) return nearestNode(net, x, z);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < net.nodes.length; i++) {
    const n = net.nodes[i]!;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d >= bestD) continue;
    if (streets.some((s) => crosses({ x1: n.x, z1: n.z, x2: x, z2: z }, s))) continue;
    bestD = d;
    best = i;
  }
  return best >= 0 ? best : nearestNode(net, x, z);
}
