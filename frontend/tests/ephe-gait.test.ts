import { describe, expect, it } from "vitest";
import { pivotMarch, ramp, strideBlend } from "../src/city/epheGait";

/**
 * The citizens already walk the sidewalk graph and their stride is driven by
 * DISTANCE travelled, not by a clock — so they never moonwalk. What gave them
 * away was the edges: a figure jumped from standing to mid-stride in one frame,
 * froze with its legs apart when it arrived, pivoted on stiff legs at a corner,
 * and reached full speed instantly. Four tells, all of them about change of
 * state rather than about the walk itself.
 */
describe("a stride eases in and out", () => {
  it("starts from the ground, not from the middle of a step", () => {
    // The first frame of walking may not carry more stride than one frame of
    // ramp allows — that jump is exactly what reads as a twitch.
    let blend = 0;
    const first = strideBlend(blend, true, 1 / 60);
    expect(first).toBeLessThan(0.1);
    blend = first;
    expect(blend).toBeGreaterThan(0);
  });

  it("reaches a full stride within a quarter second of walking", () => {
    let blend = 0;
    for (let i = 0; i < 15; i++) blend = strideBlend(blend, true, 1 / 60);
    expect(blend).toBeGreaterThanOrEqual(0.95);
  });

  it("brings the feet home when the figure stops, instead of freezing apart", () => {
    let blend = 1;
    for (let i = 0; i < 20; i++) blend = strideBlend(blend, false, 1 / 60);
    expect(blend).toBeCloseTo(0, 5);
  });

  it("does not care how the frames are cut", () => {
    const many = (() => {
      let b = 0;
      for (let i = 0; i < 30; i++) b = strideBlend(b, true, 1 / 120);
      return b;
    })();
    const few = (() => {
      let b = 0;
      for (let i = 0; i < 15; i++) b = strideBlend(b, true, 1 / 60);
      return b;
    })();
    expect(Math.abs(many - few)).toBeLessThan(0.08);
  });
});

describe("speed is reached, not switched on", () => {
  it("moves toward the target by at most its acceleration per second", () => {
    expect(ramp(0, 1, 6, 1 / 60)).toBeCloseTo(0.1, 5);
    expect(ramp(0, 1, 6, 1 / 60) * 60).toBeLessThanOrEqual(6.001);
  });

  it("never overshoots the target", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = ramp(v, 1, 6, 1 / 30);
    expect(v).toBe(1);
    let w = 1;
    for (let i = 0; i < 200; i++) w = ramp(w, 0, 8, 1 / 30);
    expect(w).toBe(0);
  });
});

describe("a turn on the spot still costs a step", () => {
  it("keeps the legs moving while the body pivots", () => {
    const a = pivotMarch(0);
    const b = pivotMarch(1.2);
    expect(a).not.toBe(b);
    expect(Math.abs(b)).toBeLessThanOrEqual(0.45);
    // smaller than a walking stride, so the pivot never looks like a sprint
    expect(Math.abs(b)).toBeLessThan(1);
  });
});
