import { describe, expect, it } from "vitest";
import {
  farLodExitDistance,
  FAR_LOD_SAFE_RATIO,
  getDirLayout,
  overviewShot,
  OVERVIEW_FACTOR,
} from "../src/city/layout";
import { LOD_THRESHOLDS } from "../src/hooks/useLodFar";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * The coupling between two numbers that live in different modules:
 *
 * `useStore.flyToDirOverview` decides where a drill-in flight lands.
 * `hooks/useLodFar` decides when the renderer stops mounting buildings and
 * draws the instanced heat grid instead. A flight that lands beyond the
 * heat grid's threshold arrives at a level that is no longer drawn — the
 * user drills into a district and gets flat plates.
 *
 * Measured on a 2901-file city before the fix: the overview of `/core/a`
 * asked for 118.99 m where the heat grid takes over at 119.00 m, and the
 * same level of the same city rendered 164 scene objects in one run and 23
 * in the next, decided by the easing's float noise. The old height term
 * (`tallest × 2.2 + 24`) put any level with a ~43 m crown exactly on that
 * cliff; crowns reach 47.6 m by the voxel rail alone.
 */

function file(over: Partial<CityFile>): CityFile {
  return {
    id: "f",
    name: "a.ts",
    path: "src/a.ts",
    language: "TypeScript",
    linesOfCode: 100,
    cyclomaticComplexity: 5,
    threatLevel: "safe",
    findings: [],
    ...over,
  };
}

function dir(over: Partial<CityDir>): CityDir {
  return {
    name: "x",
    path: "x",
    fileCount: 1,
    linesOfCode: 100,
    languages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [],
    remainingFiles: 0,
    districtFiles: [],
    ...over,
  };
}

function city(tree: CityDir): CityData {
  return {
    repo: { owner: "t", name: "t", branch: "main" },
    totalFiles: 1,
    renderedFiles: 1,
    totalLines: 100,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    languages: {},
    tree,
    fileConnections: [],
    dirConnections: [],
    meta: {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
  };
}

/** The far-LOD's own thresholds, read from the hook module — not restated. */
const enter = (bounds: number) =>
  Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, bounds * LOD_THRESHOLDS.RELATIVE_ENTER);
const exit = (bounds: number) =>
  Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR * 0.7, bounds * LOD_THRESHOLDS.RELATIVE_EXIT);

describe("overview framing stays inside the drawn band", () => {
  const BOUNDS = [30, 50, 64, 88, 124, 200, 400, 1200];
  const TALLEST = [0, 2.2, 12, 34, 47.6, 60, 120, 400];

  it("lands every overview shot below the heat grid's exit threshold", () => {
    for (const bounds of BOUNDS) {
      for (const tallest of TALLEST) {
        const shot = overviewShot(bounds, tallest);
        expect(shot.dist).toBeLessThan(exit(bounds));
      }
    }
  });

  it("keeps the arrival off the flicker band by the margin it claims", () => {
    // Between `exit` and `enter` the heat grid keeps whatever mode it was in —
    // that band is where the measured 164-vs-23 scene-object count flipped on
    // the easing's float noise. So the shot must not merely be under `exit`,
    // it must be under the margin `overviewShot` applies, and the hysteresis
    // it hides behind must have a width at all.
    for (const bounds of BOUNDS) {
      expect(exit(bounds)).toBeLessThan(enter(bounds));
      const worst = Math.max(...TALLEST.map((tallest) => overviewShot(bounds, tallest).dist));
      expect(worst).toBeLessThanOrEqual(exit(bounds) * FAR_LOD_SAFE_RATIO + 1e-9);
    }
  });

  it("mirrors the far-LOD exit the hook computes", () => {
    for (const bounds of BOUNDS) {
      expect(farLodExitDistance(bounds)).toBeCloseTo(exit(bounds), 6);
    }
    // The mirror is only valid while the hook keeps these constants; the
    // assertion above fails the moment it does not.
    // The fitted higher overview now keeps the whole city in frame; its
    // distance band is larger than the old low-angle cropped reveal.
    expect(LOD_THRESHOLDS.RELATIVE_EXIT).toBe(3.8);
    expect(LOD_THRESHOLDS.ABSOLUTE_FLOOR).toBe(170);
  });

  it("frames the crown it is asked to frame", () => {
    // A 47.6 m tower at the widest small level: the shot must clear it inside
    // the 52° vertical field of view, or the fix would just crop the city.
    const shot = overviewShot(50, 47.6);
    const halfFov = (52 / 2) * (Math.PI / 180);
    const visibleAboveTarget = shot.dist * Math.tan(halfFov);
    expect(shot.targetY + visibleAboveTarget).toBeGreaterThanOrEqual(47.6);
    expect(shot.targetY).toBeCloseTo(47.6 * 0.4, 6);
  });

  it("walks the whole level, not the world origin", () => {
    // The reveal at the end of construction uses the same factor the crane's
    // last shot used, so the handover stays continuous.
    expect(OVERVIEW_FACTOR).toBeLessThan(LOD_THRESHOLDS.RELATIVE_EXIT);
    expect(overviewShot(200, 5).dist).toBeCloseTo(200 * OVERVIEW_FACTOR, 6);
  });
});

describe("a drilled-in district is drawn, not tiled", () => {
  it("flies to the level's own plaza, and stays inside the building band", () => {
    // The shape that broke it: one folder, few files, every file complex
    // enough to max the height rail — small bounds, tall crowns.
    const tall = Array.from({ length: 11 }, (_, i) =>
      file({ id: `f${i}`, linesOfCode: 540, cyclomaticComplexity: 450, importCount: 13 }),
    );
    const leaf = dir({
      name: "a",
      path: "core/a",
      fileCount: 11,
      linesOfCode: 6000,
      detailFiles: tall,
    });
    const core = dir({
      name: "core",
      path: "core",
      fileCount: 11,
      linesOfCode: 6000,
      detailFiles: tall,
      children: [leaf],
    });
    const c = city(dir({ fileCount: 11, linesOfCode: 6000, children: [core], detailFiles: tall }));

    const layout = getDirLayout(c, ["core", "a"]);
    const tallest = Math.max(...layout.buildings.map((b) => b.h));
    const shot = overviewShot(layout.bounds, tallest);
    expect(shot.dist).toBeLessThan(exit(layout.bounds));

    // And the flight the store actually issues asks for that shot, aimed at
    // where the level stands rather than at the world origin.
    useStore.getState().setCityData(c);
    useStore.getState().setFocusPath(["core", "a"]);
    const req = useStore.getState().flyRequest;
    expect(req).not.toBeNull();
    expect(req!.distance).toBeCloseTo(shot.dist, 6);
    expect(req!.x).toBeCloseTo(layout.centre.x, 6);
    expect(req!.z).toBeCloseTo(layout.centre.z, 6);
    expect(req!.targetY).toBeCloseTo(shot.targetY, 6);
    useStore.getState().setCityData(null);
  });
});
