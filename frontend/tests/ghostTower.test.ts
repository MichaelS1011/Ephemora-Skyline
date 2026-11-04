import { describe, expect, it } from "vitest";
import { ghostTowerPlan, type GhostTowerPlacement } from "../src/components/GhostTower";
import { planRefactorSandbox } from "../src/city/refactorSandbox";
import { file } from "./helpers/cityFixture";

/**
 * The ghost is the 3D promise of the sandbox: it must draw the scenario's
 * height, never a made-up one, and it must refuse a scenario that belongs to a
 * different file. The plan is pure, so these cases run without WebGL.
 */

const target = file("src/big.ts", "TypeScript", [], undefined, {
  id: "big",
  linesOfCode: 400,
  cyclomaticComplexity: 40,
  importCount: 8,
});

const placement: GhostTowerPlacement = {
  x: 4,
  z: -2,
  w: 3,
  d: 2.4,
  fileId: "big",
};

describe("the GhostTower plan", () => {
  it("draws nothing without a scenario or for a scenario of another file", () => {
    expect(ghostTowerPlan(null, placement)).toBeNull();
    const other = planRefactorSandbox(target, "split");
    expect(ghostTowerPlan(other, { ...placement, fileId: "another" })).toBeNull();
  });

  it("uses the scenario height for split and extract", () => {
    for (const action of ["split", "extract"] as const) {
      const scenario = planRefactorSandbox(target, action);
      const plan = ghostTowerPlan(scenario, placement);
      expect(plan?.kind).toBe("tower");
      expect(plan?.height).toBeCloseTo(scenario.scenario.height, 12);
      expect(plan?.width).toBeGreaterThan(placement.w);
      expect(plan?.depth).toBeGreaterThan(placement.d);
    }
  });

  it("uses the original height for a test shield, not an invented tower", () => {
    const scenario = planRefactorSandbox(target, "test");
    const plan = ghostTowerPlan(scenario, placement);
    expect(plan?.kind).toBe("shield");
    expect(plan?.height).toBeCloseTo(scenario.original.height + 0.5, 12);
  });

  it("leaves the placement inputs untouched", () => {
    const before = JSON.stringify(placement);
    ghostTowerPlan(planRefactorSandbox(target, "extract"), placement);
    expect(JSON.stringify(placement)).toBe(before);
  });
});
