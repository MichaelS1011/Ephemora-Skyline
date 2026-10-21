// @vitest-environment node
/**
 * The ambient fleet's rules. The renderer draws what this module decides, so a
 * car that follows at a distance, turns at a junction and turns around only at
 * a dead end is decided here — and can be checked without a browser.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  FLEET_GAP,
  FLEET_LOOK,
  chooseContinuation,
  followSpeed,
  streetContinuations,
  turnDuration,
} from "../src/city/fleetMotion";
import type { StreetLine } from "../src/city/layout";

const line = (x1: number, z1: number, x2: number, z2: number): StreetLine => ({
  x1,
  z1,
  x2,
  z2,
});

describe("the ambient fleet's driving rules", () => {
  it("continues onto the connected street and never onto itself", () => {
    const lanes = [line(-10, 0, 0, 0), line(0, 0, 0, 10), line(0, 0, 10, 0)];
    const choices = streetContinuations(lanes, 0, 0, 0);
    expect(choices.map((c) => c.seg).sort()).toEqual([1, 2]);
    // the perpendicular arm is a 90° turn, the collinear one is straight on
    const straight = choices.find((c) => c.seg === 2)!;
    const corner = choices.find((c) => c.seg === 1)!;
    expect(Math.abs(straight.angle)).toBeCloseTo(0, 6);
    expect(Math.abs(corner.angle)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("measures the turn against the direction of travel, not the raw line", () => {
    // arriving at the START of a street and travelling right: the arm to the
    // right is straight on, even though its own coordinates start at the node
    const lanes = [line(0, 0, -10, 0), line(0, 0, 10, 0), line(0, 0, 0, 10)];
    const choices = streetContinuations(lanes, 0, 0, 0);
    const straight = choices.find((c) => c.seg === 1)!;
    expect(Math.abs(straight.angle)).toBeCloseTo(0, 6);
    expect(straight.entryT).toBe(0);
  });

  it("offers nothing at a dead end", () => {
    const lanes = [line(-10, 0, 0, 0), line(20, 20, 30, 30)];
    expect(streetContinuations(lanes, 0, 0, 0)).toEqual([]);
  });

  it("refuses a near-U-turn onto a parallel street", () => {
    // the second street starts at the node and runs back the way we came
    const lanes = [line(-10, 0, 0, 0), line(0, 0, -9, 0.2)];
    expect(streetContinuations(lanes, 0, 0, 0)).toEqual([]);
  });

  it("takes the straightest road usually and the second straightest sometimes", () => {
    const choices = [
      { seg: 1, entryT: 0 as const, dir: 1 as const, angle: 0.9 },
      { seg: 2, entryT: 0 as const, dir: 1 as const, angle: 0.1 },
      { seg: 3, entryT: 0 as const, dir: 1 as const, angle: -0.2 },
    ];
    expect(chooseContinuation(choices, 0)!.seg).toBe(2);
    expect(chooseContinuation(choices, 1)!.seg).toBe(3);
    // the third option is never taken while a straighter one exists
    expect(chooseContinuation(choices, 99)!.seg).not.toBe(1);
    expect(chooseContinuation([], 0)).toBeNull();
  });

  it("keeps bumper distance and never exceeds cruise", () => {
    expect(followSpeed(6, FLEET_GAP, 6)).toBe(0);
    expect(followSpeed(6, FLEET_GAP + 0.01, 6)).toBeLessThan(0.1);
    expect(followSpeed(6, FLEET_LOOK, 6)).toBe(6);
    expect(followSpeed(6, FLEET_LOOK + 10, 6)).toBe(6);
    // monotone in the gap
    let last = -1;
    for (let gap = FLEET_GAP; gap <= FLEET_LOOK; gap += 0.5) {
      const v = followSpeed(6, gap, 6);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(6);
      last = v;
    }
    // a slow car ahead caps the target near it, not at cruise
    expect(followSpeed(6, FLEET_GAP + 1, 1)).toBeLessThanOrEqual(1 + 1.5 * 1 + 1e-9);
  });

  it("turns quickly enough to read and slow enough to steer", () => {
    expect(turnDuration(0)).toBeGreaterThanOrEqual(0.32);
    expect(turnDuration(100)).toBeLessThanOrEqual(0.9);
    expect(turnDuration(9)).toBeGreaterThan(turnDuration(3));
  });

  it("is wired into the renderer, not a second copy of the old flip", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/RoadSystem.tsx"),
      "utf-8",
    );
    expect(src).toContain("streetContinuations");
    expect(src).toContain("followSpeed");
    expect(src).toContain("deriveTransit");
    // the old block clamped t and flipped dir in place at the street end
    expect(src).not.toContain("U-turn at the end of the street instead of wrapping");
  });
});
