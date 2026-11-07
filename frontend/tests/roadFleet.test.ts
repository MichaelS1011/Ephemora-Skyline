// @vitest-environment node
/**
 * The car shape and paint that survive the ambient fleet.
 *
 * The street fleet used to draw background cars from three instanced meshes.
 * §06.08 measured it at 0 px in the district with three patches applied: the
 * instances ran, nothing was visible. The fleet is gone, but its proportions
 * and livery still carry the car a reader can drive and the residents' wheel
 * roll, so those numbers stay under guard.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { CAR_SHAPE, FLEET_LIVERY, wheelRoll } from "../src/city/openWorldStreets";
import { SEVERITY_COLOR, SEVERITY_CVD_COLOR } from "../src/city/palette";
import { FIGURE } from "../src/components/Pedestrians";

const SRC = path.resolve(import.meta.dirname, "../src");

/** ΔE76 in Lab — the same distance the traffic-livery guard measures with. */
function lab(hex: string): [number, number, number] {
  const srgb = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
  const lin = srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = lin;
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047;
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1! - l2!, a1! - a2!, b1! - b2!);
};

describe("the car shape", () => {
  it("stands a car up to the height of the person beside it", () => {
    const carTop = CAR_SHAPE.cabin.y + CAR_SHAPE.cabin.h / 2;
    // a hatchback is roughly three quarters of a standing adult
    expect(carTop).toBeGreaterThanOrEqual(FIGURE.crown * 0.6);
    expect(carTop).toBeLessThanOrEqual(FIGURE.crown * 1.1);
    // and it is longer than it is wide, or it is a box, not a car
    expect(CAR_SHAPE.body.w).toBeGreaterThan(CAR_SHAPE.body.d * 1.5);
  });

  it("puts the wheels on the ground and the axle across the car", () => {
    // the wheel touches the surface: its centre sits exactly one radius up
    expect(CAR_SHAPE.wheel.y).toBeCloseTo(CAR_SHAPE.wheel.r, 3);
    // the body clears the axles instead of swallowing them
    expect(CAR_SHAPE.body.y - CAR_SHAPE.body.h / 2).toBeGreaterThan(CAR_SHAPE.wheel.y * 0.5);
    // the wheel is wider than the cabin and set inside the body's own width
    expect(CAR_SHAPE.wheel.z * 2).toBeLessThan(CAR_SHAPE.body.d + 0.05);
    expect(CAR_SHAPE.wheel.x).toBeLessThan(CAR_SHAPE.body.w / 2);
  });

  it("rolls a wheel with the distance driven, in the direction of travel", () => {
    const r = CAR_SHAPE.wheel.r;
    // the sign: a car moving forward turns its wheels so the tread moves with it
    expect(wheelRoll(1, 1, r)).toBeLessThan(0);
    expect(wheelRoll(1, -1, r)).toBeGreaterThan(0);
    // and the rate is metres over radius, not a constant — compared inside one
    // turn, because the angle itself is kept wrapped
    const quarter = Math.abs(wheelRoll(0.25, 1, r));
    const half = Math.abs(wheelRoll(0.5, 1, r));
    expect(half).toBeCloseTo(quarter * 2, 6);
    expect(quarter).toBeCloseTo(0.25 / r, 6);
    // one half turn per half circumference
    expect(Math.abs(wheelRoll(Math.PI * r, 1, r))).toBeCloseTo(Math.PI, 6);
  });

  it("keeps every remaining coat outside the alarm band", () => {
    for (const coat of FLEET_LIVERY) {
      for (const severity of [
        ...Object.values(SEVERITY_COLOR),
        ...Object.values(SEVERITY_CVD_COLOR),
      ]) {
        expect(deltaE(coat, String(severity)), `${coat} against ${severity}`).toBeGreaterThan(25);
      }
    }
  });

  it("is still the shape the drive car uses", () => {
    const drive = readFileSync(path.join(SRC, "components/DriveCar.tsx"), "utf-8");
    expect(drive).toContain("CAR_SHAPE");
    expect(drive).toContain("FLEET_LIVERY");
  });
});

describe("the decoration that measured zero is gone", () => {
  const road = readFileSync(path.join(SRC, "components/RoadSystem.tsx"), "utf-8");
  const barrel = readFileSync(path.join(SRC, "components/index.ts"), "utf-8");
  const loops = readFileSync(
    path.resolve(import.meta.dirname, "reducedMotionLoops.test.ts"),
    "utf-8",
  );

  it("draws no ambient street fleet", () => {
    // 0 px with three visibility patches applied — it cost instances, not image.
    expect(road).not.toContain("fleet-body");
    expect(road).not.toContain("carRef");
    expect(road).not.toContain("FLEET_LIVERY");
    expect(road).not.toContain("CAR_SHAPE");
    expect(existsSync(path.join(SRC, "city/fleetMotion.ts"))).toBe(false);
  });

  it("keeps no dust module or guard for a module nothing rendered", () => {
    expect(existsSync(path.join(SRC, "components/ParticleField.tsx"))).toBe(false);
    expect(barrel).not.toContain("ParticleField");
    expect(loops).not.toContain("ParticleField.tsx");
  });
});
