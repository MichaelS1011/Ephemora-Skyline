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
  FLEET_ACCEL,
  FLEET_BRAKE,
  FLEET_CORNER_YAW,
  FLEET_GAP,
  FLEET_HOLD_LIMIT,
  FLEET_LANE_OFFSET,
  FLEET_LOOK,
  FLEET_MAX_CURVATURE,
  chooseContinuation,
  cornerCurve,
  cornerLook,
  curveAt,
  curvatureSpeed,
  followLook,
  followSpeed,
  isDrivable,
  isStraightOn,
  nodeCorner,
  slewYaw,
  streetContinuations,
  turnAroundLength,
  turnAroundSpeed,
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

  it("looks far enough ahead to stop inside its own band, at every cruise the fleet has", () => {
    // The fleet's cruise is 3,5 + (i*13 % 40)/10 — 3,5 to 7,4. The rule that
    // matters is physical: the band in which `followSpeed` brakes must be at
    // least the distance needed to stop from that cruise, or a slow frame closes
    // the bumper. Measured on a six-car platoon with one stalled 100 ms frame:
    // the shipped band held — with 0,54 units to spare at the fastest cruise.
    for (let cruise = 3.5; cruise <= 7.41; cruise += 0.1) {
      const band = followLook(cruise) - FLEET_GAP;
      const needed = (cruise * cruise) / (2 * FLEET_BRAKE);
      expect(
        band,
        `cruise ${cruise.toFixed(1)} cannot stop inside its band`,
      ).toBeGreaterThanOrEqual(needed);
    }
  });

  it("never lets a follower into the bumper, even across a stalled frame", () => {
    const rampOf = (v: number, target: number, per: number, dt: number) =>
      v < target ? Math.min(target, v + per * dt) : Math.max(target, v - per * dt);
    for (const cruise of [3.5, 5, 6.2, 7.4]) {
      const pos = [0, -9, -18, -27, -36, -45];
      const v = pos.map(() => cruise);
      let minGap = Infinity;
      for (let i = 0, t = 0; t < 12; t += 1 / 60, i++) {
        const dt = i === 180 ? 0.1 : 1 / 60;
        for (let k = 0; k < pos.length; k++) pos[k]! += v[k]! * dt;
        for (let k = 1; k < pos.length; k++) {
          const gap = pos[k - 1]! - pos[k]!;
          minGap = Math.min(minGap, gap);
          const ahead = k === 1 ? (t < 1 ? cruise : 0) : Math.min(v[k - 1]!, v[k]!);
          const target = followSpeed(cruise, gap, ahead);
          v[k] = rampOf(v[k]!, target, target < v[k]! ? FLEET_BRAKE : FLEET_ACCEL, dt);
        }
        if (t >= 1) v[0] = 0;
      }
      expect(minGap, `cruise ${cruise}: a follower reached the bumper`).toBeGreaterThanOrEqual(
        FLEET_GAP,
      );
    }
  });

  it("leaves and arrives pointing where it drives", () => {
    // A right-angle corner: in along +z, out along +x. The quadratic that shipped
    // used the junction node as its control point, so its first tangent pointed
    // AT the node — 90° off the car's own heading, which the live fleet showed as
    // a yaw jump of up to 192 rad/s in one frame.
    const c = cornerCurve(0, 0, 0, 1, 1.34, 0.9, 1, 0);
    const start = curveAt(c, 0);
    const end = curveAt(c, 1);
    expect(start.x).toBeCloseTo(0, 6);
    expect(start.z).toBeCloseTo(0, 6);
    expect(end.x).toBeCloseTo(1.34, 6);
    expect(end.z).toBeCloseTo(0.9, 6);
    expect(start.tx).toBeCloseTo(0, 6);
    expect(start.tz).toBeCloseTo(1, 6);
    expect(end.tx).toBeCloseTo(1, 6);
    expect(end.tz).toBeCloseTo(0, 6);
    // and nothing in between swings the other way
    let lastTurn = 0;
    let prev = start;
    for (let i = 1; i <= 60; i++) {
      const p = curveAt(c, i / 60);
      lastTurn = Math.max(
        lastTurn,
        Math.abs(Math.atan2(p.tz, p.tx) - Math.atan2(prev.tz, prev.tx)),
      );
      prev = p;
    }
    expect(lastTurn).toBeLessThan(0.1);
  });

  it("takes a tight corner slowly and a straight one at cruise", () => {
    const tight = cornerCurve(0, 0, 0, 1, 1.34, 0.9, 1, 0);
    const wide = cornerCurve(0, 0, 0, 1, 0.35, 1.34, 0.26, 0.97);
    expect(tight.curvature).toBeGreaterThan(wide.curvature);
    expect(curvatureSpeed(tight.curvature)).toBeLessThan(curvatureSpeed(wide.curvature));
    // no curvature at all: the corner asks for nothing
    expect(curvatureSpeed(0)).toBe(Infinity);
    // the turnaround is a circle of one lane offset, so its speed is the limit
    // times that radius — and it is the slowest thing the network can ask for
    expect(turnAroundSpeed()).toBeCloseTo(FLEET_CORNER_YAW * FLEET_LANE_OFFSET, 6);
    expect(turnAroundLength()).toBeCloseTo(Math.PI * FLEET_LANE_OFFSET, 6);
  });

  it("never turns faster than its own yaw limit, on the corners it ships", () => {
    const corners: [number, number, number, number][] = [
      [1.34, 0.9, 1, 0],
      [0.9, 1.34, 0.6, 0.8],
      [1.9, 0.2, 1, 0],
      [-0.2, 1.9, 0, 1],
    ];
    let drivable = 0;
    for (const [toX, toZ, outX, outZ] of corners) {
      const c = cornerCurve(0, 0, 0, 1, toX, toZ, outX, outZ);
      const v = curvatureSpeed(c.curvature);
      // No corner, however shaped, asks a car to go slower than it drives its
      // own turnaround — that floor is what keeps a junction from freezing.
      expect(v).toBeGreaterThanOrEqual(turnAroundSpeed() - 1e-9);
      if (isDrivable(c)) {
        drivable++;
        // A swept corner is driven at the yaw limit, or at the floor when the
        // limit would demand slower than the fleet's own tightest turn.
        expect(v * c.curvature).toBeLessThanOrEqual(2 * FLEET_CORNER_YAW + 1e-9);
      }
      // a path is never shorter than the line between its ends, and a corner
      // this tight must not wander far off it either
      expect(c.length).toBeGreaterThanOrEqual(Math.hypot(toX, toZ) - 1e-6);
      expect(c.length).toBeLessThan(Math.hypot(toX, toZ) * 1.8);
    }
    expect(drivable).toBeGreaterThanOrEqual(2);
  });

  it("refuses a corner that would have to loop back over itself", () => {
    // The two lane ends are 0,7 apart while the exit lies behind the entry along
    // the road the car is on: no forward path joins them without doubling back.
    // Measured on the demo city's own junctions, where this shape came out at a
    // curvature of 31 … 168 — a radius of thousandths of a unit.
    const loop = cornerCurve(0, 0, 0, 1, 0.72, -0.29, -1, 0.04);
    expect(isDrivable(loop)).toBe(false);
    expect(loop.curvature).toBeGreaterThan(FLEET_MAX_CURVATURE);
    // the shape that replaces it does not loop, and even its curvature cannot
    // ask a car for less than the turnaround pace — that floor is what keeps a
    // committed corner from holding its junction forever
    const fallback = nodeCorner(0, 0, 0.3, -0.6, 0.72, -0.29);
    expect(fallback.length).toBeGreaterThanOrEqual(0.77);
    expect(curvatureSpeed(fallback.curvature)).toBeGreaterThanOrEqual(turnAroundSpeed() - 1e-9);
  });

  it("starts braking far enough back to be slow already at the node", () => {
    // The fleet's cruise band is 3,5 … 7,4. For each, the look distance must
    // cover the braking it asks for, or the speed step falls inside the corner.
    for (let cruise = 3.5; cruise <= 7.41; cruise += 0.1) {
      const limit = Math.min(cruise, turnAroundSpeed());
      const needed = (cruise * cruise - limit * limit) / (2 * FLEET_BRAKE);
      expect(cornerLook(cruise, turnAroundSpeed())).toBeGreaterThanOrEqual(needed);
      expect(cornerLook(cruise, turnAroundSpeed())).toBeGreaterThan(0);
    }
  });

  it("treats a street that goes on as no corner at all", () => {
    expect(isStraightOn(0)).toBe(true);
    expect(isStraightOn(-0.11)).toBe(true);
    expect(isStraightOn(Math.PI / 2)).toBe(false);
    // and the degenerate curve that follows from it is not a thing: a corner
    // between two collinear lanes has no chord to build a curve on
    const flat = cornerCurve(0, 0, 0, 1, 0, 0, 0, 1);
    expect(flat.curvature).toBeLessThan(1e-6);
    expect(flat.length).toBeGreaterThan(0);
  });

  it("turns a body no faster than it asked to, the short way round", () => {
    expect(slewYaw(0, Math.PI / 2, 0.1)).toBeCloseTo(0.1, 6);
    // already inside the step: it arrives, it does not crawl
    expect(slewYaw(0.2, 0.25, 0.1)).toBeCloseTo(0.25, 6);
    // across the ±π seam the short way is the other direction
    const stepped = slewYaw(3.0, -3.0, 1);
    expect(Math.abs(stepped - 3.0)).toBeLessThan(Math.PI / 2);
    // and backwards, symmetrically
    expect(slewYaw(0, -Math.PI / 2, 0.1)).toBeCloseTo(-0.1, 6);
  });

  it("is wired into the renderer, not a second copy of the old flip", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/RoadSystem.tsx"),
      "utf-8",
    );
    expect(src).toContain("streetContinuations");
    expect(src).toContain("followSpeed");
    expect(src).toContain("deriveTransit");
    // the corner: planned early, advanced by distance, read off the cubic
    expect(src).toContain("cornerCurve");
    expect(src).toContain("curveAt(");
    expect(src).toContain("curvatureSpeed");
    expect(src).toContain("cornerLook(");
    // the body's nose is slewed, never cut
    expect(src).toContain("slewYaw(");
    expect(src).toContain("isStraightOn");
    // a corner is only started when there is room at the end of it — and never
    // for longer than the hold limit, because a waiting fleet is a frozen city
    expect(src).toContain("entryFree(");
    expect(src).toContain("FLEET_HOLD_LIMIT");
    expect(FLEET_HOLD_LIMIT).toBeGreaterThan(1);
    expect(FLEET_HOLD_LIMIT).toBeLessThan(6);
    // the old clock-driven pose and its velocity snap
    expect(src).not.toContain("turnDuration");
    expect(src).not.toContain("dur:");
    expect(src).not.toContain("U-turn at the end of the street instead of wrapping");
  });
});
