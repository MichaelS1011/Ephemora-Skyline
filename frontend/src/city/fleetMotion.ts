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
 * Cruise, or brake for the car ahead. `gap` is the distance between the two
 * centres along the road; `aheadSpeed` is what that car is doing. The target
 * is never above cruise and falls to zero at bumper distance, so a queue stops
 * instead of driving through the car in front.
 */
export function followSpeed(cruise: number, gap: number, aheadSpeed: number): number {
  if (gap <= FLEET_GAP) return 0;
  if (gap >= FLEET_LOOK) return cruise;
  const k = (gap - FLEET_GAP) / (FLEET_LOOK - FLEET_GAP);
  return Math.max(0, Math.min(cruise * k, aheadSpeed + (gap - FLEET_GAP) * 1.5));
}

/** A curve through a intersection is short; long enough to read, quick enough
 *  not to hold the queue behind it. */
export function turnDuration(distance: number): number {
  return Math.max(0.32, Math.min(0.9, 0.26 + distance / 9));
}

export function streetLength(lane: StreetLine): number {
  return lengthOf(lane);
}
