/**
 * Discrete zoom steps for the whole-level overview.
 *
 * A continuous dolly spends most of its travel between two pixel grids, which
 * is why a facade edge never stops shimmering. The overview snaps to a short
 * ladder of distances instead: each notch is a real step, and one wheel event
 * means one step, not a fraction of a step. The ladder is geometric so the
 * visual change is even from the first notch to the last.
 */

export const OVERVIEW_ZOOM_FACTORS = [0.8, 1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5] as const;

export type ZoomDirection = -1 | 1;

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
