import { describe, it, expect } from "vitest";
import { constructionStep } from "../src/city/layout";

/**
 * Construction pacing — ms per raised unit (district, building, podium).
 * Mid-size cities must land in the 4–10 s window; tiny cities clamp at the
 * 420 ms per-unit ceiling, huge ones at the 40 ms floor.
 */
describe("constructionStep", () => {
  it("keeps the per-unit step within [40, 420] ms for every size", () => {
    for (const n of [1, 10, 73, 300, 2000]) {
      const step = constructionStep(n);
      expect(step).toBeGreaterThanOrEqual(40);
      expect(step).toBeLessThanOrEqual(420);
    }
  });

  it("n=1: single-unit builds clamp to the 420 ms ceiling", () => {
    expect(constructionStep(1)).toBe(420);
    // Total (420 ms) sits far below the 4 s band — fine for one unit,
    // so only the 10 s budget is asserted here
    expect(1 * constructionStep(1)).toBeLessThanOrEqual(10000);
  });

  it("n=10: small builds stay inside the 10 s budget", () => {
    expect(constructionStep(10)).toBe(420);
    expect(10 * constructionStep(10)).toBeLessThanOrEqual(10000);
  });

  it("n=73: mid-size builds land in the 4–10 s band", () => {
    const total = 73 * constructionStep(73);
    expect(total).toBeGreaterThanOrEqual(4000);
    expect(total).toBeLessThanOrEqual(10000);
  });

  it("never builds faster than 4 s once n ≥ 15", () => {
    for (const n of [15, 73, 300, 2000]) {
      expect(n * constructionStep(n)).toBeGreaterThanOrEqual(4000);
    }
  });

  it("n=300 and n=2000: very large cities hold the 40 ms floor", () => {
    // The floor dominates here, so n*step exceeds 10 s — the total budget
    // is only assertable up to n=150 (6000/n ≥ 40); beyond that the floor
    // keeps the per-unit stagger perceivable instead
    expect(constructionStep(300)).toBe(40);
    expect(constructionStep(2000)).toBe(40);
  });
});
