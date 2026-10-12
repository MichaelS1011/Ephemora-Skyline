// @vitest-environment node
/**
 * The street fleet as a thing with rules.
 *
 * It used to be two boxes: 0.85 long, 0.22 high, unlit (`meshBasicMaterial
 * toneMapped={false}`, so it ignored the day the rest of the world lives in), no
 * wheels, and coloured from a literal that included an alarm-band orange and the
 * streetlight's own filament colour. Measured against the resident walking past
 * it, the car was 0.54 units tall against a person of 1.35 — a toy on a toy
 * street.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { wheelRoll } from "../src/components/RoadSystem";
import { CAR_SHAPE, FLEET_LIVERY } from "../src/city/openWorldStreets";
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

describe("the street fleet", () => {
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

  it("keeps every fleet coat outside the alarm band", () => {
    for (const coat of FLEET_LIVERY) {
      for (const severity of [
        ...Object.values(SEVERITY_COLOR),
        ...Object.values(SEVERITY_CVD_COLOR),
      ]) {
        expect(deltaE(coat, String(severity)), `${coat} against ${severity}`).toBeGreaterThan(25);
      }
    }
  });

  it("is lit like the rest of the world, and never carries its own colour literal", () => {
    const road = readFileSync(path.join(SRC, "components/RoadSystem.tsx"), "utf-8");
    // The body used to be `meshBasicMaterial toneMapped={false}`: a sticker in a
    // lit scene, so a car could not show which way the sun came from. The flat
    // paint that stays unlit is the road marking, the lamp head and the plot
    // edge — so the rule is scoped to the traffic block, not the whole file.
    const traffic = road.slice(road.indexOf("{/* Traffic"));
    const block = traffic.slice(0, traffic.indexOf("\n\n"));
    expect(block, "the traffic block is not where the memo says it is").toContain("CAR_SHAPE");
    expect(block).not.toMatch(/toneMapped=\{false\}/);
    expect(block).not.toContain('meshBasicMaterial color="#ffffff"');
    expect((block.match(/meshStandardMaterial/g) ?? []).length).toBe(3);
    expect(road).toContain("FLEET_LIVERY");
    expect(road).toContain("CAR_SHAPE");
    // and the four old literals are gone from the file, not merely unused
    for (const gone of ["#ff6a4d", "#ffd9a0", "#ffe9c4", "#bfe8ff"]) {
      expect(road, `${gone} is back in RoadSystem`).not.toContain(gone);
    }
  });
});
