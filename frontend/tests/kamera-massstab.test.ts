// @vitest-environment jsdom
/**
 * Characterization guard for Task #7 (fov twins + the three world rulers).
 *
 * Every number below was read off the shipped working tree BEFORE the edit
 * (probe run 2026-10-26, vitest on these exact fixtures) and must still be
 * green AFTER it: the fov unification and the PIVOT_Y alias may move who
 * owns a digit, never what a level evaluates to. The three-ruler table is
 * pinned so a later unification of fog/collar/ramp is a named, measured
 * change and not a side effect.
 *
 * The levels are synthetic and deterministic (same fixtures as
 * `kamera-konstanten.test.ts`, plus one districted) — no repo scan, so this
 * file cannot drift with the repository's file count.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { craneShot, farLodExitDistance, getDirLayout, overviewShot } from "../src/city/layout";
import { CAMERA_FOV_DEG } from "../src/city/waypoint";
import { WORLD_FOV_DEG } from "../src/city/worldFraming";
import { GROUND_RAMP, groundFrameRadius, grownFootprint } from "../src/render/ground";
import { CELL_SPREAD } from "../src/components/HeatCells";
import { fogRange } from "../src/components/CityScene";
import { PIVOT_Y, cityClampRadius } from "../src/components/CameraRig";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData } from "../src/city/types";

function plaza(n: number): CityData {
  return city({
    tree: dir({
      path: "",
      name: "",
      detailFiles: Array.from({ length: n }, (_, i) => file(`src/f${i}.ts`, "TypeScript", [])),
    }),
  });
}

/** A level wide enough to carry real district blocks. */
function districted(): CityData {
  return city({
    tree: dir({
      path: "",
      name: "",
      detailFiles: Array.from({ length: 6 }, (_, i) => file(`src/f${i}.ts`, "TypeScript", [])),
      children: Array.from({ length: 8 }, (_, k) =>
        dir({
          path: `d${k}`,
          name: `d${k}`,
          detailFiles: Array.from({ length: 24 }, (_, i) =>
            file(`d${k}/f${i}.ts`, "TypeScript", []),
          ),
        }),
      ),
    }),
  });
}

/** What the shipped CityScene frame computes for a layout: bounds plus the
 * ground ruler (`groundFrameRadius` of the grown footprints, about the centre). */
function rulers(stadt: CityData) {
  const layout = getDirLayout(stadt, []);
  const radius = groundFrameRadius(
    [
      ...layout.buildings.map((b) => grownFootprint(b, CELL_SPREAD.building)),
      ...layout.blocks.map((b) => grownFootprint(b, CELL_SPREAD.block)),
    ],
    layout.centre,
  );
  const [fogNear, fogFar] = fogRange(layout.bounds);
  const collar = cityClampRadius(layout.bounds);
  return {
    bounds: layout.bounds,
    radius,
    fogNear,
    fogFar,
    collar,
    maxDistance: Math.max(520, collar),
    farLodExit: farLodExitDistance(layout.bounds),
    rampHazeStart: radius * GROUND_RAMP.hazeStart,
    rampHazeEnd: radius * GROUND_RAMP.hazeEnd,
    rampAoEnd: radius * GROUND_RAMP.aoEnd,
  };
}

const appSrc = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf-8");
const cityTreeSrc = readFileSync(
  resolve(import.meta.dirname, "../src/components/CityTree.tsx"),
  "utf-8",
);

describe("fov — one number, read at all four places", () => {
  it("both module exports are 52 and are each other", () => {
    expect(WORLD_FOV_DEG).toBe(52);
    expect(CAMERA_FOV_DEG).toBe(52);
    expect(CAMERA_FOV_DEG).toBe(WORLD_FOV_DEG);
  });
  it("the digits the source-reading guards insist on still read 52", () => {
    const app = Number(/fov:\s*(\d+)/.exec(appSrc)?.[1]);
    const chip = Number(/const CHIP_FOV_DEG = ([\d.]+);/.exec(cityTreeSrc)?.[1]);
    expect(app, "waypoint.test and typeFloor read the App Canvas digit from source").toBe(52);
    expect(chip, "typeFloor reads the CityTree chip digit from source").toBe(52);
  });
});

describe("the aim floor — the level flights and the orbit pivot are one measure", () => {
  it("PIVOT_Y, the overview floor and the crane floor are all 1.5, bit for bit", () => {
    expect(PIVOT_Y).toBe(1.5);
    for (const bounds of [24, 60, 120, 240]) {
      expect(overviewShot(bounds, 0).targetY, `overview floor at bounds ${bounds}`).toBe(PIVOT_Y);
      expect(craneShot(bounds, 0).targetY, `crane floor at bounds ${bounds}`).toBe(PIVOT_Y);
    }
  });
  it("above the floor the two reads stay themselves", () => {
    expect(overviewShot(60, 10).targetY).toBe(4); // tallest*0.4
    expect(craneShot(82, 10).targetY).toBe(3.5); // top*0.35
  });
});

describe("the three rulers of one world — today's table, pinned", () => {
  const LEVELS: ReadonlyArray<readonly [string, CityData, Record<string, number>]> = [
    [
      "small",
      plaza(1),
      {
        bounds: 17.1,
        radius: 1.8128000000000002,
        fogNear: 102.60000000000001,
        fogFar: 753.9,
        collar: 288.4,
        maxDistance: 520,
        farLodExit: 118.99999999999999,
        rampHazeStart: 2.7192000000000003,
        rampHazeEnd: 5.800960000000001,
        rampAoEnd: 4.0788,
      },
    ],
    [
      "demo",
      plaza(6),
      {
        bounds: 23.5,
        radius: 8.5866,
        fogNear: 141,
        fogFar: 811.5,
        collar: 314,
        maxDistance: 520,
        farLodExit: 118.99999999999999,
        rampHazeStart: 12.879900000000001,
        rampHazeEnd: 27.477120000000003,
        rampAoEnd: 19.319850000000002,
      },
    ],
    [
      "wide",
      plaza(40),
      {
        bounds: 36.300000000000004,
        radius: 21.572800000000004,
        fogNear: 217.8,
        fogFar: 926.7,
        collar: 365.20000000000005,
        maxDistance: 520,
        farLodExit: 137.94,
        rampHazeStart: 32.35920000000001,
        rampHazeEnd: 69.03296000000002,
        rampAoEnd: 48.53880000000001,
      },
    ],
    [
      "districts",
      districted(),
      {
        bounds: 91.17756720905498,
        radius: 82.20422021446211,
        fogNear: 547.0654032543299,
        fogFar: 1420.598104881495,
        collar: 584.7102688362199,
        maxDistance: 584.7102688362199,
        farLodExit: 346.47475539440893,
        rampHazeStart: 123.30633032169317,
        rampHazeEnd: 263.05350468627876,
        rampAoEnd: 184.95949548253975,
      },
    ],
  ] as const;
  for (const [name, stadt, erwartet] of LEVELS) {
    const real = rulers(stadt) as unknown as Record<string, number>;
    for (const [key, value] of Object.entries(erwartet)) {
      it(`${name}: ${key} does not move`, () => {
        expect(real[key], `${name}.${key}`).toBeCloseTo(value, 9);
      });
    }
  }
});

describe("the disagreements this round reports instead of unifying", () => {
  it("the collar sits inside the fog far plane by 680 at bounds 60", () => {
    expect(cityClampRadius(60)).toBe(460);
    expect(fogRange(60)).toEqual([360, 1140]);
    expect(fogRange(60)[1] - cityClampRadius(60)).toBe(680);
  });
  it("the ground ramp is normalized by the drawn footprint, the fog by absolute distance", () => {
    // districts level: haze completes at 263.05 while the fog only starts at
    // 547.07 — the same distance carries two different readings because the
    // rulers measure different observables (floor colour from the level
    // centre vs camera-depth wash). Not one size; unification would move the
    // picture.
    const r = rulers(districted());
    expect(r.rampHazeEnd).toBeLessThan(r.fogNear);
    expect(r.fogNear / r.rampHazeEnd).toBeCloseTo(2.0796, 3);
  });
  it("below bounds 75 the orbit's 520 floor overshoots the collar; the clamp still holds", () => {
    expect(Math.max(520, cityClampRadius(60))).toBe(520);
    expect(cityClampRadius(60)).toBe(460);
    // crossover: the floor stops biting exactly at bounds 75
    expect(cityClampRadius(75)).toBe(520);
  });
});
