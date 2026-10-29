/**
 * The ambient fleet's driving rules, kept away from the renderer.
 *
 * A car is a point on a street segment, moving in one of the two directions.
 * What it does at the end of a segment — follow the network, turn smoothly,
 * or turn around at a dead end — and how fast it may go behind another car are
 * pure decisions. `RoadSystem` owns the instanced meshes; this module owns the
 * arithmetic, so the rules can be tested without a WebGL context.
 */

import type { StreetLine } from "./layout";

/** Bumper-to-bumper distance the fleet keeps, in world units. */
export const FLEET_GAP = 2.6;
/** From here on a car watches the one ahead instead of running at cruise. */
export const FLEET_LOOK = 7.2;
export const FLEET_ACCEL = 2.4;
export const FLEET_BRAKE = 6;
/** How far a car sits from the street's centreline: the fleet drives on one
 *  side of the road, so the two directions pass each other instead of meeting. */
export const FLEET_LANE_OFFSET = 0.95;
/** The most yaw a corner may ask for per second; it is what turns a tight
 *  junction into a slow one, and a wide one into a fast one. */
export const FLEET_CORNER_YAW = 2.6;
/**
 * How long a car may wait at a junction mouth before it takes its corner
 * anyway. A rule that only ever says "not yet" deadlocks the fleet: measured on
 * the live city, six of twenty-four cars stood still for the whole 24 seconds
 * because each one was waiting for a lane the next one was blocking. A driver
 * blocked that long pulls out, and a background city that freezes is worse than
 * one that occasionally meets a queue close up.
 */
export const FLEET_HOLD_LIMIT = 2.5;

/** A road a car can continue onto at the node it is arriving at. */
export interface FleetContinuation {
  seg: number;
  /** The end of the next segment the car enters: its start (0) or end (1). */
  entryT: 0 | 1;
  dir: 1 | -1;
  /** Signed turn from the incoming heading, in radians. 0 = straight on. */
  angle: number;
}

const lengthOf = (l: StreetLine): number => Math.max(Math.hypot(l.x2 - l.x1, l.z2 - l.z1), 0.001);

const wrap = (a: number): number => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

/**
 * Every segment that starts or ends at `(nodeX, nodeZ)`, except the one the car
 * is already on: that would be a U-turn, and the caller asks for one explicitly
 * when the network offers nothing else. `maxTurn` keeps a car from treating two
 * arms of a fork as a continuation when it would have to double back.
 */
export function streetContinuations(
  lanes: StreetLine[],
  segIndex: number,
  nodeX: number,
  nodeZ: number,
  maxJoin = 0.9,
  maxTurn = 2.35,
): FleetContinuation[] {
  const here = lanes[segIndex];
  if (!here) return [];
  const out: FleetContinuation[] = [];
  for (let i = 0; i < lanes.length; i++) {
    if (i === segIndex) continue;
    const lane = lanes[i]!;
    const d1 = Math.hypot(lane.x1 - nodeX, lane.z1 - nodeZ);
    const d2 = Math.hypot(lane.x2 - nodeX, lane.z2 - nodeZ);
    const entryT: 0 | 1 = d1 <= d2 ? 0 : 1;
    if ((entryT === 0 ? d1 : d2) > maxJoin) continue;
    const dir: 1 | -1 = entryT === 0 ? 1 : -1;
    const atEnd = nodeAtEnd(here, nodeX, nodeZ);
    const current = Math.atan2(
      atEnd ? here.z2 - here.z1 : here.z1 - here.z2,
      atEnd ? here.x2 - here.x1 : here.x1 - here.x2,
    );
    const next = Math.atan2(lane.z2 - lane.z1, lane.x2 - lane.x1);
    const heading = dir === 1 ? next : next + Math.PI;
    const angle = wrap(heading - current);
    if (Math.abs(angle) > maxTurn) continue;
    out.push({ seg: i, entryT, dir, angle });
  }
  return out;
}

function nodeAtEnd(lane: StreetLine, nodeX: number, nodeZ: number): boolean {
  return (
    Math.hypot(lane.x2 - nodeX, lane.z2 - nodeZ) <= Math.hypot(lane.x1 - nodeX, lane.z1 - nodeZ)
  );
}

/**
 * Straight on first, but not always: a fleet where every car takes the
 * straightest arm at every fork is a train. The seed (the car's odometer) lets
 * a car occasionally take the second-straightest road without ever picking a
 * near-U-turn.
 */
export function chooseContinuation(
  choices: FleetContinuation[],
  seed: number,
): FleetContinuation | null {
  if (choices.length === 0) return null;
  const sorted = [...choices].sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
  const window = Math.min(2, sorted.length);
  return sorted[Math.abs(Math.floor(seed)) % window]!;
}

/**
 * How far ahead a car must watch at this cruise: the fixed look band, or the
 * distance it actually needs to stop (`v² / 2·brake`) plus the bumper, whichever
 * is longer. Measured on a six-car platoon whose leader stops dead, with one
 * stalled 100 ms frame: at the fleet's fastest cruise (7,4) the old fixed band
 * left **0,54 units** of margin — the law held, but with nothing in hand. A
 * longer band costs nothing visible and is what keeps the queue honest when a
 * tab wakes up late.
 */
export function followLook(cruise: number): number {
  return Math.max(FLEET_LOOK, (cruise * cruise) / (2 * FLEET_BRAKE) + FLEET_GAP);
}

/**
 * Cruise, or brake for the car ahead. `gap` is the distance between the two
 * centres along the road; `aheadSpeed` is what that car is doing. The target
 * is never above cruise and falls to zero at bumper distance, so a queue stops
 * instead of driving through the car in front.
 */
export function followSpeed(cruise: number, gap: number, aheadSpeed: number): number {
  if (gap <= FLEET_GAP) return 0;
  const look = followLook(cruise);
  if (gap >= look) return cruise;
  const k = (gap - FLEET_GAP) / (look - FLEET_GAP);
  return Math.max(0, Math.min(cruise * k, aheadSpeed + (gap - FLEET_GAP) * 1.5));
}

/**
 * One scripted corner: a cubic Bézier from the outgoing lane of one street to
 * the incoming lane of the next. The two control points sit ON the two travel
 * directions, which is what makes the body leave and arrive pointing where it
 * moves — the quadratic through the junction node did not: it started with a
 * tangent aimed at the node, i.e. 90° sideways to the car's own heading, and the
 * live fleet measured a yaw jump of up to 192 rad/s in a single frame.
 */
export interface FleetCurve {
  fromX: number;
  fromZ: number;
  c1X: number;
  c1Z: number;
  c2X: number;
  c2Z: number;
  toX: number;
  toZ: number;
  /** Polyline length of the curve itself: how far the car actually travels. */
  length: number;
  /** The tightest bend on this path, as 1/radius, sampled along the curve. */
  curvature: number;
}

/**
 * How fast a body may follow a path of this curvature: the speed at which the
 * turn stays followable as a turn (`yaw limit ÷ curvature`), and never below the
 * pace of the fleet's own turnaround — the tightest corner a car here can be
 * asked to drive is the half circle at a dead end. Without that floor a corner
 * the geometry cannot support (see `isDrivable`) demands 0,02 units per second,
 * and a car that is committed to a corner holds its junction while it crawls:
 * measured on the live city, six of twenty-four cars stood still for the whole
 * run. A straight road has no curvature and allows everything the car has.
 */
export function curvatureSpeed(curvature: number): number {
  if (!(curvature > 0)) return Infinity;
  return Math.max(FLEET_CORNER_YAW * FLEET_LANE_OFFSET, FLEET_CORNER_YAW / curvature);
}

/**
 * The tightest radius the fleet sweeps: half a lane offset. A real corner of
 * this shape measures ~1,1 (a cubic through a 90° junction is a little tighter
 * than the arc it approximates), so the limit has room for the corners the
 * network actually offers and still rejects the ones that are not corners.
 */
export const FLEET_MAX_CURVATURE = 2 / FLEET_LANE_OFFSET;

/**
 * Can a car actually drive this path? A corner whose sampled curvature is
 * tighter than a U-turn of one lane offset is not a corner but a loop: the two
 * lane ends meet at the junction on sides that force the path back over itself
 * (a car turning one way at a crossroads lands on the far side of the street it
 * enters, which is behind where it started). Those corners keep the old shape,
 * which does not loop, and get fixed properly when the fleet gets a junction
 * model that starts a turn before the node.
 */
export function isDrivable(curve: FleetCurve): boolean {
  return curve.curvature <= FLEET_MAX_CURVATURE;
}

/**
 * The fallback through a corner that cannot be swept: both handles at the node.
 * It is the shape the fleet shipped with — it never loops, and its cost is that
 * the body leaves the street pointing at the junction rather than along it.
 */
export function nodeCorner(
  fromX: number,
  fromZ: number,
  nodeX: number,
  nodeZ: number,
  toX: number,
  toZ: number,
): FleetCurve {
  const base: FleetCurve = {
    fromX,
    fromZ,
    c1X: nodeX,
    c1Z: nodeZ,
    c2X: nodeX,
    c2Z: nodeZ,
    toX,
    toZ,
    length: 0,
    curvature: 0,
  };
  return { ...base, ...curveMetrics(base) };
}

/** Length and peak curvature of a cubic, sampled along itself. */
function curveMetrics(c: FleetCurve): { length: number; curvature: number } {
  let length = 0;
  let curvature = 0;
  let px = c.fromX;
  let pz = c.fromZ;
  let prev = curveAt(c, 0);
  for (let i = 1; i <= 16; i++) {
    const p = curveAt(c, i / 16);
    const ds = Math.hypot(p.x - px, p.z - pz);
    length += ds;
    if (ds > 1e-6) {
      let da = Math.atan2(p.tz, p.tx) - Math.atan2(prev.tz, prev.tx);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      curvature = Math.max(curvature, Math.abs(da) / ds);
    }
    prev = p;
    px = p.x;
    pz = p.z;
  }
  return { length: Math.max(length, 0.25), curvature };
}

/**
 * Turn a heading toward a target by at most `maxStep` radians, the short way
 * round. A body that changes heading faster than this is not turning, it is
 * cutting — which is what a scripted corner pose asks for when the street it
 * leaves and the street it enters cannot be joined by a sweepable path.
 */
export function slewYaw(current: number, target: number, maxStep: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return current + d;
}

/**
 * How far before a node a car must be to still reach this corner speed at the
 * junction: the braking distance for the step, plus a metre of slack so the
 * brake is finished rather than still falling as the nose swings in. Measured
 * the other way round on the shipped fleet, which decided the corner AT the
 * node: the speed step landed in a single frame — up to 473 units/s².
 */
export function cornerLook(cruise: number, cornerSpeed: number): number {
  const d = (cruise * cruise - cornerSpeed * cornerSpeed) / (2 * FLEET_BRAKE);
  return Math.max(0, d) + 0.6;
}

/**
 * The corner through a junction. `inX/inZ` is the heading the car arrives with
 * and `outX/outZ` the one it leaves with — both unit, both along travel.
 */
export function cornerCurve(
  fromX: number,
  fromZ: number,
  inX: number,
  inZ: number,
  toX: number,
  toZ: number,
  outX: number,
  outZ: number,
): FleetCurve {
  const chord = Math.hypot(toX - fromX, toZ - fromZ);
  // A third of the chord is the classic tangent handle: enough to keep the curve
  // inside the junction, little enough that it does not bulge back out of it.
  // Longer handles were tried and are worse: a corner whose ends and tangents
  // cannot be joined without doubling back loops harder the further the handles
  // reach. `isDrivable` below is what rejects that case instead.
  const h = chord / 3;
  const base = {
    fromX,
    fromZ,
    c1X: fromX + inX * h,
    c1Z: fromZ + inZ * h,
    c2X: toX - outX * h,
    c2Z: toZ - outZ * h,
    toX,
    toZ,
    length: 0,
    curvature: 0,
  };
  return { ...base, ...curveMetrics(base) };
}

/**
 * A continuation this straight is not a corner: the two lane ends sit on the
 * same line, so the handover from one street to the next is the whole
 * manoeuvre, and a curve through it would be a point. Anything sharper gets a
 * curve, because a kink is where a car's nose has to travel.
 */
export function isStraightOn(angle: number): boolean {
  return Math.abs(angle) < 0.12;
}

/** Where the corner puts a car at `k` (0…1), and the direction it points there. */
export function curveAt(
  c: FleetCurve,
  k: number,
): { x: number; z: number; tx: number; tz: number } {
  const u = 1 - k;
  const x = u * u * u * c.fromX + 3 * u * u * k * c.c1X + 3 * u * k * k * c.c2X + k * k * k * c.toX;
  const z = u * u * u * c.fromZ + 3 * u * u * k * c.c1Z + 3 * u * k * k * c.c2Z + k * k * k * c.toZ;
  let dx =
    3 * u * u * (c.c1X - c.fromX) + 6 * u * k * (c.c2X - c.c1X) + 3 * k * k * (c.toX - c.c2X);
  let dz =
    3 * u * u * (c.c1Z - c.fromZ) + 6 * u * k * (c.c2Z - c.c1Z) + 3 * k * k * (c.toZ - c.c2Z);
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  return { x, z, tx: dx, tz: dz };
}

/** The dead-end turnaround: a half circle of one lane offset around the node. */
export function turnAroundLength(): number {
  return Math.PI * FLEET_LANE_OFFSET;
}
/** Its curvature is the circle's own — 1 over the lane offset, everywhere. */
export function turnAroundSpeed(): number {
  return curvatureSpeed(1 / FLEET_LANE_OFFSET);
}

export function streetLength(lane: StreetLine): number {
  return lengthOf(lane);
}
