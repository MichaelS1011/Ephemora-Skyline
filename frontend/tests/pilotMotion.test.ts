import { describe, expect, it } from "vitest";
import { BANNER_DROP, BANNER_H, BANK_MAX, CITY_TOP, SPEED } from "../src/city/airshowMotion";
import { farLodExitDistance } from "../src/city/layout";
import { cityClampRadius } from "../src/components/CameraRig";
import { LOD_THRESHOLDS } from "../src/hooks/useLodFar";
import {
  PILOT_CEIL,
  PILOT_FLOOR_AGL,
  PILOT_HULL_CLEAR,
  PILOT_INPUT_IDLE,
  PILOT_SCALE,
  PILOT_SEAT_Y,
  PILOT_SPEED_MAX,
  PILOT_SPEED_MIN,
  PILOT_SPEED_START,
  PILOT_WALL_SOFT,
  PILOT_YAW_RATE,
  pilotStateAt,
  pilotWall,
  pushOutOfTowers,
  setFlying,
  isFlying,
  stepPilot,
  type PilotLimits,
  type PilotTower,
} from "../src/city/pilotMotion";

/**
 * The flight law, before anything flies.
 *
 * Every case here is about a promise the mode makes to the reader: no crash,
 * no death, no surprise wall, and a floor that exists because of the towed
 * cloth rather than because a street is at zero. The three hard numbers are
 * derived from constants that already ship (`BANNER_DROP`, `BANNER_H`,
 * `CITY_TOP`) and the wall is the one `min()` of two numbers the app already
 * pins — so this file's job is to keep that true.
 */

const OPEN: PilotLimits = { wall: 10_000, centreX: 0, centreZ: 0 };
const step = (state: ReturnType<typeof pilotStateAt>, input = PILOT_INPUT_IDLE, dt = 1 / 60) =>
  stepPilot(state, input, dt, OPEN);

describe("the numbers the flight stands on", () => {
  it("puts the floor where the towed cloth is, not on the street", () => {
    // A hull lower than this drags a 26 × 5,2 plate through the asphalt.
    expect(PILOT_FLOOR_AGL).toBe(BANNER_DROP + BANNER_H / 2 + 1);
    expect(PILOT_FLOOR_AGL).toBeCloseTo(14.6, 6);
  });

  it("takes the ceiling from the one number the camera rig flies under", () => {
    expect(PILOT_CEIL).toBe(CITY_TOP);
    expect(PILOT_CEIL).toBe(130);
  });

  it("starts at the show's speed, so entering is a handover", () => {
    expect(PILOT_SPEED_START).toBe(SPEED);
    expect(PILOT_SPEED_MIN).toBeLessThan(PILOT_SPEED_START);
    expect(PILOT_SPEED_MAX).toBeGreaterThan(PILOT_SPEED_START);
  });

  it("walls the flight before the level would stop being drawn as buildings", () => {
    // The two numbers already exist and are already pinned elsewhere: the
    // camera's collar (`bounds*4+220`) and the far-LOD band (`bounds*3.8`).
    for (const bounds of [24, 60, 120, 240]) {
      const collar = cityClampRadius(bounds);
      const drawn = farLodExitDistance(bounds);
      const enter = Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, bounds * LOD_THRESHOLDS.RELATIVE_ENTER);
      const wall = pilotWall(collar, drawn);
      expect(wall, `a pilot at bounds ${bounds} could fly into the heat grid`).toBeLessThan(enter);
    }
    // The shape that matters most: the demo level, 60 units.
    expect(cityClampRadius(60)).toBe(460);
    expect(farLodExitDistance(60)).toBeCloseTo(228, 6);
    expect(pilotWall(460, 228)).toBeCloseTo(228, 6);
  });
});

describe("stepping the flight", () => {
  it("clamps a sleeping tab instead of jumping half a lap", () => {
    const a = pilotStateAt({ x: 0, z: 0, heading: 0 });
    const b = pilotStateAt({ x: 0, z: 0, heading: 0 });
    stepPilot(a, { ...PILOT_INPUT_IDLE, throttle: 1 }, 5, OPEN);
    stepPilot(b, { ...PILOT_INPUT_IDLE, throttle: 1 }, 0.1, OPEN);
    expect(a.speed).toBe(b.speed);
    expect(a.x).toBe(b.x);
  });

  it("moves the airspeed with the throttle and never past the band", () => {
    const s = pilotStateAt();
    for (let i = 0; i < 600; i++) step(s, { ...PILOT_INPUT_IDLE, throttle: 1 });
    expect(s.speed).toBe(PILOT_SPEED_MAX);
    for (let i = 0; i < 600; i++) step(s, { ...PILOT_INPUT_IDLE, throttle: -1 });
    expect(s.speed).toBe(PILOT_SPEED_MIN);
  });

  it("turns at its stated rate at the show's speed", () => {
    const s = pilotStateAt({ heading: 0 });
    for (let i = 0; i < 60; i++) step(s, { ...PILOT_INPUT_IDLE, yaw: 1 });
    expect(s.heading).toBeCloseTo(PILOT_YAW_RATE, 2);
  });

  it("leans the wings into a turn the reader did not ask for", () => {
    const s = pilotStateAt();
    for (let i = 0; i < 120; i++) step(s, { ...PILOT_INPUT_IDLE, yaw: 1 });
    expect(s.bank).toBeGreaterThan(0);
    expect(Math.abs(s.bank)).toBeLessThanOrEqual(BANK_MAX + 1e-9);
  });

  it("holds the floor and the ceiling without ever ending the flight", () => {
    const low = pilotStateAt({ agl: PILOT_FLOOR_AGL });
    for (let i = 0; i < 300; i++) step(low, { ...PILOT_INPUT_IDLE, pitch: -1 });
    expect(low.agl).toBe(PILOT_FLOOR_AGL);

    const high = pilotStateAt({ agl: PILOT_CEIL });
    for (let i = 0; i < 300; i++) step(high, { ...PILOT_INPUT_IDLE, pitch: 1 });
    expect(high.agl).toBe(PILOT_CEIL);
  });

  it("flies to the wall and stops there, never through it", () => {
    const limits: PilotLimits = { wall: 120, centreX: 0, centreZ: 0 };
    const s = pilotStateAt({ x: 0, z: 0, heading: 0, speed: PILOT_SPEED_MAX });
    for (let i = 0; i < 2000; i++)
      stepPilot(s, { ...PILOT_INPUT_IDLE, throttle: 1 }, 1 / 30, limits);
    const dist = Math.hypot(s.x, s.z);
    expect(dist).toBeLessThanOrEqual(120 + 1e-6);
    expect(dist).toBeGreaterThan(120 - PILOT_WALL_SOFT - 1);
  });
});

describe("towers push, they never stop", () => {
  const tower: PilotTower = { x: 0, z: 0, w: 6, d: 6, top: 40 };

  it("squeezes the aircraft out through the nearer face and keeps its heading", () => {
    const s = pilotStateAt({ x: 1, z: 0.2, agl: 30, heading: 1.2, speed: 20 });
    const touched = pushOutOfTowers(s, [tower]);
    expect(touched).toBe(true);
    expect(s.heading).toBe(1.2);
    expect(Math.abs(s.x - tower.x)).toBeGreaterThanOrEqual(tower.w / 2 + PILOT_HULL_CLEAR);
    expect(s.speed).toBeLessThan(20);
    expect(s.speed).toBeGreaterThanOrEqual(PILOT_SPEED_MIN);
  });

  it("nudges before it touches, so the reader can still turn", () => {
    const outside = tower.w / 2 + PILOT_HULL_CLEAR + 2;
    const s = pilotStateAt({ x: outside, z: 0, agl: 30, heading: Math.PI, speed: 18 });
    const before = s.x;
    expect(pushOutOfTowers(s, [tower])).toBe(true);
    expect(s.x).toBeGreaterThan(before);
    expect(s.heading).toBe(Math.PI);
  });

  it("leaves the air clear above the roof", () => {
    const s = pilotStateAt({ x: 0, z: 0, agl: tower.top + PILOT_HULL_CLEAR + 1, speed: 18 });
    const before = { x: s.x, z: s.z, speed: s.speed };
    expect(pushOutOfTowers(s, [tower])).toBe(false);
    expect({ x: s.x, z: s.z, speed: s.speed }).toEqual(before);
  });
});

describe("the seat", () => {
  it("sits above the fin, not inside it", () => {
    // The fin's top in the hull's own frame (BannerPlane.hullGeometry: the fin
    // box at y 0,52 half-height 0,36). A seat below it fills the frame with the
    // aircraft's own tail — measured on the first cockpit frame, which showed
    // exactly that.
    const FIN_TOP = 0.88;
    expect(PILOT_SEAT_Y).toBeGreaterThan(FIN_TOP);
  });

  it("flies at one fixed scale, because the camera now rides the aircraft", () => {
    // The show's scale is derived from the camera's distance; with the camera
    // in the seat that is a feedback loop. One constant, no easing.
    expect(PILOT_SCALE).toBe(1);
  });
});

describe("the flight flag is a channel, not a store write", () => {
  it("reports what it was set to and starts off", () => {
    setFlying(false);
    expect(isFlying()).toBe(false);
    setFlying(true);
    expect(isFlying()).toBe(true);
    setFlying(false);
  });
});
