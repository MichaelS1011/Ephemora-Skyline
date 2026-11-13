/**
 * Discrete zoom steps for the whole-level overview.
 *
 * A continuous dolly spends most of its travel between two pixel grids, which
 * is why a facade edge never stops shimmering. The overview snaps to a short
 * ladder of distances instead: each notch is a real step, and one wheel event
 * means one step, not a fraction of a step. The ladder is geometric so the
 * visual change is even from the first notch to the last.
 */

export const OVERVIEW_ZOOM_FACTORS = [
  0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.8, 2, 2.25, 2.5, 2.8, 3.2, 3.6, 4, 5,
] as const;

/** How far one wheel delta moves the free camera, in world units per delta
 *  unit per metre of reach. It used to be 0.012; at a 100 px trackpad event
 *  that was a 5–23 m jump depending on height, which read as a cut rather
 *  than a dolly. */
export const WHEEL_DOLLY_RATE = 0.004;

/** No single wheel event may move the camera farther than this. Momentum on a
 *  trackpad can deliver a large delta in one event; the step has to stay a
 *  step, not a flight. */
export const WHEEL_DOLLY_MAX_STEP = 2.2;

export type ZoomDirection = -1 | 1;

/**
 * One free-flight dolly step along the view direction.
 *
 * Positive is forward (wheel up / scroll in); negative is backward. The reach
 * grows with eye height so the same gesture still crosses a tall overview,
 * while the cap keeps a single event from becoming a jump.
 */
export function freeDollyStep(deltaY: number, eyeHeight: number): number {
  const reach = Math.max(2, eyeHeight * 0.15 + 4);
  const raw = -deltaY * WHEEL_DOLLY_RATE * reach;
  return Math.max(-WHEEL_DOLLY_MAX_STEP, Math.min(WHEEL_DOLLY_MAX_STEP, raw));
}

/**
 * Wheel deltas grow downward, so scrolling up (negative delta) moves the
 * camera closer and scrolling down moves it away. Kept here, next to the
 * ladder, because inverting it once is enough to make the whole overview feel
 * backwards.
 */
export function overviewZoomDirection(deltaY: number): ZoomDirection {
  return deltaY < 0 ? -1 : 1;
}

/**
 * The next overview distance, in world units.
 *
 * `current` is the camera's distance from the level pivot. The nearest rung is
 * found first (so a camera that arrived from a flight or an address starts on
 * the ladder instead of jumping), then `direction` moves one rung: `-1` toward
 * the city, `1` away from it. A wheel outside the ladder is left untouched:
 * near the street the live dolly is more useful than a step that could put the
 * camera inside a wall.
 */
export function overviewZoomDistance(
  bounds: number,
  current: number,
  direction: ZoomDirection,
): number {
  if (!(bounds > 0) || !(current > 0)) return current;
  const min = bounds * OVERVIEW_ZOOM_FACTORS[0]!;
  const max = bounds * OVERVIEW_ZOOM_FACTORS[OVERVIEW_ZOOM_FACTORS.length - 1]!;
  if (current < min * 0.98) return current;
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < OVERVIEW_ZOOM_FACTORS.length; i++) {
    const d = Math.abs(bounds * OVERVIEW_ZOOM_FACTORS[i]! - current);
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  const next = Math.max(
    0,
    Math.min(OVERVIEW_ZOOM_FACTORS.length - 1, nearest + Math.sign(direction)),
  );
  return Math.max(min, Math.min(max, bounds * OVERVIEW_ZOOM_FACTORS[next]!));
}
