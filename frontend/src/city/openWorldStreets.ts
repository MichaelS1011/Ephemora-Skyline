/**
 * The open world's own street network — the little grid the empty world gets
 * BEFORE any folder has been scanned.
 *
 * Why this exists: with no city there were no streets, and the pedestrian
 * simulation reads its whole transit world out of the street list. No streets
 * meant no taxi, no bus, no bus stop, and the 46 Ephe's walked at a
 * `Math.random()` point on bare ground instead of along a curb. The first
 * impression of a product about a living city was a city without city life.
 *
 * What this module is: a deterministic, self-contained piece of street
 * geometry — six streets, the sidewalk graph they generate (through the very
 * same `buildSidewalkNetwork` the built city uses), the crosswalks, the block
 * interiors a walker may never enter, and the flat instanced plates that draw
 * all of it. It is deliberately NOT a stub city: no plots, no buildings, no
 * data attached to anything. It exists so the crowd has curbs to walk on and
 * traffic has a road to drive on from the first frame.
 *
 * Cost is the point of the shape: every flat thing (asphalt, curb, zebra bar,
 * lane dash, block pad, vehicle body, sign board) is one scaled unit box, and
 * every round thing (stop pole, four wheels) is one scaled unit cylinder — so
 * the whole street network plus the parked-and-driving traffic is TWO instanced
 * draw calls, not one mesh per stripe.
 *
 * The geometry doubles as the contract for the two rules the city already
 * keeps: a walker never crosses the asphalt away from a crosswalk, and never
 * steps into a block interior. `distanceToNetwork`, `insideParcel` and
 * `crossesStreetOffCrosswalk` are the same functions the browser measurement
 * and the vitest guards call, so a rule proven in a test is the rule that was
 * measured on screen.
 */

import {
  buildSidewalkNetwork,
  CURB_OFFSET,
  type Crosswalk,
  type SidewalkNetwork,
} from "./sidewalks";
import type { StreetLine } from "./layout";
import { ENV } from "./palette";

/** One unit box and one unit cylinder carry every plate and every post. */
export interface StreetPlate {
  x: number;
  /** Height above the ground plane the box is centred on. */
  y: number;
  z: number;
  rotY: number;
  /** Along the plate's own X (the street direction for street paint). */
  w: number;
  /** Box height. */
  h: number;
  /** Across the plate's own Z. */
  d: number;
  color: string;
}

export interface StreetPost {
  x: number;
  y: number;
  z: number;
  /** Standing upright unless `rotZ` says otherwise (wheels lie down). */
  rotZ: number;
  r: number;
  h: number;
  color: string;
}

/** A block interior: the ground behind the sidewalk that no walker crosses. */
export interface Parcel {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export type VehicleId = "taxi" | "bus";

/** A part of a vehicle, in the vehicle's own frame (local Z is forward). */
export interface VehicleBox {
  vehicle: VehicleId;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

export interface VehicleWheel {
  vehicle: VehicleId;
  y: number;
  z: number;
  r: number;
  t: number;
  color: string;
}

export interface Transit {
  /** Where the bus stop sign stands, on the kerb. */
  stopPoint: { x: number; z: number };
  /** The leg the bus is held to while it dwells. */
  stopSegment: StreetLine;
  /** Where the taxi pulls in to pick somebody up. */
  taxiCurb: { x: number; z: number };
  /** The street each vehicle belongs to, so a still frame can place it on road. */
  busLane: StreetLine;
  taxiLane: StreetLine;
}

export interface OpenWorld {
  streets: StreetLine[];
  network: SidewalkNetwork;
  parcels: Parcel[];
  plates: StreetPlate[];
  /** Half-extent of the grid including its curb band — the crowd's bounds. */
  bounds: number;
  transit: Transit;
}

/**
 * Three streets per axis, 14 units apart, running 19 units out from the
 * centre. Chosen against the empty world's establishing shot
 * (CityScene's camera at [17,10,34] looking at [0,1,0]): measured with the
 * canvas's own 52° fov, every node of the sidewalk graph this grid generates
 * lands inside a 1600x1000 frame at 21 px or taller — so the crowd is readable
 * without moving the camera the look-dev lane just settled on.
 */
export const OPEN_WORLD_PITCH = 14;
export const OPEN_WORLD_REACH = 19;
const OPEN_WORLD_LINES = [-OPEN_WORLD_PITCH, 0, OPEN_WORLD_PITCH];
/** Carriageway width — the same number the built city's streets are drawn with. */
const ASPHALT_WIDTH = 3.8;
/** Curb + sidewalk band: how far inside a street line a block interior starts. */
const PARCEL_INSET = CURB_OFFSET + 1.02;
/** A crossing counts as "at the zebra" within this distance of its centre. */
export const CROSSWALK_TOLERANCE = 2.3;
/**
 * How short a hop may be for an Ephe to walk it straight instead of being
 * routed over the street graph. On bare ground there are no doors to approach,
 * so this only ever covers the last stride from the kerb to the stop slot or
 * the taxi stand — and it is deliberately smaller than the street is wide
 * (`2 * CURB_OFFSET`): a hop that short cannot reach across the carriageway,
 * so the one legal off-graph step can never become an illegal crossing.
 */
export const OPEN_WORLD_DIRECT_STEP = 3.5;

const ASPHALT_Y = 0.02;
const CURB_Y = 0.04;
const ZEBRA_Y = 0.055;
const DASH_Y = 0.06;
const PAD_Y = 0.012;
/** Zebra bars across the carriageway — identical to RoadSystem's, so an open
 *  world crossing and a city crossing are the same drawing. */
const CROSSWALK_BARS = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65];

/** Public transit livery — deep petrol, cool and calm. */
export const TRANSIT_LIVERY = "#2f6d7d";
/** Cab livery — warm cream, distinct from the transit by warmth as well as size. */
export const TAXI_LIVERY = "#e6dfcb";

/**
 * The two vehicles and the stop sign, part by part — plain meshes, no emissive,
 * no glow, grey wheels.
 *
 * The bodywork deliberately does NOT wear the brand red. Red/orange/yellow is
 * the alarm band in this product (SEVERITY_COLOR, and CVD variant), and the
 * brand red `#e8503c` is *also* ENV.selection: a red bus idling next to a
 * building reads as "this one is on fire" or "this one is selected", and both
 * readings are wrong. Traffic is furniture, so it takes the two calm families
 * the city already has — public transit in deep petrol, the cab in warm cream —
 * and the stop sign belongs to the transit livery it serves. trafficLivery.test.ts
 * holds the distance from every alarm colour and from the selection colour.
 */
export const VEHICLE_BOXES: VehicleBox[] = [
  { vehicle: "taxi", y: 0.34, z: 0, w: 1.05, h: 0.42, d: 2.1, color: TAXI_LIVERY },
  { vehicle: "taxi", y: 0.66, z: -0.15, w: 0.9, h: 0.3, d: 1.1, color: "#1c1c1a" },
  { vehicle: "bus", y: 0.75, z: 0, w: 1.5, h: 1.15, d: 4.6, color: TRANSIT_LIVERY },
  { vehicle: "bus", y: 1.05, z: 0, w: 1.52, h: 0.4, d: 4.2, color: "#f2efe8" },
];

export const VEHICLE_WHEELS: VehicleWheel[] = [
  { vehicle: "taxi", y: 0.16, z: 1.0, r: 0.16, t: 0.12, color: "#0c0c0b" },
  { vehicle: "taxi", y: 0.16, z: -1.0, r: 0.16, t: 0.12, color: "#0c0c0b" },
  { vehicle: "bus", y: 0.22, z: 1.6, r: 0.24, t: 0.14, color: "#0c0c0b" },
  { vehicle: "bus", y: 0.22, z: -1.6, r: 0.24, t: 0.14, color: "#0c0c0b" },
];

/** The stop sign: a grey post and a small board, placed by the component at the
 *  transit stop so the city and the open world show the same furniture. */
export const STOP_POST: StreetPost = {
  x: 0,
  y: 0.9,
  z: 0,
  rotZ: 0,
  r: 0.045,
  h: 1.8,
  color: "#8f8b82",
};
export const STOP_BOARD: StreetPlate = {
  x: 0,
  y: 1.85,
  z: 0,
  rotY: 0,
  w: 0.5,
  h: 0.32,
  d: 0.05,
  color: TRANSIT_LIVERY,
};

/**
 * The open world's street grid: three streets per axis at OPEN_WORLD_PITCH,
 * closed by a beltway at ±OPEN_WORLD_REACH.
 *
 * The beltway is what makes the grid honest to look at. Every street now ends in
 * a junction, so no carriageway stops dead on bare ground — the earlier fix of
 * letting the asphalt run past the grid only moved the blunt cut further away,
 * which the establishing shot showed plainly. The ring is also the right story:
 * it is the edge of the surveyed area, and outside it there is simply no city
 * yet, because nothing has been scanned.
 *
 * The inner streets run exactly to the ring, so each of their ends is a
 * T-junction on it and the sidewalk graph inherits 12 crossing mouths plus the
 * four ring corners.
 */
export function openWorldStreets(): StreetLine[] {
  const streets: StreetLine[] = [];
  for (const a of OPEN_WORLD_LINES) {
    streets.push({ x1: -OPEN_WORLD_REACH, z1: a, x2: OPEN_WORLD_REACH, z2: a });
  }
  for (const a of OPEN_WORLD_LINES) {
    streets.push({ x1: a, z1: -OPEN_WORLD_REACH, x2: a, z2: OPEN_WORLD_REACH });
  }
  const belt = OPEN_WORLD_REACH;
  streets.push({ x1: -belt, z1: -belt, x2: belt, z2: -belt });
  streets.push({ x1: -belt, z1: belt, x2: belt, z2: belt });
  streets.push({ x1: -belt, z1: -belt, x2: -belt, z2: belt });
  streets.push({ x1: belt, z1: -belt, x2: belt, z2: belt });
  return streets;
}

/**
 * Block interiors: the ground between four neighbouring street lines, pushed in
 * by the curb band. The grid's outer ring is open ground, not a parcel — a
 * walker strolling past the last street is on the edge of the built area, not
 * cutting through somebody's plot.
 *
 * The beltway sits closer to the last inner street than two curb bands need, so
 * the band between them has no plot left in it once both kerbs are paid for.
 * A parcel that would come out smaller than a building footprint is not a block
 * interior but a shoulder, and drawing one would put a pale pad under the
 * pavement — so it is skipped rather than clamped.
 */
const MIN_PARCEL = 2;

export function openWorldParcels(streets = openWorldStreets()): Parcel[] {
  const xs = streets.filter((s) => Math.abs(s.z1 - s.z2) < 0.01).map((s) => s.z1);
  const zs = streets.filter((s) => Math.abs(s.x1 - s.x2) < 0.01).map((s) => s.x1);
  const hLines = [...new Set(xs)].sort((a, b) => a - b);
  const vLines = [...new Set(zs)].sort((a, b) => a - b);
  const parcels: Parcel[] = [];
  for (let i = 0; i + 1 < hLines.length; i++) {
    for (let j = 0; j + 1 < vLines.length; j++) {
      const p = {
        x1: vLines[j]! + PARCEL_INSET,
        z1: hLines[i]! + PARCEL_INSET,
        x2: vLines[j + 1]! - PARCEL_INSET,
        z2: hLines[i + 1]! - PARCEL_INSET,
      };
      if (p.x2 - p.x1 >= MIN_PARCEL && p.z2 - p.z1 >= MIN_PARCEL) parcels.push(p);
    }
  }
  return parcels;
}

/** Point-to-segment distance, the one primitive every rule below is stated in. */
export function distanceToSegment(px: number, pz: number, s: StreetLine): number {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - s.x1, pz - s.z1);
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (pz - s.z1) * dz) / len2));
  return Math.hypot(px - (s.x1 + dx * t), pz - (s.z1 + dz * t));
}

/**
 * How far a point is from the walking surface: 0 on a street's curb line,
 * growing towards the middle of the block. `distanceToSegment` to every street
 * minus the curb offset — so a figure strolling its sidewalk scores ~0 and a
 * figure that cut across the plot scores several units.
 */
/**
 * The two things the crossing rule needs, and nothing else: the street lines a
 * walker must not cut, and the zebra positions it is allowed to cross at. Both
 * the open world and a built city can hand this over.
 */
export interface StreetRules {
  streets: StreetLine[];
  crosswalks: Crosswalk[];
}

/** Shortest distance from a point to a street's walking band (0 = on the kerb). */
export function distanceToSidewalk(rules: { streets: StreetLine[] }, x: number, z: number): number {
  let best = Infinity;
  for (const s of rules.streets) {
    best = Math.min(best, Math.abs(distanceToSegment(x, z, s) - CURB_OFFSET));
  }
  return best;
}

/** Shortest distance from a point to any edge of the sidewalk graph. */
export function distanceToNetwork(world: OpenWorld, x: number, z: number): number {
  const nodes = world.network.nodes;
  let best = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (const j of a.adj) {
      if (j <= i) continue;
      const b = nodes[j]!;
      best = Math.min(best, distanceToSegment(x, z, { x1: a.x, z1: a.z, x2: b.x, z2: b.z }));
      if (best < 0.0001) return best;
    }
  }
  return best;
}

export function insideParcel(world: OpenWorld, x: number, z: number): Parcel | null {
  for (const p of world.parcels) {
    if (x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2) return p;
  }
  return null;
}

/** Signed distance to a street's centre line, so a sign flip says "crossed". */
function signedSide(x: number, z: number, s: StreetLine): { d: number; along: number } {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const len = Math.max(Math.hypot(dx, dz), 0.001);
  const nx = -dz / len;
  const nz = dx / len;
  const px = x - s.x1;
  const pz = z - s.z1;
  return { d: px * nx + pz * nz, along: (px * dx + pz * dz) / len };
}

/**
 * Is this point at the mouth of a side street? Where two streets meet, the kerb
 * band of one passes over the carriageway of the other, and the sidewalk graph
 * links across that corner — in the built city as here, because both use the
 * same network builder. A step there is a kerb, not a jaywalk; only a crossing
 * in the middle of a block has to be a zebra.
 */
function atStreetMouth(rules: StreetRules, x: number, z: number, except: StreetLine): boolean {
  return rules.streets.some((s) => s !== except && distanceToSegment(x, z, s) <= CURB_OFFSET + 1.2);
}

/**
 * Did the step from A to B cross a street somewhere other than a zebra?
 *
 * A crossing is a sign change of the signed distance to a street's centre line
 * while the step stays inside that street's span. The point where it happens is
 * linearly interpolated and compared against the network's crosswalks. Returns
 * the crossing point when it is off the zebra, null when the step is clean (or
 * never met the asphalt at all).
 */
export function crossesStreetOffCrosswalk(
  rules: StreetRules,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; street: StreetLine } | null {
  for (const s of rules.streets) {
    const a = signedSide(ax, az, s);
    const b = signedSide(bx, bz, s);
    if (a.d === 0 || b.d === 0) continue;
    if (Math.sign(a.d) === Math.sign(b.d)) continue;
    const t = a.d / (a.d - b.d);
    if (t < 0 || t > 1) continue;
    const along = a.along + (b.along - a.along) * t;
    if (along < 0 || along > Math.hypot(s.x2 - s.x1, s.z2 - s.z1)) continue;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const onZebra = rules.crosswalks.some(
      (cw) => Math.hypot(cw.x - x, cw.z - z) <= CROSSWALK_TOLERANCE,
    );
    if (onZebra || atStreetMouth(rules, x, z, s)) continue;
    return { x, z, street: s };
  }
  return null;
}

function streetPaintPlates(streets: StreetLine[], network: SidewalkNetwork): StreetPlate[] {
  const plates: StreetPlate[] = [];
  for (const s of streets) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 3) continue;
    const rotY = -Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
    const ux = (s.x2 - s.x1) / len;
    const uz = (s.z2 - s.z1) / len;
    const nx = -uz;
    const nz = ux;
    const mx = (s.x1 + s.x2) / 2;
    const mz = (s.z1 + s.z2) / 2;
    plates.push({
      x: mx,
      y: ASPHALT_Y,
      z: mz,
      rotY,
      w: len + 3.4,
      h: 0.05,
      d: ASPHALT_WIDTH,
      color: ENV.road,
    });
    for (const side of [1, -1]) {
      plates.push({
        x: mx + nx * CURB_OFFSET * side,
        y: CURB_Y,
        z: mz + nz * CURB_OFFSET * side,
        rotY,
        w: len,
        h: 0.08,
        d: 0.55,
        color: ENV.curb,
      });
    }
    // lane dashes, keeping to the right of the centre line like RoadSystem
    const dashCount = Math.floor(len / 2.6);
    for (let i = 1; i < dashCount; i++) {
      const t = i / dashCount;
      plates.push({
        x: s.x1 + (s.x2 - s.x1) * t + ux * 1.2,
        y: DASH_Y,
        z: s.z1 + (s.z2 - s.z1) * t + uz * 1.2,
        rotY,
        w: 1.1,
        h: 0.04,
        d: 0.3,
        color: ENV.laneDash,
      });
    }
  }
  for (const cw of network.crosswalks) {
    const ux = Math.cos(cw.rotY);
    const uz = -Math.sin(cw.rotY);
    const nx = -uz;
    const nz = ux;
    for (const k of CROSSWALK_BARS) {
      plates.push({
        x: cw.x + nx * k,
        y: ZEBRA_Y,
        z: cw.z + nz * k,
        rotY: cw.rotY,
        w: 2.6,
        h: 0.03,
        d: 0.45,
        color: ENV.crosswalk,
      });
    }
  }
  return plates;
}

/**
 * Where the transit lives, for ANY street list — the city's and the open
 * world's. This is the derivation `Pedestrians` carried inline before: the bus
 * stop on the kerb of the segment whose midpoint is nearest the centre, the
 * taxi curb on a different, fairly central segment. Moved here verbatim so the
 * two worlds cannot drift apart and so the geometry tests below can prove the
 * result sits on a kerb, never in a parcel.
 *
 * The one thing that is NOT arbitrary is the cab's street. Counting into the
 * list (`streets[length / 2]`) picks a segment by position in an array whose
 * order nobody promised: in a ring of four streets plus one inner one it handed
 * the taxi the street opposite the bus — parallel to it, on the far side of the
 * city, so the two transit points never share a junction. The rule that does
 * mean something is the direction: the cab works the first street that runs
 * ACROSS the bus's street, so a ride that starts at the stop sign can end at
 * the kerb, and both worlds get the same answer from the same shape of grid.
 */
export function deriveTransit(streets: StreetLine[]): Transit | null {
  if (streets.length === 0) return null;
  let best = streets[0]!;
  let bestD = Infinity;
  for (const s of streets) {
    const mx = (s.x1 + s.x2) / 2;
    const mz = (s.z1 + s.z2) / 2;
    const d = mx * mx + mz * mz;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  const len = Math.max(Math.hypot(best.x2 - best.x1, best.z2 - best.z1), 0.001);
  const nx = -(best.z2 - best.z1) / len;
  const nz = (best.x2 - best.x1) / len;
  const stopPoint = {
    x: (best.x1 + best.x2) / 2 + nx * 2.1,
    z: (best.z1 + best.z2) / 2 + nz * 2.1,
  };
  // the cab's street: the first one that does not run alongside the bus
  const bx = (best.x2 - best.x1) / len;
  const bz = (best.z2 - best.z1) / len;
  const crossing = streets.find((s) => {
    if (s === best) return false;
    const l = Math.max(Math.hypot(s.x2 - s.x1, s.z2 - s.z1), 0.001);
    return Math.abs(((s.x2 - s.x1) / l) * bx + ((s.z2 - s.z1) / l) * bz) < 0.7;
  });
  const curbSeg = crossing ?? streets[Math.floor(streets.length / 2) % streets.length]!;
  const cl = Math.max(Math.hypot(curbSeg.x2 - curbSeg.x1, curbSeg.z2 - curbSeg.z1), 0.001);
  const cx = -(curbSeg.z2 - curbSeg.z1) / cl;
  const cz = (curbSeg.x2 - curbSeg.x1) / cl;
  const taxiCurb = {
    x: (curbSeg.x1 + curbSeg.x2) / 2 + cx * 1.7,
    z: (curbSeg.z1 + curbSeg.z2) / 2 + cz * 1.7,
  };
  return {
    stopPoint,
    stopSegment: { x1: stopPoint.x, z1: stopPoint.z, x2: best.x2, z2: best.z2 },
    taxiCurb,
    busLane: best,
    taxiLane: curbSeg,
  };
}

/**
 * A kerbside stand at fraction `t` along a street, on the same side as the
 * derived taxi curb. A cab works a few of these along one and the same lane
 * instead of one point forever: it always drives along its street — never over
 * open ground — and it stops where a walker can reach it from the pavement.
 */
export function standOnLane(lane: StreetLine, t: number, offset = 1.7): { x: number; z: number } {
  const len = Math.max(Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1), 0.001);
  const nx = -(lane.z2 - lane.z1) / len;
  const nz = (lane.x2 - lane.x1) / len;
  const c = Math.max(0, Math.min(1, t));
  return {
    x: lane.x1 + (lane.x2 - lane.x1) * c + nx * offset,
    z: lane.z1 + (lane.z2 - lane.z1) * c + nz * offset,
  };
}

let cached: OpenWorld | null = null;

/** The open world, built once and shared: the graph, the plates and the transit
 *  points all have to agree, and a rebuild per render would move the curbs out
 *  from under the figures standing on them. */
export function buildOpenWorld(): OpenWorld {
  if (cached) return cached;
  const streets = openWorldStreets();
  const network = buildSidewalkNetwork(streets);
  const parcels = openWorldParcels(streets);
  const plates = streetPaintPlates(streets, network);
  for (const p of parcels) {
    // pale block pad: the plot a future city will one day stand on
    plates.push({
      x: (p.x1 + p.x2) / 2,
      y: PAD_Y,
      z: (p.z1 + p.z2) / 2,
      rotY: 0,
      w: p.x2 - p.x1,
      h: 0.02,
      d: p.z2 - p.z1,
      color: ENV.plot,
    });
  }
  const world: OpenWorld = {
    streets,
    network,
    parcels,
    plates,
    bounds: OPEN_WORLD_REACH + CURB_OFFSET,
    // six streets always, so the derivation always lands somewhere
    transit: deriveTransit(streets)!,
  };
  cached = world;
  return cached;
}
