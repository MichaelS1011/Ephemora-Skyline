import { describe, expect, it } from "vitest";
import { modeFactor } from "../src/components/Building";
import type { ViewMode } from "../src/stores/useStore";

/**
 * View-mode brightness multipliers (spec §14) — pure mapping, no store, no
 * scene: structure stays untouched, security lights only alarm buildings,
 * dependencies recedes everything behind the arcs.
 */

const MODES: ViewMode[] = ["structure", "security", "dependencies"];

describe("modeFactor", () => {
  it("structure keeps every building at full brightness", () => {
    expect(modeFactor("structure", false)).toBe(1);
    expect(modeFactor("structure", true)).toBe(1);
  });

  it("security darkens clean buildings, alarm buildings stay lit", () => {
    expect(modeFactor("security", true)).toBe(1);
    expect(modeFactor("security", false)).toBe(0.45);
  });

  it("dependencies recedes every building uniformly", () => {
    expect(modeFactor("dependencies", false)).toBe(0.35);
    expect(modeFactor("dependencies", true)).toBe(0.35);
  });

  it("is deterministic — same inputs always yield the same factor", () => {
    for (const mode of MODES) {
      for (const alarm of [false, true]) {
        const first = modeFactor(mode, alarm);
        const second = modeFactor(mode, alarm);
        expect(first).toBe(second);
      }
    }
  });
});
