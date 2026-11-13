import { describe, expect, it } from "vitest";
import {
  OVERVIEW_ZOOM_FACTORS,
  freeDollyStep,
  overviewZoomDirection,
  overviewZoomDistance,
  WHEEL_DOLLY_MAX_STEP,
} from "../src/city/zoomSteps";

describe("overview zoom ladder", () => {
  const bounds = 100;

  it("moves exactly one rung per wheel event", () => {
    const out = overviewZoomDistance(bounds, 200, 1);
    expect(out).toBe(bounds * OVERVIEW_ZOOM_FACTORS[9]);

    const back = overviewZoomDistance(bounds, 200, -1);
    expect(back).toBe(bounds * OVERVIEW_ZOOM_FACTORS[7]);
  });

  it("maps wheel up to closer and wheel down to farther", () => {
    const closer = overviewZoomDistance(bounds, 200, overviewZoomDirection(-1));
    const farther = overviewZoomDistance(bounds, 200, overviewZoomDirection(1));
    expect(closer).toBe(bounds * OVERVIEW_ZOOM_FACTORS[7]);
    expect(farther).toBe(bounds * OVERVIEW_ZOOM_FACTORS[9]);
  });

  it("finds the nearest rung when a flight or address lands between steps", () => {
    const next = overviewZoomDistance(bounds, 143, 1);
    expect(next).toBe(bounds * OVERVIEW_ZOOM_FACTORS[6]);
  });

  it("clamps at both ends of the ladder", () => {
    expect(overviewZoomDistance(bounds, 80, -1)).toBe(80);
    expect(overviewZoomDistance(bounds, 500, 1)).toBe(500);
  });

  it("leaves a street-level dolly alone", () => {
    expect(overviewZoomDistance(bounds, 40, 1)).toBe(40);
  });

  it("is deterministic and does not mutate the ladder", () => {
    expect(overviewZoomDistance(bounds, 200, 1)).toBe(overviewZoomDistance(bounds, 200, 1));
    expect(OVERVIEW_ZOOM_FACTORS).toEqual([
      0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.8, 2, 2.25, 2.5, 2.8, 3.2, 3.6, 4, 5,
    ]);
  });
});

describe("free-flight wheel dolly", () => {
  it("moves forward on wheel up and backward on wheel down", () => {
    expect(freeDollyStep(-10, 10)).toBeGreaterThan(0);
    expect(freeDollyStep(10, 10)).toBeLessThan(0);
    expect(freeDollyStep(0, 10)).toBeCloseTo(0, 6);
  });

  it("is a gentle fraction of the old 0.012 rate", () => {
    expect(freeDollyStep(-10, 10)).toBeCloseTo(0.22, 6);
    expect(freeDollyStep(10, 10)).toBeCloseTo(-0.22, 6);
  });

  it("grows with the eye height, but never past one capped step", () => {
    expect(Math.abs(freeDollyStep(-10, 40))).toBeGreaterThan(Math.abs(freeDollyStep(-10, 10)));
    expect(freeDollyStep(-10_000, 40)).toBe(WHEEL_DOLLY_MAX_STEP);
    expect(freeDollyStep(10_000, 40)).toBe(-WHEEL_DOLLY_MAX_STEP);
  });
});
