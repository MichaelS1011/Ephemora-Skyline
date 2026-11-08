import { describe, expect, it } from "vitest";
import {
  OVERVIEW_ZOOM_FACTORS,
  overviewZoomDirection,
  overviewZoomDistance,
} from "../src/city/zoomSteps";

describe("overview zoom ladder", () => {
  const bounds = 100;

  it("moves exactly one rung per wheel event", () => {
    const out = overviewZoomDistance(bounds, 200, 1);
    expect(out).toBe(bounds * OVERVIEW_ZOOM_FACTORS[5]);

    const back = overviewZoomDistance(bounds, 200, -1);
    expect(back).toBe(bounds * OVERVIEW_ZOOM_FACTORS[3]);
  });

  it("maps wheel up to closer and wheel down to farther", () => {
    const closer = overviewZoomDistance(bounds, 200, overviewZoomDirection(-1));
    const farther = overviewZoomDistance(bounds, 200, overviewZoomDirection(1));
    expect(closer).toBe(bounds * OVERVIEW_ZOOM_FACTORS[3]);
    expect(farther).toBe(bounds * OVERVIEW_ZOOM_FACTORS[5]);
  });

  it("finds the nearest rung when a flight or address lands between steps", () => {
    const next = overviewZoomDistance(bounds, 143, 1);
    expect(next).toBe(bounds * OVERVIEW_ZOOM_FACTORS[4]);
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
    expect(OVERVIEW_ZOOM_FACTORS).toEqual([0.8, 1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5]);
  });
});
