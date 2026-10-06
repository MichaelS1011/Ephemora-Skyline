// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
