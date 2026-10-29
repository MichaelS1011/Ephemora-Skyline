import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRIVE_HULL_CLEAR,
  DRIVE_INPUT_IDLE,
  DRIVE_SPEED_MAX,
  DRIVE_SPEED_REVERSE,
  carRoll,
  driveRefusal,
  driveStateAt,
  pushCarOutOfTowers,
  stepDrive,
  type DriveLimits,
  type DriveTower,
} from "../src/city/driveMotion";

/**
 * The drive law, before anybody drives.
 *
 * The three promises this file keeps: a car that stands still does not turn, a
 * car goes the way the key points, and nothing in the mode can end the drive.
 * All three are pure arithmetic here, so no browser and no frame are involved.
 */

const OPEN: DriveLimits = { wall: 10_000, centreX: 0, centreZ: 0 };
const step = (s: ReturnType<typeof driveStateAt>, input = DRIVE_INPUT_IDLE, dt = 1 / 60) =>
  stepDrive(s, input, dt, OPEN);

describe("a car is not an aircraft", () => {
  it("does not turn while it stands still, whatever the wheel does", () => {
    const s = driveStateAt({ x: 0, z: 0, heading: 0, speed: 0 });
    for (let i = 0; i < 120; i++) step(s, { throttle: 0, steer: 1 });
    expect(s.heading).toBe(0);
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
    // …but the wheel itself did turn, so the next metre goes where it points
    expect(s.steer).toBeGreaterThan(0.3);
  });

  it("turns a tighter circle at walking pace than at full speed", () => {
    // The circle, not the rate: the fast car sweeps more radians per second AND
    // a wider arc — v / yawrate is the radius a reader sees on the street.
    const radius = (speed: number): number => {
      const s = driveStateAt({ speed });
      let turned = 0;
      for (let i = 0; i < 240; i++) {
        // Hold the speed this circle is measured at: coasting would stop the car
        // inside the window and turn a radius into a division by zero.
        s.speed = speed;
        const before = s.heading;
        step(s, { throttle: 0, steer: 1 }, 1 / 60);
        if (i >= 120) turned += Math.abs(s.heading - before);
      }
      return speed / (turned / (119 / 60));
    };
    expect(radius(3)).toBeLessThan(radius(DRIVE_SPEED_MAX));
  });
});

describe("the car goes the way the key points", () => {
  it("steers right on a positive input and left on a negative one", () => {
    const right = driveStateAt({ speed: 4 });
    const left = driveStateAt({ speed: 4 });
    for (let i = 0; i < 60; i++) {
      step(right, { throttle: 0, steer: 1 });
      step(left, { throttle: 0, steer: -1 });
    }
    expect(right.heading).toBeGreaterThan(0);
    expect(left.heading).toBeLessThan(0);
  });

  it("swings the nose the other way when it reverses", () => {
    // One of the three reasons this is a second law: the same wheel, the other
    // way round, because the back of the car goes first.
    const back = driveStateAt({ speed: -2 });
    for (let i = 0; i < 60; i++) step(back, { throttle: 0, steer: 1 });
    expect(back.heading).toBeLessThan(0);
  });

  it("moves along its own nose, never sideways", () => {
    const s = driveStateAt({ heading: 0.9, speed: 5 });
    const before = { x: s.x, z: s.z };
    for (let i = 0; i < 60; i++) step(s, { throttle: 0, steer: 0 });
    const dx = s.x - before.x;
    const dz = s.z - before.z;
    const along = dx * Math.sin(0.9) + dz * Math.cos(0.9);
    const across = dx * Math.cos(0.9) - dz * Math.sin(0.9);
    expect(along).toBeGreaterThan(3);
    expect(Math.abs(across)).toBeLessThan(1e-9);
  });
});

describe("pedals and the band they may not leave", () => {
  it("reaches the top speed and never passes it", () => {
    const s = driveStateAt();
    for (let i = 0; i < 600; i++) step(s, { throttle: 1, steer: 0 });
    expect(s.speed).toBe(DRIVE_SPEED_MAX);
  });

  it("brakes, stops, and then reverses — never further than the reverse band", () => {
    const s = driveStateAt({ speed: DRIVE_SPEED_MAX });
    for (let i = 0; i < 600; i++) step(s, { throttle: -1, steer: 0 });
    expect(s.speed).toBe(-DRIVE_SPEED_REVERSE);
  });

  it("coasts to a stop and stays there", () => {
    const s = driveStateAt({ speed: 5 });
    for (let i = 0; i < 600; i++) step(s, DRIVE_INPUT_IDLE);
    expect(s.speed).toBe(0);
  });
});

describe("nothing can end the drive", () => {
  it("stops at the wall and never crosses it", () => {
    const limits: DriveLimits = { wall: 60, centreX: 0, centreZ: 0 };
    const s = driveStateAt({ heading: 0, speed: DRIVE_SPEED_MAX });
    for (let i = 0; i < 3000; i++) stepDrive(s, { throttle: 1, steer: 0 }, 1 / 30, limits);
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(60 + 1e-6);
  });

  it("pushes out of a tower instead of standing inside it", () => {
    const tower: DriveTower = { x: 0, z: 10, w: 4, d: 4, top: 20 };
    const s = driveStateAt({ x: 0, z: 10, heading: 0, speed: 4 });
    const touched = pushCarOutOfTowers(s, [tower]);
    expect(touched).toBe(true);
    // outside the grown footprint on the nearer axis
    const outsideZ = Math.abs(s.z - tower.z) >= tower.d / 2 + DRIVE_HULL_CLEAR;
    const outsideX = Math.abs(s.x - tower.x) >= tower.w / 2 + DRIVE_HULL_CLEAR;
    expect(outsideX || outsideZ).toBe(true);
    expect(Math.abs(s.speed)).toBeLessThan(4);
  });

  it("leaves a car in the open alone", () => {
    const s = driveStateAt({ x: 40, z: 40, speed: 4 });
    expect(pushCarOutOfTowers(s, [{ x: 0, z: 0, w: 4, d: 4, top: 9 }])).toBe(false);
    expect({ x: s.x, z: s.z }).toEqual({ x: 40, z: 40 });
  });
});

describe("one law for every door", () => {
  it("refuses a seat in a city that is not there, or is still being built, or a tour", () => {
    expect(driveRefusal({ hasCity: false, building: false, tour: false })).toBe("noCity");
    expect(driveRefusal({ hasCity: true, building: true, tour: false })).toBe("building");
    expect(driveRefusal({ hasCity: true, building: false, tour: true })).toBe("tour");
    expect(driveRefusal({ hasCity: true, building: false, tour: false })).toBe(null);
  });

  it("leans the body outward, so the sign is the opposite of the aircraft's", () => {
    expect(carRoll(0.3, 6)).toBeLessThan(0);
    expect(carRoll(-0.3, 6)).toBeGreaterThan(0);
    expect(carRoll(0.3, 0)).toBe(0);
  });
});

describe("the shipped rig reads the keys the way the law expects", () => {
  const src = readFileSync(
    new URL("../src/components/CameraRig.tsx", import.meta.url),
    "utf-8",
  ).replace(/\s+/g, " ");

  it("takes forward from W and ↑, backwards from S and ↓, steering from A/D and ←/→", () => {
    const block = src.slice(
      src.indexOf("...DRIVE_INPUT_IDLE,"),
      src.indexOf("};", src.indexOf("...DRIVE_INPUT_IDLE,")),
    );
    expect(block).toMatch(/throttle:[^;]*KeyW[^;]*ArrowUp/);
    expect(block).toMatch(/throttle:[^;]*KeyS[^;]*ArrowDown/);
    expect(block).toMatch(/steer:[^;]*ArrowRight[^;]*KeyD/);
    expect(block).toMatch(/steer:[^;]*ArrowLeft[^;]*KeyA/);
  });
});
