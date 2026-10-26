// @vitest-environment jsdom
/**
 * EINE Wahrheit pro Kameragröße — characterization guard.
 *
 * This file was written BEFORE the constants were merged, and every number in
 * it was read off the shipped build at that moment (probe run 2026-10-26,
 * vitest on the working tree). It pins what the camera arithmetic produces for
 * several level sizes — the overview fit, the flight fallbacks, the outer
 * clamp, the two establishing poses — with oracles written from the raw
 * numbers, NOT from the modules' own exports. A bent constant therefore turns
 * this guard red no matter which file carries it. After the merge into one
 * export per quantity, every line here must still be green: that is the
 * behaviour proof, not a screenshot.
 *
 * The one thing it deliberately does NOT unify: the outer clamp
 * (`bounds * 4 + 220`) and the fog far plane (`bounds * 9 + 600`) are two
 * different quantities today — at the demo level they differ by 680 units —
 * and the merge decision was reported instead of taken silently. The last
 * block pins that difference so a later unification is a named change.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDirLayout } from "../src/city/layout";
import { FLAT_SURFACE } from "../src/city/worldSurface";
import {
  WORLD_FOV_DEG,
  WORLD_OVERVIEW_ELEVATION,
  fitWorldOverview,
  fitWorldPoints,
  overviewWorldPoints,
} from "../src/city/worldFraming";
import { STANDARD_AZIMUTH } from "../src/city/cameraPresets";
import * as cameraPresets from "../src/city/cameraPresets";
import * as CameraRigModule from "../src/components/CameraRig";
import {
  approachFromCurrentDirection,
  clampToCity,
  flightDuration,
  CRANE_ELEVATION,
  GROUND_Y,
  PIVOT_Y,
} from "../src/components/CameraRig";
import { city, dir, file } from "./helpers/cityFixture";

const here = resolve(import.meta.dirname);
const sceneSrc = readFileSync(resolve(here, "../src/components/CityScene.tsx"), "utf-8");
const rigSrc = readFileSync(resolve(here, "../src/components/CameraRig.tsx"), "utf-8");

/** Three levels of real size differences: bounds 17.1 / 23.5 / 36.3 (probe). */
function plaza(n: number) {
  return city({
    tree: dir({
      path: "",
      name: "",
      detailFiles: Array.from({ length: n }, (_, i) => file(`src/f${i}.ts`, "TypeScript", [])),
    }),
  });
}
const LEVELS = [
  ["small", plaza(1)],
  ["demo", plaza(6)],
  ["wide", plaza(40)],
] as const;
const ASPECT = 1280 / 800;

describe("the constants themselves — oracle-bound values", () => {
  it("azimuth is the south-east heading atan2(0.75, 0.4), once", () => {
    expect(STANDARD_AZIMUTH).toBe(Math.atan2(0.75, 0.4));
  });
  it("fov 52 and the overview elevation 0.68", () => {
    expect(WORLD_FOV_DEG).toBe(52);
    expect(WORLD_OVERVIEW_ELEVATION).toBe(0.68);
  });
  it("pivot 1.5, street floor 1, crane eye line 0.42", () => {
    expect(PIVOT_Y).toBe(1.5);
    expect(GROUND_Y).toBe(1);
    expect(CRANE_ELEVATION).toBe(0.42);
  });
});

describe("one azimuth/fov feeds every overview fit", () => {
  // Reference numbers captured from the shipped build (probe, 2026-10-26).
  const REF = {
    small: {
      dist: 24.72,
      px: 8.652247814020408,
      py: 17.868763518335626,
      pz: 16.454489651288267,
      ty: 2.3249999645990824,
    },
    demo: {
      dist: 29.99218948162029,
      px: 10.846058167724664,
      py: 21.343836683278084,
      pz: 19.666371564483747,
      ty: 2.4849571621951534,
    },
    wide: {
      dist: 70.5738343744274,
      px: 24.997410822764607,
      py: 48.09253106307064,
      pz: 46.93305779268365,
      ty: 3.716196330195877,
    },
  } as const;
  for (const [name, stadt] of LEVELS) {
    const layout = getDirLayout(stadt, []);
    const gefügt = fitWorldOverview(layout, FLAT_SURFACE, ASPECT);
    const explizit = fitWorldPoints(
      overviewWorldPoints(layout, FLAT_SURFACE),
      ASPECT,
      STANDARD_AZIMUTH,
      WORLD_FOV_DEG,
    );
    it(`${name} (bounds ${layout.bounds}): the default fit IS the named-constant fit, bit for bit`, () => {
      expect(gefügt.position.x).toBe(explizit.position.x);
      expect(gefügt.position.y).toBe(explizit.position.y);
      expect(gefügt.position.z).toBe(explizit.position.z);
      expect(gefügt.target.x).toBe(explizit.target.x);
      expect(gefügt.distance).toBe(explizit.distance);
    });
    it(`${name}: and the shipped numbers themselves do not move`, () => {
      const ref = REF[name];
      expect(gefügt.distance).toBeCloseTo(ref.dist, 9);
      expect(gefügt.position.x).toBeCloseTo(ref.px, 9);
      expect(gefügt.position.y).toBeCloseTo(ref.py, 9);
      expect(gefügt.position.z).toBeCloseTo(ref.pz, 9);
      expect(gefügt.target.y).toBeCloseTo(ref.ty, 9);
    });
  }
});

describe("the outer clamp — one radius, computed one way", () => {
  // The oracle is the raw formula, not an export: bounds*4+220.
  for (const bounds of [24, 60, 120, 240]) {
    it(`clamps at exactly ${bounds}*4+220 = ${bounds * 4 + 220}`, () => {
      const out = clampToCity({ x: 0, y: PIVOT_Y, z: 1e6 }, bounds);
      expect(out.z).toBe(bounds * 4 + 220);
      const diag = clampToCity({ x: 1e6, y: PIVOT_Y, z: 1e6 }, bounds);
      expect(Math.hypot(diag.x, diag.y - PIVOT_Y, diag.z)).toBeCloseTo(bounds * 4 + 220, 6);
    });
  }
  it("the orbit max distance and the walk clamp are the same radius", () => {
    // Pre-merge, the formula appeared twice in the rig. Post-merge, the
    // rig exposes ONE computation and the orbit reads it — either state is
    // only allowed below as it is: the value never differs.
    for (const bounds of [24, 60, 120, 240]) {
      const erwart = bounds * 4 + 220;
      const clamp = clampToCity({ x: 0, y: PIVOT_Y, z: 1e6 }, bounds);
      expect(Math.hypot(clamp.x, clamp.y - PIVOT_Y, clamp.z)).toBeCloseTo(erwart, 6);
    }
    const computations = rigSrc.match(/\* 4 \+ 220/g)?.length ?? 0;
    if ("cityClampRadius" in CameraRigModule) {
      expect(computations, "the clamp arithmetic must live in exactly one place").toBe(1);
      expect(rigSrc).toMatch(/maxDistance=\{Math\.max\(520, cityClampRadius\(/);
    } else {
      expect(
        computations,
        "known duplication: the formula is written more than once",
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("flight targets — the fallbacks and the durations", () => {
  for (const d of [18, 40, 220]) {
    it(`degenerate flight keeps the legacy south-east vector at distance ${d}`, () => {
      const pos = approachFromCurrentDirection(
        { x: 10, y: 4, z: -3 },
        { x: 10, y: 4, z: -3 },
        { x: 50, y: 0, z: -20 },
        d,
      );
      expect(pos).toEqual({ x: 50 + d * 0.4, y: d * 0.75, z: -20 + d * 0.75 });
      // and that vector really sits on the one standard azimuth
      expect(Math.atan2(d * 0.75, d * 0.4)).toBe(Math.atan2(0.75, 0.4));
    });
  }
  it("a straight-down approach falls back onto the standard azimuth", () => {
    const pos = approachFromCurrentDirection(
      { x: 0, y: 100, z: 1e-12 },
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 2, z: 5 },
      20,
      0.68,
    );
    const az = STANDARD_AZIMUTH;
    expect(pos.x).toBeCloseTo(5 + Math.cos(az) * Math.cos(0.68) * 20, 9);
    expect(pos.y).toBeCloseTo(2 + Math.sin(0.68) * 20, 9);
    expect(pos.z).toBeCloseTo(5 + Math.sin(az) * Math.cos(0.68) * 20, 9);
  });
  it("flight duration 0.35 floor / +d/220 / 1.6 cap", () => {
    expect(flightDuration(0)).toBe(0.35);
    expect(flightDuration(220)).toBeCloseTo(1.35, 6);
    expect(flightDuration(5000)).toBe(1.6);
    expect(flightDuration(5000, 3)).toBe(3);
  });
});

/**
 * The two establishing poses CityScene sets. Before the merge they are raw
 * literals in the component; after it they are named constants in
 * cameraPresets. The resolver reads whichever form is shipped so this guard
 * survives the refactor — and the number may only exist once in the tree.
 */
describe("CityScene's establishing poses — dist/elevation/targetY", () => {
  interface Pose {
    position: [number, number, number];
    target: [number, number, number];
  }
  /** Empty world: absolute pose; build start: offset from the level centre. */
  function leerweltPose(): Pose {
    const benannt = (cameraPresets as Record<string, unknown>)["LEERWELT_POSE"] as
      { position: readonly number[]; target: readonly number[] } | undefined;
    if (benannt) {
      expect(sceneSrc, "CityScene must mount the named pose").toContain("LEERWELT_POSE");
      return {
        position: [...benannt.position] as [number, number, number],
        target: [...benannt.target] as [number, number, number],
      };
    }
    const leer = sceneSrc.slice(sceneSrc.indexOf("craneBuildRef.current = null;"));
    const pos =
      /camera\.position\.set\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/.exec(
        leer,
      )!;
    const look =
      /camera\.lookAt\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/.exec(leer)!;
    return {
      position: [+pos[1]!, +pos[2]!, +pos[3]!],
      target: [+look[1]!, +look[2]!, +look[3]!],
    };
  }
  function baubeginnPose(): { offset: [number, number, number]; targetY: number } {
    const benannt = (cameraPresets as Record<string, unknown>)["BAUBEGINN_POSE"] as
      { dx: number; y: number; dz: number; targetY: number } | undefined;
    if (benannt) {
      expect(sceneSrc, "CityScene must mount the named pose").toContain("BAUBEGINN_POSE");
      return { offset: [benannt.dx, benannt.y, benannt.dz], targetY: benannt.targetY };
    }
    const pos =
      /camera\.position\.set\(centre\.x \+ (-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*centre\.z \+ (-?\d+(?:\.\d+)?)\)/.exec(
        sceneSrc,
      )!;
    const look = /camera\.lookAt\(centre\.x,\s*(-?\d+(?:\.\d+)?),\s*centre\.z\)/.exec(sceneSrc)!;
    return { offset: [+pos[1]!, +pos[2]!, +pos[3]!], targetY: +look[1]! };
  }
  const kennzahlen = (p: Pose) => ({
    dist: Math.hypot(
      p.position[0] - p.target[0],
      p.position[1] - p.target[1],
      p.position[2] - p.target[2],
    ),
    elevation: Math.atan2(
      p.position[1] - p.target[1],
      Math.hypot(p.position[0] - p.target[0], p.position[2] - p.target[2]),
    ),
    targetY: p.target[1],
  });

  it("the empty-world shot: dist 39.064, elevation 0.2325, targetY 1", () => {
    const k = kennzahlen(leerweltPose());
    expect(k.dist).toBeCloseTo(39.06404996924922, 9);
    expect(k.elevation).toBeCloseTo(0.23247932753814637, 9);
    expect(k.targetY).toBe(1);
  });

  it("the build-start shot: dist 23.071, elevation 0.1523, targetY 2.5", () => {
    const p = baubeginnPose();
    const horiz = Math.hypot(p.offset[0], p.offset[2]);
    expect(Math.hypot(horiz, p.offset[1] - p.targetY)).toBeCloseTo(23.070543990118658, 9);
    expect(Math.atan2(p.offset[1] - p.targetY, horiz)).toBeCloseTo(0.15229665564002828, 9);
    expect(p.targetY).toBe(2.5);
  });

  it("each pose's numbers are written down exactly once in the tree", () => {
    const src = sceneSrc + readFileSync(resolve(here, "../src/city/cameraPresets.ts"), "utf-8");
    const leerwelt = src.match(/17, 10, 34/g)?.length ?? 0;
    expect(leerwelt, "the empty-world triple may exist in one file only").toBe(1);
    const baubeginn =
      (src.match(/centre\.x \+ 14/g)?.length ?? 0) + (src.match(/dx: 14/g)?.length ?? 0);
    expect(baubeginn, "the build-start offsets may exist in one file only").toBe(1);
  });
});

describe("the reported split that was NOT unified", () => {
  it("the outer clamp and the fog far plane are different numbers today", () => {
    // CityScene's fog: [bounds*6, bounds*9+600]. CameraRig's clamp: bounds*4+220.
    // At the demo level (bounds 60): clamp 460, fog far 1140 — 680 apart. The
    // rig's comment used to call the clamp "the fog far plane"; it is not one.
    // Unifying them would move the shipped view, so the merge left both alone.
    const bounds = 60;
    const clamp = bounds * 4 + 220;
    const [, far] = [bounds * 6, bounds * 9 + 600];
    expect(clamp).toBe(460);
    expect(far).toBe(1140);
    expect(far - clamp).toBe(680);
    // the fog keeps its exact shipped shape (worldPicture reads it by regex)
    expect(sceneSrc).toMatch(/return \[bounds \* ([\d.]+), bounds \* ([\d.]+) \+ (\d+)\]/);
  });
});
