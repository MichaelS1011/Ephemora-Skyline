// @vitest-environment node
/**
 * A parked row is still street life: it must sit at the kerb, stay out of the
 * junction mouth, and never turn into an unbounded per-building draw cost.
 */

import { describe, it, expect } from "vitest";
import { parkedCars, PARKED_PAINT } from "../src/city/streetParking";

const street = (x1: number, z1: number, x2: number, z2: number) => ({ x1, z1, x2, z2 });
const layout = (streets: ReturnType<typeof street>[], buildings = 6, blocks = 0) => ({
  buildings: Array.from({ length: buildings }, () => ({})),
  blocks: Array.from({ length: blocks }, () => ({})),
  streets,
});

describe("the parked row", () => {
  it("leaves the two-file level bare", () => {
    expect(parkedCars(layout([street(0, 0, 60, 0)], 2, 1))).toEqual([]);
  });

  it("dresses a wrapper level whose files live in child blocks", () => {
    const cars = parkedCars(layout([street(0, 0, 30, 0)], 0, 2));
    expect(cars).toHaveLength(1);
  });

  it("stands beside the kerb, not in the middle of the lane", () => {
    const cars = parkedCars(layout([street(0, 0, 30, 0)]));
    expect(cars).toHaveLength(1);
    const car = cars[0]!;
    expect(car.x).toBeCloseTo(15, 6);
    expect(Math.abs(car.z)).toBeCloseTo(0.86, 6);
    // body half-width + centre stays on the carriageway side of the kerb
    expect(Math.abs(car.z) + 1.55 / 2).toBeLessThan(2.18);
    expect(car.rotY).toBeCloseTo(0, 6);
  });

  it("keeps clear of both junction mouths", () => {
    const cars = parkedCars(layout([street(0, 0, 72, 0)]));
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      expect(car.x).toBeGreaterThan(72 * 0.2);
      expect(car.x).toBeLessThan(72 * 0.8);
    }
  });

  it("uses only the paved side of a one-sided plaza lane", () => {
    const lane = { ...street(0, 100, 60, 100), oneSided: true };
    const cars = parkedCars(layout([lane]));
    expect(cars).toHaveLength(2);
    expect(cars.every((car) => car.z > 100)).toBe(true);
  });

  it("is deterministic and stays inside the paint list", () => {
    const line = street(-20, -20, 40, 30);
    const a = parkedCars(layout([line, line]));
    const b = parkedCars(layout([line, line]));
    expect(a).toEqual(b);
    for (const car of a) {
      expect(car.paint).toBeGreaterThanOrEqual(0);
      expect(car.paint).toBeLessThan(PARKED_PAINT.length);
    }
  });

  it("varies body length so the kerb does not read as one stamp", () => {
    const cars = parkedCars(layout([street(0, 0, 72, 0)]));
    expect(new Set(cars.map((car) => car.length)).size).toBeGreaterThan(1);
  });

  it("caps a large street list instead of growing the mesh", () => {
    const streets = Array.from({ length: 200 }, (_, i) => street(i * 40, 0, i * 40 + 30, 0));
    expect(parkedCars(layout(streets)).length).toBeLessThanOrEqual(40);
  });
});
