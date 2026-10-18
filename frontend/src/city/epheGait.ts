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
