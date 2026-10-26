/**
 * Auto-Gfx: the frame budget decides, not the settings menu.
 *
 * gfxLite exists as a manual switch — which means it only ever helps the
 * visitor who finds it, reads it and trusts it. The weaker machines, the ones
 * that actually need the drop, are the ones whose owners never open settings.
 * So the renderer watches its own frame times and steps down (and back up)
 * without being asked.
 *
 * The rules, all of them deliberate:
 *  - the window is the LAST N frame times, the decision reads the MEDIAN —
 *    one GC pause or one tab-switch must not dim the city for anyone;
 *  - down the slope is quick (1.5 s of ≥ 22.2 ms ≈ under 45 fps), up the
 *    slope is slow (6 s of ≤ 17.5 ms ≈ over 57 fps). The asymmetry is the
 *    hysteresis: a machine sitting exactly on a threshold must not flicker
 *    the bloom on and off, and relief arrives faster than privilege;
 *  - a hand on the manual switch ends the automation for the visit — the
 *    same law the construction crane follows: a control that steals back
 *    what the user chose is a bug, whatever it was meant to fix.
 */

/** Frame time (ms) at or above which a frame counts as struggling: ~45 fps. */
export const STRUGGLE_MS = 22.2;
/** Frame time (ms) at or below which a frame counts as healthy: ~57 fps. */
export const HEALTHY_MS = 17.5;
/** Consecutive struggling frames before the drop (~1.5 s at 60 fps). */
export const DROP_AFTER = 90;
/** Consecutive healthy frames before the return (~6 s at 60 fps). */
export const RAISE_AFTER = 360;
/** How many frame times the decision looks at. */
export const WINDOW = 120;

export type GfxMove = "hold" | "toLite" | "toFull";

/** Median of a (small, unsorted) window — no allocation-per-frame sort. */
export function medianOf(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/**
 * The window as a rate, for the header.
 *
 * Deliberately the same median the governor decides from, not a second
 * counter: two numbers for one quantity is how a readout ends up disagreeing
 * with the switch that is named after it. Null while the window is still
 * filling — a rate measured over the frames since the last tab switch is a
 * guess about the machine, so the header says nothing rather than that.
 */
export function frameHz(samples: readonly number[]): number | null {
  if (samples.length < WINDOW) return null;
  const ms = medianOf(samples);
  if (!(ms > 0) || !Number.isFinite(ms)) return null;
  return Math.round(1000 / ms);
}

/**
 * One step of the machine: `lite` is the current state, `samples` the newest
 * WINDOW frame times, `streak` how many consecutive frames already matched
 * the pending direction. Returns the move and the streak to carry forward.
 */
export function autoGfxDecision(
  lite: boolean,
  samples: readonly number[],
  streak: number,
): { move: GfxMove; streak: number } {
  if (samples.length < WINDOW) return { move: "hold", streak };
  const m = medianOf(samples);
  if (!lite) {
    if (m >= STRUGGLE_MS) {
      const next = streak + 1;
      return next >= DROP_AFTER ? { move: "toLite", streak: 0 } : { move: "hold", streak: next };
    }
    return { move: "hold", streak: 0 };
  }
  if (m <= HEALTHY_MS) {
    const next = streak + 1;
    return next >= RAISE_AFTER ? { move: "toFull", streak: 0 } : { move: "hold", streak: next };
  }
  return { move: "hold", streak: 0 };
}
