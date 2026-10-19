/**
 * The reduced-motion signal, shared by every render loop.
 *
 * `prefers-reduced-motion` was already honoured by the DOM stylesheet
 * (design/globals.css) and by the camera rig, but the eight `useFrame` loops
 * that animate the city itself knew nothing about it — so a person who asked
 * the system for stillness still got a walking crowd, driving cars, pulsing
 * alarms and a flicker on every facade. Motion that is applied to everything
 * is not a cue: it is noise a reader has to filter out for hours.
 *
 * This module is the ONE reader of the media query. The loops call
 * `prefersReducedMotion()` (a cached boolean, free per frame) instead of each
 * calling `matchMedia` themselves, and `reducedSettle()` gives them the same
 * answer to "what does reduced mean here": run the frame's settle logic once,
 * then stop writing. Each loop decides its own settle state — that part is a
 * design decision, not something this module can generalise.
 *
 * Deliberately not a store field: a store write on a media-query change would
 * re-render every subscribed component (hundreds of buildings), while the
 * loops only need to read a boolean when they run.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

let cached = false;
let listening = false;
const subscribers = new Set<() => void>();

function readMedia(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    // No media support (old webview, test env without matchMedia) → full motion.
    return false;
  }
}

function attach(): void {
  if (listening || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  listening = true;
  try {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener?.("change", () => {
      cached = readMedia();
      for (const cb of subscribers) cb();
    });
  } catch {
    // Safari < 14 has addListener only; the value read at module load still holds.
  }
}

/**
 * Re-read the query. The loops read the cached value, so a flip only reaches
 * them through this refresh — called by the media listener above and once at
 * module load. Exported for the test environment, where no listener is wired.
 */
export function refreshReducedMotion(): boolean {
  cached = readMedia();
  attach();
  return cached;
}

refreshReducedMotion();

/** True while the user has asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return cached;
}

/**
 * The transparency twin of the motion request. Apple's Materials page binds an
 * obligation to a translucent material: where the user asks for less
 * transparency, the material goes solid — `globals.css` pins both tokens
 * opaque on this query, and `render/useGlassStage.ts` stands the adaptive stage
 * off while it holds. Read per call: the sampler runs on a 450 ms timer, not
 * per frame, and a flip should reach it without a second cache to keep true.
 */
export const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

export function prefersReducedTransparency(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(REDUCED_TRANSPARENCY_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * The narrow-window rule, shared by anything that must choose between the
 * wide layout and the compact one (the scan summary opens as a strip below
 * it). 520 px is the breakpoint the header already folds at (stadt-ui.css),
 * so the two rules cannot disagree about where "narrow" starts. Read per
 * call — this is a window-state question, not a per-frame one.
 */
export function narrowChromeWindow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(max-width: 520px)").matches;
  } catch {
    return false;
  }
}

/** How long a beacon may breathe after its building mounts, and how long the
 *  breath takes to settle. Measured on the running demo: the idle pulse is the
 *  only *periodic* motion in the scene (everything else — fleet, residents —
 *  crosses and is gone), with a 1,3 s period and a 0,8×–1,4× swing that never
 *  stopped. `layout.ts` already states the rule for the reveal pulse: the pulse
 *  is evidence, never decoration. A pulse that runs forever is decoration. */
export const BEACON_BREATH_HOLD_S = 10;
export const BEACON_BREATH_DECAY_S = 6;

/** 1 while the breath is at full swing, 0 once the marker has settled. */
export function beaconBreath(ageS: number): number {
  if (!(ageS > BEACON_BREATH_HOLD_S)) return 1;
  return Math.max(0, 1 - (ageS - BEACON_BREATH_HOLD_S) / BEACON_BREATH_DECAY_S);
}

/**
 * The beacon's scale for a clock reading `tS`, its per-building `seed`, and the
 * building's own `ageS`. While the breath is full this is exactly the curve the
 * beacon had before (`0,8 + 0,6·|sin|`); once settled it is a steady 1 — the
 * marker stays where it was, only the movement leaves it.
 */
export function beaconIdleScale(tS: number, seed: number, ageS: number): number {
  return 1 + beaconBreath(ageS) * (Math.abs(Math.sin(tS * 2.4 + seed)) * 0.6 - 0.2);
}

/** React subscription for anything that must re-render when the flag flips. */
export function subscribeReducedMotion(cb: () => void): () => void {
  attach();
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Snapshot getter for `useSyncExternalStore`. */
export function getReducedMotionSnapshot(): boolean {
  return cached;
}

/**
 * The per-loop policy helper: while motion is reduced, run `settle` exactly
 * once (so nothing is left unplaced or invisible) and return true — the caller
 * skips its animation for this frame. When motion comes back the flag re-arms,
 * so the next reduced period settles again.
 */
export function reducedSettle(settled: { current: boolean }, settle: () => void): boolean {
  if (!cached) {
    settled.current = false;
    return false;
  }
  if (!settled.current) {
    settle();
    settled.current = true;
  }
  return true;
}
