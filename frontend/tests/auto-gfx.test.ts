/**
 * The auto-Gfx machine, driven as a state machine: every rule gets its case,
 * every case names the failure it prevents (GC pause, tab switch, threshold
 * flicker, the user's own hand).
 */
import { describe, expect, it } from "vitest";

import {
  DROP_AFTER,
  HEALTHY_MS,
  RAISE_AFTER,
  STRUGGLE_MS,
  WINDOW,
  autoGfxDecision,
  medianOf,
} from "../src/city/perf";

const fill = (ms: number, n = WINDOW) => Array.from({ length: n }, () => ms);

describe("medianOf", () => {
  it("ignores the outlier a GC pause leaves behind", () => {
    const samples = [...fill(16.6, 119), 400];
    expect(medianOf(samples)).toBeLessThan(20);
  });

  it("is zero on an empty window, never NaN", () => {
    expect(medianOf([])).toBe(0);
  });
});

describe("autoGfxDecision", () => {
  it("holds while the window is still filling", () => {
    const { move } = autoGfxDecision(false, fill(30), 0);
    expect(move).toBe("hold");
  });

  it("drops to lite after the struggle streak, not before", () => {
    let streak = 0;
    let moves = 0;
    for (let i = 0; i < DROP_AFTER - 1; i++) {
      const r = autoGfxDecision(false, fill(30), streak);
      streak = r.streak;
      moves += r.move === "toLite" ? 1 : 0;
    }
    expect(moves, "no drop before the streak is full").toBe(0);
    const last = autoGfxDecision(false, fill(30), streak);
    expect(last.move).toBe("toLite");
    expect(last.streak, "the streak resets with the move").toBe(0);
  });

  it("one healthy window breaks the struggle streak — a single hiccup never dims the city", () => {
    const r = autoGfxDecision(false, fill(16.6), DROP_AFTER - 1);
    expect(r.move).toBe("hold");
    expect(r.streak).toBe(0);
  });

  it("raises back to full only after the LONGER healthy streak — relief is quick, privilege slow", () => {
    expect(RAISE_AFTER).toBeGreaterThan(DROP_AFTER);
    let streak = 0;
    let moved = false;
    for (let i = 0; i < RAISE_AFTER; i++) {
      const r = autoGfxDecision(true, fill(16.6), streak);
      streak = r.streak;
      if (r.move === "toFull") moved = true;
    }
    expect(moved).toBe(true);
  });

  it("does not flicker at the threshold: a median between the two lines holds either way", () => {
    const between = (STRUGGLE_MS + HEALTHY_MS) / 2;
    expect(autoGfxDecision(false, fill(between), DROP_AFTER - 1).move).toBe("hold");
    expect(autoGfxDecision(true, fill(between), RAISE_AFTER - 1).move).toBe("hold");
  });

  it("never holds both states at once: toLite needs !lite, toFull needs lite", () => {
    const down = autoGfxDecision(true, fill(30), RAISE_AFTER);
    expect(down.move, "a struggling machine in lite stays in lite").toBe("hold");
    const up = autoGfxDecision(false, fill(16.6), RAISE_AFTER);
    expect(up.move, "a healthy machine in full stays in full").toBe("hold");
  });
});
