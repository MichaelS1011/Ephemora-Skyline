/**
 * How a test waits for — and warms — the lazily loaded 3D chunk.
 *
 * WHY THIS FILE EXISTS. Since Batch 2 (2026-11-23) the 3D world, the vitrine
 * and the teaching-board copy arrive through `React.lazy` / dynamic `import()`.
 * Two things went wrong in the suite and both are fixed here, in one place
 * instead of five copies.
 *
 * 1. THE WAIT WAS TOO SHORT. Five files switched to real clocks and polled in a
 *    fixed `100 × 10 ms` loop. One second of wall time is enough on an idle
 *    laptop and not enough on a loaded runner: `arrival-budget` passed alone
 *    three times and failed once inside the full suite on 2026-11-23.
 *    `settleLazy` gives five seconds and returns `false` instead of throwing,
 *    so a case that legitimately renders nothing is not turned into an error.
 *
 * 2. THE GRAPH WAS LOADED TWICE AT ONCE. `three` ships a CJS entry
 *    (`three.cjs`) that `require()`s `three.module.js`. Two *concurrent*
 *    dynamic imports of that graph can meet it mid-load and Node answers:
 *
 *      Unexpected module status 0. Cannot require() ES Module … three.module.js
 *      because it is not yet fully loaded. This may be caused by a race
 *      condition if the module is simultaneously dynamically import()-ed.
 *
 *    `React.lazy` resolves its imports when it pleases, and a case that
 *    switches to fake timers can freeze one halfway while the next case starts
 *    another. `warmThree` loads the graph once, sequentially, before any case
 *    freezes the clock, so every later `import()` is a cache hit. This is a
 *    property of the test runtime; a browser resolves the same imports natively.
 *
 * THE CALLER OWNS THE CLOCK for `settleLazy`: switch to real timers before
 * calling and back to fake ones after.
 */
import { act } from "react";

export async function settleLazy(
  ready: () => boolean,
  budgetMs = 5000,
  stepMs = 10,
): Promise<boolean> {
  const until = Date.now() + budgetMs;
  for (;;) {
    if (ready()) return true;
    if (Date.now() >= until) return false;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    });
  }
}

let warmed: Promise<void> | null = null;

export function warmThree(): Promise<void> {
  warmed ??= (async () => {
    await import("../../src/components/WorldCanvas");
    await import("../../src/components/EphePreview");
    await import("../../src/city/teachBoards");
  })();
  return warmed;
}
