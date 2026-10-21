/**
 * The edges of a walk — where a figure starts, stops and turns.
 *
 * The citizens already follow the sidewalk graph and their stride advances with
 * the DISTANCE they covered, so they never slide their feet. What still read as
 * machine-made was the moment of change: legs jumping from still to mid-stride
 * in a single frame, freezing apart on arrival, a body pivoting on stiff legs at
 * a corner, and full speed arriving in one step.
 *
 * These three functions are the whole fix, and they are pure so the frame loop
 * can stay as thin as it is.
 */

/** Move `current` toward `target`, at most `perSecond` of change per second. */
export function ramp(current: number, target: number, perSecond: number, dt: number): number {
  const max = perSecond * dt;
  const next = current + Math.max(-max, Math.min(max, target - current));
  // A ramp that lands exactly on the target keeps the caller from chasing an
  // ever-shrinking remainder for the rest of the run.
  if (target > current ? next >= target : next <= target) return target;
  return next;
}

/** How much of a stride a figure is allowed to show: 0 standing, 1 walking. */
export const STRIDE_RAMP = 4;

export function strideBlend(prev: number, moving: boolean, dt: number): number {
  return ramp(prev, moving ? 1 : 0, STRIDE_RAMP, dt);
}

/**
 * A small in-place march for the seconds a figure spends turning.
 *
 * Turning with locked legs is the single most robotic thing a body does; the
 * amplitude stays well under a walking stride so the pivot reads as adjusting
 * footing rather than sprinting on the spot.
 */
export function pivotMarch(phase: number): number {
  return Math.sin(phase * 2.4) * 0.4;
}

/** Per-second approach of walking speed toward its target. */
export const ACCEL = 5;

/**
 * Radians of gait phase per unit of body travel, divided by the resident's
 * height. At the walking speed (1.35 units/s) this is about 2.4 steps a
 * second — a walk. The same rate at the old 2.3 units/s was four steps a
 * second, a scurry; the speed was the defect, not the phase rate.
 */
export const GAIT_RATE = 5.5;

/** How high the swinging foot clears the ground, in local units. */
export const FOOT_LIFT = 0.055;

const TAU = Math.PI * 2;

export function wrapPhase(phase: number): number {
  const p = phase % TAU;
  return p < 0 ? p + TAU : p;
}

export interface FootCycle {
  /** Local forward/back of the foot. During stance it travels exactly the
   *  distance the body travels, so the planted foot holds its ground spot. */
  z: number;
  /** Ground clearance, 0 during stance. */
  lift: number;
  /** The knee leads the swinging leg, never the planted one. */
  kneeLead: number;
}

/**
 * One foot through stance and swing.
 *
 * Stance is linear on purpose: the body moves at a constant speed, so a local
 * foot that moves back at the same rate is stationary in the world. The swing
 * eases away from and back onto the ground, and the knee leads only while the
 * foot is in the air. The two feet are half a cycle apart.
 */
export function footCycle(phase: number, side: -1 | 1, strideAmp: number): FootCycle {
  const p = wrapPhase(phase + (side === -1 ? Math.PI : 0));
  if (p < Math.PI) {
    return {
      z: strideAmp - (2 * strideAmp * p) / Math.PI,
      lift: 0,
      kneeLead: 0.022,
    };
  }
  const swing = p - Math.PI;
  const lift = Math.sin(swing) * FOOT_LIFT;
  return {
    z: -strideAmp + strideAmp * (1 - Math.cos(swing)),
    lift,
    kneeLead: 0.022 + lift * 0.9,
  };
}

/**
 * The local stride amplitude whose stance foot is world-stationary.
 *
 * A half cycle moves the body `π · tall / GAIT_RATE`; the foot is drawn with
 * `footZ * width`, so the local amplitude is that half-distance divided by
 * the figure's width. Smaller figures take the same world step; broad ones
 * take a shorter local one, not a wider world one.
 */
export function strideAmplitude(tall: number, width: number): number {
  return (Math.PI * tall) / (2 * GAIT_RATE * Math.max(0.01, width));
}

/** How close another resident may come before a walker gives ground. */
export const PERSONAL_RADIUS = 0.9;
/** The furthest the visual space-keeping moves a walker sideways. */
export const PERSONAL_PUSH = 0.3;
/** A follower slows, but never freezes the street behind a slower resident. */
export const PERSONAL_PACE_FLOOR = 0.25;

export interface SocialNeighbor {
  x: number;
  z: number;
  angle: number;
  /** True while the neighbour is actually progressing, not standing or chatting. */
  moving: boolean;
}

export interface SocialStep {
  pushX: number;
  pushZ: number;
  /** 1 = full pace, < 1 = ease behind a resident ahead. */
  pace: number;
}

/**
 * Personal space for one walker.
 *
 * Three rules, all local and cheap:
 * - A resident ahead or beside pushes the walker AWAY from the side it is on:
 *   someone on the right moves the walker left, someone on the left moves it
 *   right. Only when the two are exactly centred does the walker take its own
 *   RIGHT — so a head-on pair still passes on opposite sides of the world
 *   instead of stopping nose to nose.
 * - A resident behind gets no push: a follower is the follower's problem, not
 *   a reason for the leader to drift off the kerb.
 * - A resident ahead that is standing still, or walking the same way, sets the
 *   pace. A resident coming the other way does not: the side-step is the
 *   passing rule, not a stand-off.
 *
 * The push is a render offset, not a path rewrite: the network, crosswalk and
 * door contracts stay exactly as they were. The caller smooths the offset.
 */
export function socialStep(
  x: number,
  z: number,
  angle: number,
  neighbors: readonly SocialNeighbor[],
  out: SocialStep,
  limit = neighbors.length,
): SocialStep {
  out.pushX = 0;
  out.pushZ = 0;
  out.pace = 1;
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  // The walker's own right. A head-on pair's right points to opposite sides.
  const rightX = forwardZ;
  const rightZ = -forwardX;
  for (let i = 0; i < limit; i++) {
    const n = neighbors[i]!;
    const dx = n.x - x;
    const dz = n.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > PERSONAL_RADIUS * PERSONAL_RADIUS) continue;
    // A walker is not its own neighbour; two exact overlaps are rare and the
    // next frame separates them once one of them moves.
    if (d2 < 1e-8) continue;
    const dist = Math.sqrt(d2);
    const ahead = dx * forwardX + dz * forwardZ;
    // Someone behind is not the leader's problem: no drift for a follower.
    if (ahead < -0.15) continue;
    const strength = 1 - dist / PERSONAL_RADIUS;
    const lateral = dx * rightX + dz * rightZ;
    // Away from an off-centre neighbour; centred pairs use the right-hand pass.
    const away = Math.abs(lateral) > 0.12 ? -Math.sign(lateral) : 1;
    out.pushX += rightX * away * PERSONAL_PUSH * strength;
    out.pushZ += rightZ * away * PERSONAL_PUSH * strength;
    if (ahead <= 0.05) continue;
    const sameWay = n.moving && forwardX * Math.sin(n.angle) + forwardZ * Math.cos(n.angle) > 0.25;
    if (!n.moving || sameWay) {
      out.pace = Math.min(out.pace, Math.max(PERSONAL_PACE_FLOOR, dist / PERSONAL_RADIUS));
    }
  }
  const magnitude = Math.hypot(out.pushX, out.pushZ);
  if (magnitude > PERSONAL_PUSH) {
    out.pushX = (out.pushX / magnitude) * PERSONAL_PUSH;
    out.pushZ = (out.pushZ / magnitude) * PERSONAL_PUSH;
  }
  return out;
}
