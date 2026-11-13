import { describe, expect, it } from "vitest";

import { CURB_OFFSET } from "../src/city/sidewalks";
import { stopFurnitureParts, stopFurniturePose } from "../src/city/stopFurniture";
import { lampArm, planStreetLamps, planStreetTrees, treeTint } from "../src/city/streetFurniture";
import type { Transit } from "../src/city/openWorldStreets";

const horizontalLane = { x1: 0, z1: 0, x2: 10, z2: 0 };
const verticalLane = { x1: 0, z1: 0, x2: 0, z2: 10 };
const longLane = { x1: 0, z1: 0, x2: 100, z2: 0 };

const transit = (lane: typeof horizontalLane): Transit => ({
  stopPoint: { x: (lane.x1 + lane.x2) / 2, z: (lane.z1 + lane.z2) / 2 },
  stopSegment: { x1: lane.x2, z1: lane.z2, x2: lane.x2, z2: lane.z2 },
  taxiCurb: { x: 0, z: 0 },
  busLane: lane,
  taxiLane: lane,
});

describe("the stop furniture stays on the kerb", () => {
  it("moves 0.65 m behind the sign along the kerb normal", () => {
    const pose = stopFurniturePose({
      ...transit(horizontalLane),
      stopPoint: { x: 5, z: CURB_OFFSET },
    });
    expect(pose.x).toBeCloseTo(5, 6);
    expect(pose.z).toBeCloseTo(CURB_OFFSET + 0.65, 6);
    expect(pose.rotY).toBeCloseTo(0, 6);
  });

  it("turns local +Z onto the normal of a vertical lane", () => {
    const pose = stopFurniturePose({
      ...transit(verticalLane),
      stopPoint: { x: -CURB_OFFSET, z: 5 },
    });
    expect(pose.x).toBeCloseTo(-(CURB_OFFSET + 0.65), 6);
    expect(pose.z).toBeCloseTo(5, 6);
    expect(Math.sin(pose.rotY)).toBeCloseTo(-1, 6);
    expect(Math.cos(pose.rotY)).toBeCloseTo(0, 6);
  });

  it("keeps every box inside the pavement and adds the shelter only for a bus", () => {
    const bench = stopFurnitureParts(false);
    const withShelter = stopFurnitureParts(true);
    expect(bench).toHaveLength(6);
    expect(withShelter).toHaveLength(10);
    expect(bench.some((part) => part.h > 2)).toBe(false);
    expect(withShelter.some((part) => part.h > 2)).toBe(true);
    for (const part of withShelter) {
      expect(part.w).toBeGreaterThan(0);
      expect(part.h).toBeGreaterThan(0);
      expect(part.d).toBeGreaterThan(0);
      expect(part.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const maxZ = Math.max(...withShelter.map((part) => part.z + part.d / 2));
    expect(maxZ).toBeCloseTo(0.43, 6);
  });
});

describe("the street lamps and trees are planned, not scattered", () => {
  it("puts a lamp on the kerb and points its arm over the road", () => {
    const lamps = planStreetLamps([longLane]);
    expect(lamps.length).toBe(7);
    const first = lamps[0]!;
    expect(first.z).toBeCloseTo(CURB_OFFSET + 0.2, 6);
    expect(first.ax).toBeCloseTo(0, 6);
    expect(first.az).toBeCloseTo(-1, 6);
    expect(lamps).toEqual(planStreetLamps([longLane]));
  });

  it("builds the arm and lantern on that same axis", () => {
    const arm = lampArm({ x: 10, z: 3, ax: 1, az: 0 });
    expect(arm.x).toBeCloseTo(10.31, 6);
    expect(arm.z).toBeCloseTo(3, 6);
    expect(arm.headX).toBeCloseTo(10.64, 6);
    expect(arm.headZ).toBeCloseTo(3, 6);
    expect(Math.cos(arm.rotY)).toBeCloseTo(1, 6);
    expect(Math.sin(arm.rotY)).toBeCloseTo(0, 6);
  });

  it("keeps the tree row deterministic and inside its scale band", () => {
    const trees = planStreetTrees([longLane]);
    expect(trees).toEqual(planStreetTrees([longLane]));
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(Math.abs(Math.abs(tree.z) - (CURB_OFFSET + 0.65))).toBeLessThanOrEqual(0.351);
      expect(tree.s).toBeGreaterThanOrEqual(0.8);
      expect(tree.s).toBeLessThanOrEqual(1.24);
    }
  });

  it("caps both rows on a large street list", () => {
    const streets = Array.from({ length: 30 }, () => longLane);
    expect(planStreetLamps(streets)).toHaveLength(160);
    expect(planStreetTrees(streets)).toHaveLength(140);
  });

  it("gives five deterministic tree tints without leaving the green family", () => {
    const tints = Array.from({ length: 5 }, (_, i) => treeTint(i));
    expect(new Set(tints.map((t) => t.hue)).size).toBe(5);
    expect(new Set(tints.map((t) => t.light)).size).toBe(5);
    for (const tint of tints) {
      expect(Math.abs(tint.hue)).toBeLessThanOrEqual(0.012);
      expect(Math.abs(tint.light)).toBeLessThanOrEqual(0.05);
    }
    expect(treeTint(5)).toEqual(treeTint(0));
  });
});
