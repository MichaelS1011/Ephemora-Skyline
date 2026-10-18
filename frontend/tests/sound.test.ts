// @vitest-environment jsdom
/**
 * The verdict stroke, measured as numbers — the envelope, the gate and the
 * wiring — never as a waveform nobody can compare twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("verdictGain", () => {
  it("peaks at the tone's start and decays to silence", async () => {
    const { verdictGain, VERDICT_PEAK } = await import("../src/city/sound");
    expect(verdictGain(0)).toBeCloseTo(VERDICT_PEAK, 6);
    expect(verdictGain(0.05)).toBeLessThan(verdictGain(0));
    expect(verdictGain(0.25)).toBeLessThan(0.001);
  });

  it("is zero outside the tone's window, negative time included", async () => {
    const { verdictGain } = await import("../src/city/sound");
    expect(verdictGain(-0.01)).toBe(0);
    expect(verdictGain(0.26)).toBe(0);
  });

  it("stays quiet enough to sit under a conversation", async () => {
    const { verdictGain, VERDICT_PEAK } = await import("../src/city/sound");
    expect(VERDICT_PEAK).toBeLessThanOrEqual(0.06);
    for (let t = 0; t <= 0.25; t += 0.01) expect(verdictGain(t)).toBeLessThanOrEqual(0.06);
  });
});

describe("the stroke is a rising fifth", () => {
  it("two tones, the second a fifth above the first", async () => {
    const { VERDICT_TONES } = await import("../src/city/sound");
    expect(VERDICT_TONES).toHaveLength(2);
    const [a, b] = VERDICT_TONES as unknown as [number, number];
    expect(b / a).toBeCloseTo(3 / 2, 2);
    expect(b).toBeGreaterThan(a);
  });
});

describe("soundAllowed — reduced motion is the switch", () => {
  const setMotion = (matches: boolean) => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduced-motion") ? matches : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays only while the system asks for motion", async () => {
    setMotion(false);
    const { soundAllowed } = await import("../src/city/sound");
    expect(soundAllowed()).toBe(true);
    vi.resetModules();
    setMotion(true);
    const again = await import("../src/city/sound");
    expect(again.soundAllowed()).toBe(false);
  });

  it("a browser without WebAudio loses the sound, never a frame", async () => {
    setMotion(false);
    vi.stubGlobal("AudioContext", undefined);
    const { playVerdict } = await import("../src/city/sound");
    expect(() => playVerdict()).not.toThrow();
  });
});

describe("the verdict button is the only speaker", () => {
  /**
   * The verdict control moved with `FindingRow` into `FindingCard.tsx`
   * (2026-10-18 InfoPanel split); the claim did not move with it: the row that
   * sets a verdict is the only place in the interface that starts a sound, and
   * clearing one stays silent.
   */
  it("FindingRow plays on a set verdict and stays silent on clearing", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/components/FindingCard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/if \(next\) playVerdict\(\)/);
    // exactly one call site — no other component may start talking
    expect(src.match(/playVerdict\(\)/g)).toHaveLength(1);
    const panels = [
      "Building",
      "FindingsPanel",
      "HudOverlay",
      "Landing",
      "AnalyzePanel",
      // the two modules the split left behind: they compose the row, they do not
      // speak for it
      "InfoPanel",
      "FilePanels",
    ];
    for (const p of panels) {
      const s = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), `../src/components/${p}.tsx`),
        "utf-8",
      );
      expect(s, `${p} must stay silent`).not.toMatch(/playVerdict|from "..\/city\/sound"/);
    }
  });
});
