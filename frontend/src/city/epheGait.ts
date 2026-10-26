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

/**
 * The same 0.4, as a fraction of a full stride, for the FOOT.
 *
 * `pivotMarch` only ever shaped the scalar `stride` the caller uses for the
 * body bob; the feet are written from `footCycle`, which takes its amplitude
 * as an argument and was always handed the walking one. So a resident stopped
 * mid-corner to change kerb took a full 0.29-unit step on the spot — 6.4 px of
 * foot travel at the size a resident is actually seen, on a figure that is not
 * going anywhere. The pivot's footing is now 2.5 px.
 */
export const PIVOT_STRIDE = 0.4;

/**
 * Signed fore-aft travel of one hand, in units of the arm's amplitude.
 *
 * The planted foot cycle is a triangle wave through +amp at gait 0, −amp at π:
 * it peaks on the quarter-points of `sin`. A hand driven by `sin(gait)` therefore
 * reaches full swing exactly when the legs cross, and the figure shows its arms
 * and its legs taking turns — the one combination that never happens on a body.
 * Cosine puts the right hand back at the instant the right foot is forward,
 * which is the contralateral half of a walk and the whole reason an arm swing
 * is legible at all.
 */
export function armSwing(gaitPhase: number, side: -1 | 1): number {
  return -side * Math.cos(gaitPhase);
}

/**
 * The greeting hand, in local units of the 1.35-tall figure.
 *
 * A resident is 20 px tall at the small end of the measured band and 30 px at
 * the large end, so the wave is the one signal on the figure that has to be
 * legible as MOTION rather than as shape — and motion at 20 px is only there if
 * a mass crosses a few pixels of screen. The shipped wave moved the hand 0.035
 * units sideways, 1.6 px peak to peak, with the hand inside the head's own
 * column. These numbers are set against both ends of the band, and the arc is
 * the point: a hand that only slides sideways reads as a shift, one that comes
 * down as it goes out reads as a wave.
 */
export const WAVE = {
  /** The hand's height at the top of its arc: 0.14 above the crown. */
  handY: 1.49,
  /** How far it sinks at the far ends of the arc. */
  dip: 0.03,
  /** The hand's distance from the body's centre line, at the middle of the arc. */
  centre: 0.345,
  /** Half the sideways travel. */
  reach: 0.095,
  /** Fore-aft, so the arm is out in front of the shoulder and not beside it. */
  forward: 0.16,
  /** Beats per greeting cycle relative to the caller's clock. */
  rate: 1.6,
} as const;

/** Sideways offset of the waving hand, added to `WAVE.centre`. */
export function waveLateral(phase: number): number {
  return Math.sin(phase * WAVE.rate) * WAVE.reach;
}

/**
 * Height of the waving hand over the same phase: the arc's other half.
 *
 * This was `(1 - cos)`, a quarter period off the lateral sine — so over a beat
 * the two were uncorrelated (measured Pearson r = +0.06) and the hand traced a
 * closed loop rather than a lifted arc: it came back in at the same height it
 * went out at. Driving the height from the lateral offset itself makes the
 * gesture what the comment above `WAVE.reach` promises — out is down, in is up
 * — and keeps the lowest point at `handY - dip`, clear of the crown.
 */
export function waveHeight(phase: number): number {
  return WAVE.handY - (waveLateral(phase) / WAVE.reach) * WAVE.dip;
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

/**
 * MASTER-2027 §07.11 — the look-around a resident takes when it arrives.
 *
 * A guide that reaches a building and freezes has ended its errand but not its
 * sentence: nothing on the screen says "this is the place, and this is the
 * block around it". One sweep of the shoulders says it. It is deliberately a
 * *body* turn and not a head turn: the head is 0,26 units across and the face
 * band moves 1,08 px for the ±0,3 rad idle glance (`ephe-readability.test.ts`),
 * so a glance — however wide — is under the pixel this world can show, while a
 * 44° shoulder turn changes a 9-px silhouette by about a third of its width.
 */
export const UMSEHEN = {
  /** Seconds from "the target is in front of me" to "I am facing it again". */
  dauer: 3.4,
  /** Peak shoulder offset in radians (0,77 rad = 44° once the envelope is on). */
  bogen: 1.1,
} as const;

/**
 * The sweep at progress `f` (0 = arrival, 1 = home again), in radians.
 *
 * Two sines multiplied: `sin(2πf)` is the look left-then-right, `sin(πf)` is an
 * envelope that starts and ends at zero with zero slope, so neither end of the
 * movement is a jolt. Outside [0,1) — including a NaN progress — it is exactly
 * zero, which is what makes a stopped simulation clock (reduced motion) a
 * figure that never left its target.
 */
export function umsehenBogen(f: number): number {
  if (!(f > 0) || f >= 1) return 0;
  return Math.sin(f * Math.PI * 2) * Math.sin(f * Math.PI) * UMSEHEN.bogen;
}
