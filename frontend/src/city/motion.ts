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
