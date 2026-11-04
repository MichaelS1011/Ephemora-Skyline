import { describe, expect, it } from "vitest";
import {
  XRAY_BUILDING_FACTOR,
  xrayLayerPlan,
  type XrayLayer,
  type XraySource,
} from "../src/city/xray";

/**
 * The X-ray lens is one city under a different information layer, not a second
 * city and not a second colour language. These tests pin the pure decisions:
 * every layer the payload can support is on, every layer it cannot support is
 * off, and the bodies recede to one deterministic floor.
 */

function source(overrides: Partial<XraySource> = {}): XraySource {
  return {
    fileConnections: [],
    dirConnections: [],
    files: [],
    meta: { cycles: true, coverage: true, duplicates: true },
    ...overrides,
  };
}

function on(plan: ReturnType<typeof xrayLayerPlan>): XrayLayer[] {
  return [...plan.active];
}

describe("xrayLayerPlan", () => {
  it("keeps every layer the payload can back", () => {
    const plan = xrayLayerPlan(
      source({
        fileConnections: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
        ],
        dirConnections: [{ from: "src", to: "lib" }],
        files: [
          {
            findings: [{ severity: "P0" }],
            inCycle: true,
            coveragePct: 91,
            clonePartners: [{ id: "b" }],
          },
          { findings: [] },
        ],
      }),
    );

    expect(plan.buildingFactor).toBe(XRAY_BUILDING_FACTOR);
    expect(plan.buildingFactor).toBe(0.22);
    expect(plan.importArcs).toBe(true);
    expect(plan.dependencyFlows).toBe(true);
    expect(plan.cycleRings).toBe(true);
    expect(plan.coverageShields).toBe(true);
    expect(plan.cloneLasers).toBe(true);
    expect(plan.findings).toBe(true);
    expect(on(plan)).toEqual(["imports", "flows", "cycles", "findings", "coverage", "clones"]);
  });

  it("claims no layer the payload cannot back", () => {
    const plan = xrayLayerPlan(source());

    expect(plan.buildingFactor).toBe(0.22);
    expect(plan.importArcs).toBe(false);
    expect(plan.dependencyFlows).toBe(false);
    expect(plan.cycleRings).toBe(false);
    expect(plan.coverageShields).toBe(false);
    expect(plan.cloneLasers).toBe(false);
    expect(plan.findings).toBe(false);
    expect(on(plan)).toEqual([]);
  });

  it("keeps import arcs at every level, including a directory-only map", () => {
    const plan = xrayLayerPlan(
      source({
        dirConnections: [{ from: "src", to: "lib" }],
        files: [],
      }),
    );

    expect(plan.importArcs).toBe(true);
    // There is no file edge, so there is no file-to-file stream to claim.
    expect(plan.dependencyFlows).toBe(false);
    expect(on(plan)).toEqual(["imports"]);
  });

  it("only honours optional dimensions the scan actually ran", () => {
    const plan = xrayLayerPlan(
      source({
        files: [
          {
            findings: [],
            inCycle: true,
            coveragePct: 100,
            clonePartners: [{ id: "b" }],
          },
        ],
        meta: { cycles: false, coverage: false, duplicates: false },
      }),
    );

    expect(plan.cycleRings).toBe(false);
    expect(plan.coverageShields).toBe(false);
    expect(plan.cloneLasers).toBe(false);
    expect(on(plan)).toEqual([]);
  });

  it("uses the same 80 % shield threshold the city draws with", () => {
    const below = xrayLayerPlan(source({ files: [{ findings: [], coveragePct: 79 }] }));
    const at = xrayLayerPlan(source({ files: [{ findings: [], coveragePct: 80 }] }));

    expect(below.coverageShields).toBe(false);
    expect(at.coverageShields).toBe(true);
  });

  it("reports findings independently of the optional scan dimensions", () => {
    const plan = xrayLayerPlan(
      source({
        files: [{ findings: [{ severity: "P1" }] }],
        meta: { cycles: false, coverage: false, duplicates: false },
      }),
    );

    expect(plan.findings).toBe(true);
    expect(on(plan)).toEqual(["findings"]);
  });

  it("is deterministic — the same payload always yields the same plan", () => {
    const payload = source({
      fileConnections: [{ from: "a", to: "b" }],
      files: [{ findings: [], coveragePct: 80 }],
    });

    expect(xrayLayerPlan(payload)).toEqual(xrayLayerPlan(payload));
  });
});
