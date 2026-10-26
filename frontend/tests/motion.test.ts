// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { city, dir, file, finding } from "./helpers/cityFixture";

/**
 * `prefers-reduced-motion` was honoured by the stylesheet and the camera rig
 * only. The render loops that animate the city itself never looked at it, so
 * the one accessibility promise the app made about motion did not cover the
 * motion the app is actually about. These tests pin the shared signal the loops
 * read instead of each re-inventing the query.
 */

type Listener = (e: { matches: boolean }) => void;

function installMedia(initial: boolean): { set(v: boolean): void } {
  const listeners = new Set<Listener>();
  const state = { matches: initial };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return state.matches;
      },
      addEventListener: (_: string, cb: Listener) => listeners.add(cb),
      removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    }),
  });
  return {
    set(v: boolean) {
      state.matches = v;
      for (const cb of [...listeners]) cb({ matches: v });
    },
  };
}

function removeMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

async function load(matches: boolean) {
  vi.resetModules();
  const media = installMedia(matches);
  const mod = await import("../src/city/motion");
  return { media, mod };
}

describe("the shared reduced-motion signal", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("reads the media query once and caches it", async () => {
    const { mod } = await load(true);
    expect(mod.prefersReducedMotion()).toBe(true);
    expect(mod.getReducedMotionSnapshot()).toBe(true);
  });

  it("answers false when the environment has no matchMedia at all", async () => {
    vi.resetModules();
    removeMedia();
    const mod = await import("../src/city/motion");
    expect(mod.prefersReducedMotion()).toBe(false);
    expect(mod.reducedSettle({ current: false }, () => {})).toBe(false);
  });

  it("follows the system when it flips mid-session", async () => {
    const { media, mod } = await load(false);
    expect(mod.prefersReducedMotion()).toBe(false);
    media.set(true);
    expect(mod.prefersReducedMotion(), "the loops read the cached value").toBe(true);
    media.set(false);
    expect(mod.prefersReducedMotion()).toBe(false);
  });

  it("notifies subscribers, and stops after unsubscribe", async () => {
    const { media, mod } = await load(false);
    const seen: boolean[] = [];
    const off = mod.subscribeReducedMotion(() => seen.push(mod.prefersReducedMotion()));
    media.set(true);
    off();
    media.set(false);
    expect(seen).toEqual([true]);
  });

  it("settles each loop exactly once while motion is reduced", async () => {
    const { mod } = await load(true);
    const settled = { current: false };
    let runs = 0;
    const settle = () => {
      runs++;
    };
    expect(mod.reducedSettle(settled, settle)).toBe(true);
    mod.reducedSettle(settled, settle);
    mod.reducedSettle(settled, settle);
    expect(runs, "a settle write is a one-time placement, not a per-frame job").toBe(1);
  });

  it("re-arms the settle when motion comes back, and never settles in full motion", async () => {
    const { media, mod } = await load(true);
    const settled = { current: false };
    let runs = 0;
    mod.reducedSettle(settled, () => runs++);
    expect(runs).toBe(1);
    media.set(false);
    expect(
      mod.reducedSettle(settled, () => runs++),
      "full motion runs the loop",
    ).toBe(false);
    expect(settled.current, "the flag re-arms so the next reduced period settles").toBe(false);
    media.set(true);
    expect(mod.reducedSettle(settled, () => runs++)).toBe(true);
    expect(runs).toBe(2);
  });
});

describe("the beacon's idle breath, and the transparency request", () => {
  it("keeps the old curve while it breathes and rests the marker afterwards", async () => {
    // Measured on the running demo: the beacon's 1,3 s breath was the scene's
    // only *periodic* motion — fleet and residents cross and are gone — and it
    // never stopped. `layout.ts` already states the rule for the reveal pulse:
    // evidence, never decoration.
    const { beaconBreath, beaconIdleScale, BEACON_BREATH_HOLD_S, BEACON_BREATH_DECAY_S } =
      await import("../src/city/motion");
    for (const t of [0, 0.31, 0.7, 1.31, 4.9]) {
      expect(beaconIdleScale(t, 0.4, 0)).toBeCloseTo(
        0.8 + Math.abs(Math.sin(t * 2.4 + 0.4)) * 0.6,
        10,
      );
    }
    for (let t = 0; t < 6; t += 0.05) {
      const v = beaconIdleScale(t, 2.1, 0);
      expect(v).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.4 + 1e-9);
    }
    expect(beaconBreath(0)).toBe(1);
    expect(beaconBreath(BEACON_BREATH_HOLD_S)).toBe(1);
    expect(beaconBreath(BEACON_BREATH_HOLD_S + BEACON_BREATH_DECAY_S)).toBe(0);
    expect(beaconBreath(10_000), "a settled marker does not start again").toBe(0);
    for (const t of [0, 0.5, 1.1, 2.7, 9.9]) {
      expect(beaconIdleScale(t, 1.3, 999), "settled is a steady 1 at every clock").toBe(1);
    }
    let prev = 1;
    for (
      let age = BEACON_BREATH_HOLD_S;
      age <= BEACON_BREATH_HOLD_S + BEACON_BREATH_DECAY_S;
      age += 0.5
    ) {
      const b = beaconBreath(age);
      expect(b, "the breath lets go monotonically").toBeLessThanOrEqual(prev);
      prev = b;
    }
  });

  it("answers the transparency request, and says no without a matchMedia", async () => {
    vi.resetModules();
    const media = installMedia(true);
    const mod = await import("../src/city/motion");
    expect(mod.prefersReducedTransparency()).toBe(true);
    media.set(false);
    expect(mod.prefersReducedTransparency()).toBe(false);
    removeMedia();
    vi.resetModules();
    const bare = await import("../src/city/motion");
    expect(
      bare.prefersReducedTransparency(),
      "an environment without the query has no request",
    ).toBe(false);
  });
});

/**
 * MASTER-2027 §04.12 — the one place the city decides whether to build itself
 * in front of the reader.
 *
 * Measured live before it was pinned (`ruhe-lean-probe.mjs`,
 * `ruhe-lean-messung.json`): on the pure WebGL picture — every surface beside
 * the canvas's own ancestor chain hidden — a city arriving under
 * `prefers-reduced-motion` changes **0 px per second** through the whole build
 * window (t+2/6/10/15/25 s), while the same arrival without the request moves
 * **609 174 px in its first second**. The rule that does that is `skipBuild` in
 * `setCityData`; it had no test, so any refactor could hand the crane and the
 * multi-second rise back to a reader who asked for calm — and `Building.tsx`
 * already renders every tower at full height on the first frame, so the
 * cinematic would then describe work the screen is not doing.
 */
describe("the construction cinematic and reduced motion", () => {
  const stadt = (id: string) =>
    city({
      analysisId: id,
      files: [file("src/evil.ts", "TypeScript", [finding({ severity: "P0" })])],
      tree: dir({ path: "", name: "" }),
    });

  async function beiReduktion(matches: boolean) {
    vi.resetModules();
    localStorage.clear();
    const media = installMedia(matches);
    const { useStore } = await import("../src/stores/useStore");
    return { media, useStore };
  }

  afterEach(() => {
    vi.resetModules();
  });

  it("lets the city stand at once when the reader asked for calm", async () => {
    const { useStore } = await beiReduktion(true);
    useStore.getState().setCityData(stadt("calm-city"));
    expect(useStore.getState().buildPhase).toBe("built");
    expect(useStore.getState().constructionTotal).toBe(0);
  });

  it("raises it block by block when the reader did not", async () => {
    const { useStore } = await beiReduktion(false);
    useStore.getState().setCityData(stadt("loud-city"));
    expect(useStore.getState().buildPhase).toBe("constructing");
  });

  it("replays on an explicit request, even under reduced motion", async () => {
    // §03.11's own door: a reader who presses "again" asked for the sequence.
    const { useStore } = await beiReduktion(true);
    useStore.getState().setCityData(stadt("replay-city"));
    expect(useStore.getState().buildPhase).toBe("built");
    useStore.getState().replayConstruction();
    expect(useStore.getState().buildPhase).toBe("constructing");
  });
});
