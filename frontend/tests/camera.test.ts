import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  approachFromCurrentDirection,
  CRANE_ELEVATION,
  craneAdvance,
  flightDuration,
  turntableStep,
  clampToCity,
  cityFrameState,
  GROUND_Y,
  PIVOT_Y,
  TURN_MAX_PHI,
  TURN_MIN_PHI,
} from "../src/components/CameraRig";
import type { XYZ } from "../src/components/CameraRig";
import { overviewShot } from "../src/city/layout";
import { WORLD_OVERVIEW_ELEVATION } from "../src/city/worldFraming";
import { STANDARD_AZIMUTH } from "../src/city/cameraPresets";

/** Horizontal azimuth of a vector on the XZ plane (radians, atan2 convention). */
function azimuth(v: { x: number; z: number }): number {
  return Math.atan2(v.x, v.z);
}

/** Elevation angle of a vector relative to the XZ plane (radians). */
function elevation(v: { x: number; y: number; z: number }): number {
  return Math.atan2(v.y, Math.hypot(v.x, v.z));
}

function len(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("approachFromCurrentDirection", () => {
  it("keeps the user's azimuth and elevation relative to the new target", () => {
    // Camera sits south-east above the old target.
    const camPos = { x: 40, y: 50, z: 100 };
    const camTarget = { x: 0, y: 0, z: 0 };
    const target = { x: 60, y: 0, z: -40 };
    const distance = 30;

    const pos = approachFromCurrentDirection(camPos, camTarget, target, distance);

    const oldOffset = {
      x: camPos.x - camTarget.x,
      y: camPos.y - camTarget.y,
      z: camPos.z - camTarget.z,
    };
    const newOffset = { x: pos.x - target.x, y: pos.y - target.y, z: pos.z - target.z };

    // Same direction (azimuth + elevation), just a different anchor + length.
    expect(azimuth(newOffset)).toBeCloseTo(azimuth(oldOffset), 6);
    expect(elevation(newOffset)).toBeCloseTo(elevation(oldOffset), 6);
    // Exact requested distance from the new target.
    expect(len(newOffset)).toBeCloseTo(distance, 6);
  });

  it("takes a scripted elevation but keeps the side of the city it is on", () => {
    // The construction crane: its own eye line, the user's azimuth.
    const camPos = { x: 40, y: 50, z: 100 };
    const camTarget = { x: 0, y: 0, z: 0 };
    const target = { x: -30, y: 1.5, z: 20 };
    const pos = approachFromCurrentDirection(camPos, camTarget, target, 24, 0.36);

    const off = { x: pos.x - target.x, y: pos.y - target.y, z: pos.z - target.z };
    expect(azimuth(off)).toBeCloseTo(azimuth({ x: 40, z: 100 }), 6);
    expect(elevation(off)).toBeCloseTo(0.36, 6);
    expect(len(off)).toBeCloseTo(24, 6);
  });

  it("lands exactly `distance` away and anchors on the new target", () => {
    const pos = approachFromCurrentDirection(
      { x: 0, y: 60, z: 60 },
      { x: 0, y: 1.5, z: 0 },
      { x: 12, y: 3, z: -7 },
      14,
    );
    expect(len({ x: pos.x - 12, y: pos.y - 3, z: pos.z + 7 })).toBeCloseTo(14, 6);
  });

  it("preserves a straight-down viewing angle", () => {
    const pos = approachFromCurrentDirection(
      { x: 0, y: 100, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 2, z: 5 },
      20,
    );
    expect(pos.x).toBeCloseTo(5, 6);
    expect(pos.y).toBeCloseTo(22, 6);
    expect(pos.z).toBeCloseTo(5, 6);
  });

  it("falls back to the standard heading at the world's overview elevation", () => {
    // No direction to preserve (the first flight of a freshly loaded city) and
    // no elevation asked for: the heading is the one shipped azimuth and the
    // height is the overview elevation, not the legacy factors this used to
    // carry (`0,4 / 0,75 / 0,75` of the distance, which landed every arrival at
    // 41,6° and overrode whatever the shot itself had said).
    const pos = approachFromCurrentDirection(
      { x: 10, y: 4, z: -3 },
      { x: 10, y: 4, z: -3 },
      { x: 50, y: 0, z: -20 },
      40,
    );
    const horiz = Math.cos(WORLD_OVERVIEW_ELEVATION) * 40;
    expect(pos.x).toBeCloseTo(50 + Math.cos(STANDARD_AZIMUTH) * horiz, 6);
    expect(pos.y).toBeCloseTo(Math.sin(WORLD_OVERVIEW_ELEVATION) * 40, 6);
    expect(pos.z).toBeCloseTo(-20 + Math.sin(STANDARD_AZIMUTH) * horiz, 6);
    // A true `distance` from the target, where the legacy formula sat 1,083 × it.
    expect(len({ x: pos.x - 50, y: pos.y, z: pos.z + 20 })).toBeCloseTo(40, 6);
  });

  it("honours the shot's own elevation on that first flight", () => {
    // The arrival as the store sends it: the demo level's shot, 0,52 rad, and
    // the camera lands at exactly that angle instead of the old 41,6°.
    const shot = { dist: 117.06, targetY: 6.89, elevation: 0.52 };
    const target = { x: 0.32, y: shot.targetY, z: 3.02 };
    const pos = approachFromCurrentDirection(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      target,
      shot.dist,
      shot.elevation,
    );
    const off = { x: pos.x - target.x, y: pos.y - target.y, z: pos.z - target.z };
    expect(elevation(off)).toBeCloseTo(0.52, 6);
    expect(len(off)).toBeCloseTo(shot.dist, 4);
    expect(pos.y).toBeCloseTo(shot.targetY + Math.sin(0.52) * shot.dist, 4);
  });

  it("falls back when camPos is numerically indistinguishable from camTarget", () => {
    const pos = approachFromCurrentDirection(
      { x: 1e-12, y: 1e-12, z: 1e-12 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      30,
    );
    expect(pos.y).toBeCloseTo(30 * Math.sin(WORLD_OVERVIEW_ELEVATION), 6);
  });
});

describe("flightDuration", () => {
  it("bottoms out at 0.35 s for zero distance", () => {
    expect(flightDuration(0)).toBe(0.35);
    // Interior values stay untouched by the clamps (0.35 + 5/220).
    expect(flightDuration(5)).toBeCloseTo(0.372727, 5);
  });

  it("scales with distance inside the clamp band", () => {
    // 0.35 + 220/220 = 1.35 — an interior value, untouched by the clamps.
    expect(flightDuration(220)).toBeCloseTo(1.35, 6);
    expect(flightDuration(110)).toBeCloseTo(0.85, 6);
  });

  it("caps at 1.6 s by default", () => {
    expect(flightDuration(5000)).toBe(1.6);
    expect(flightDuration(280)).toBe(1.6);
  });

  it("honors a caller-supplied cap", () => {
    expect(flightDuration(5000, 3)).toBe(3);
    // 0.35 + 100/220 ≈ 0.8045 → capped to 0.5.
    expect(flightDuration(100, 0.5)).toBe(0.5);
    // Degenerate cap below the 0.35 s floor: standard clamp order applies
    // (min(max(v, lo), hi)) — the cap wins.
    expect(flightDuration(0, 0.2)).toBe(0.2);
  });
});

describe("turntableStep", () => {
  const pivot = { x: 0, y: 1.5, z: 0 };
  const rel = (p: { x: number; y: number; z: number }) => ({
    x: p.x - pivot.x,
    y: p.y - pivot.y,
    z: p.z - pivot.z,
  });

  it("sweeps the azimuth by exactly dTheta at unchanged distance", () => {
    const from = { x: 0, y: 70, z: 70 };
    const to = turntableStep(from, pivot, 0.3, 0)!;
    expect(azimuth(rel(to)) - azimuth(rel(from))).toBeCloseTo(0.3, 6);
    expect(len(rel(to))).toBeCloseTo(len(rel(from)), 6);
  });

  it("raises the viewpoint for negative dPhi and lowers it for positive", () => {
    const from = { x: 0, y: 70, z: 70 };
    expect(turntableStep(from, pivot, 0, -0.4)!.y).toBeGreaterThan(from.y);
    expect(turntableStep(from, pivot, 0, 0.4)!.y).toBeLessThan(from.y);
  });

  it("never carries the camera under the ground", () => {
    // Sitting on the horizon line (phi = π/2) and pushed further down.
    const to = turntableStep({ x: 0, y: pivot.y, z: 100 }, pivot, 0.2, 1)!;
    expect(to.y).toBeGreaterThan(pivot.y);
    expect(Math.acos((to.y - pivot.y) / len(rel(to)))).toBeLessThanOrEqual(TURN_MAX_PHI + 1e-9);
  });

  it("never pins the camera to the zenith, where azimuth stops meaning anything", () => {
    // Directly above the pivot (phi = 0) and pushed further up.
    const to = turntableStep({ x: 0, y: 100, z: 0 }, pivot, 0.2, -1)!;
    const horizontal = Math.hypot(to.x - pivot.x, to.z - pivot.z);
    expect(horizontal).toBeGreaterThan(0);
    const r = len(rel(to));
    expect(Math.acos((to.y - pivot.y) / r)).toBeGreaterThanOrEqual(TURN_MIN_PHI - 1e-9);
  });

  it("orbits the given pivot, not the world origin", () => {
    const offAxis = { x: 20, y: 1.5, z: -30 };
    const from = { x: 20, y: 70, z: -30 + 70 };
    const to = turntableStep(from, offAxis, 0.5, 0)!;
    const d = (p: typeof to) => Math.hypot(p.x - offAxis.x, p.y - offAxis.y, p.z - offAxis.z);
    expect(d(to)).toBeCloseTo(d(from), 6);
    expect(to.z).not.toBeCloseTo(from.z, 3);
  });

  it("refuses to turn when the camera sits exactly on the axis", () => {
    expect(turntableStep(pivot, pivot, 0.3, 0.3)).toBeNull();
  });
});

describe("clampToCity", () => {
  // The fog far plane is the outer limit: CityScene hazes everything out
  // there, so nothing the user could still see is ever cut off.
  const maxR = (bounds: number) => bounds * 4 + 220;
  const fromAxis = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y - PIVOT_Y, p.z);

  it("leaves a position inside the world untouched", () => {
    const pos = { x: 40, y: 100, z: 150 };
    expect(clampToCity(pos, 100)).toEqual(pos);
  });

  it("pulls a camera driven under the street back up to it", () => {
    // The measured escape: dollying toward the ground went THROUGH it.
    const out = clampToCity({ x: 10, y: -80, z: 20 }, 100);
    expect(out.y).toBe(GROUND_Y);
  });

  it("caps the distance at the fog far plane, along the same bearing", () => {
    const out = clampToCity({ x: 0, y: PIVOT_Y, z: 5000 }, 100);
    expect(fromAxis(out)).toBeCloseTo(maxR(100), 6);
    expect(out.z).toBeCloseTo(maxR(100), 6);
    expect(out.x).toBeCloseTo(0, 6);
  });

  it("scales with the level being viewed", () => {
    expect(fromAxis(clampToCity({ x: 0, y: PIVOT_Y, z: 5000 }, 40))).toBeCloseTo(maxR(40), 6);
    expect(fromAxis(clampToCity({ x: 0, y: PIVOT_Y, z: 5000 }, 400))).toBeCloseTo(maxR(400), 6);
  });

  it("still floors at street level with no city loaded", () => {
    const out = clampToCity({ x: 1e6, y: -5, z: 0 }, null);
    expect(out.y).toBe(GROUND_Y);
    expect(out.x).toBe(1e6); // no radial cap without a known level
  });

  it("never touches a legitimate overview framing", () => {
    // Guards the coupling between three formulas that live apart: the height
    // rail (mapping.ts 34, voxels.ts x1.4), the framing distance
    // (`overviewShot`, which the store's overview flight uses) and this
    // ceiling. If any of them moves and this fails, the first wheel notch
    // after an overview would yank the user inward.
    const TALLEST_POSSIBLE = 34 * 1.4;
    for (const bounds of [12, 40, 100, 400, 2000]) {
      const pos = {
        x: 0,
        y: PIVOT_Y,
        z: overviewShot(bounds, TALLEST_POSSIBLE).dist,
      };
      expect(clampToCity(pos, bounds)).toEqual(pos);
    }
  });
});

describe("craneAdvance", () => {
  // A pose just inside the plaza, on the +z side, looking at the centre.
  const cam = { x: 0, y: 6, z: 20 };
  const pivot = { x: 0, y: PIVOT_Y, z: 0 };
  /** Distance from the camera to the point it orbits — its framing. */
  const framing = (p: XYZ, target: XYZ) =>
    Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
  const shotAt = (dist: number) => ({ dist, targetY: PIVOT_Y, x: 0, z: 0 });
  /** The full shot position, for the "it eases, it does not cut" comparisons */
  const settled = (from: XYZ, around: XYZ, dist: number) =>
    approachFromCurrentDirection(from, around, { x: 0, y: PIVOT_Y, z: 0 }, dist, CRANE_ELEVATION);

  it("eases toward the shot instead of cutting to it", () => {
    const want = settled(cam, pivot, 60);
    const one = craneAdvance(cam, pivot, shotAt(60), 1 / 60);
    (["x", "y", "z"] as const).forEach((axis) => {
      expect(one.pos[axis]).toBeGreaterThan(Math.min(cam[axis], want[axis]));
      expect(one.pos[axis]).toBeLessThan(Math.max(cam[axis], want[axis]));
    });
  });

  it("lands the shot when it is allowed to keep following", () => {
    let pos = cam;
    let target = pivot;
    for (let i = 0; i < 200; i++) {
      const next = craneAdvance(pos, target, shotAt(60), 1 / 30);
      pos = next.pos;
      target = next.target;
    }
    expect(framing(pos, target)).toBeCloseTo(60, 1);
    expect(target).toEqual({ x: 0, y: PIVOT_Y, z: 0 });
  });

  it("moves nothing when no time has passed", () => {
    expect(craneAdvance(cam, pivot, shotAt(120), 0).pos).toEqual(cam);
  });

  it("never rotates the view away from the side the user is on", () => {
    const off = { x: 20, z: 27 };
    const before = azimuth({ x: 20, z: 27 });
    const after = craneAdvance({ x: off.x, y: 9, z: off.z }, pivot, shotAt(90), 5);
    expect(azimuth({ x: after.pos.x, z: after.pos.z })).toBeCloseTo(before, 6);
  });

  it("follows a growing city out with one target and no cut", () => {
    // The measured defect this replaces: a flight per district moved the orbit
    // TARGET to each plot and re-capped the distance, so the view swung
    // sideways and the framing snapped in again. The crane has one pivot (the
    // centre) and an extent that only grows — so both stay put / only widen.
    let pos = cam;
    let target = pivot;
    let prev = framing(pos, target);
    let maxStep = 0;
    for (const dist of [26, 34, 48, 66, 90]) {
      for (let i = 0; i < 6; i++) {
        const next = craneAdvance(pos, target, shotAt(dist), 0.1); // 10 Hz
        pos = next.pos;
        target = next.target;
        const now = framing(pos, target);
        expect(now).toBeGreaterThanOrEqual(prev);
        maxStep = Math.max(maxStep, (now - prev) / prev);
        prev = now;
      }
      expect(target.x).toBe(0);
      expect(target.z).toBe(0);
    }
    // 3.5 units of framing per 100 ms at the steepest — a glide, not a jump
    expect(maxStep).toBeLessThan(0.2);
    expect(prev).toBeGreaterThan(75);
  });
});

// ── cityFrameState — "hat der Pilot die Stadt verloren?" ───────────────────
function camAt(
  pos: XYZ,
  look: XYZ,
  opts: { fov?: number; near?: number; far?: number } = {},
): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(
    opts.fov ?? 45,
    16 / 9,
    opts.near ?? 0.1,
    opts.far ?? 4000,
  );
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(look.x, look.y, look.z);
  cam.updateMatrixWorld(true);
  return cam;
}

describe("cityFrameState", () => {
  it("says found while the overview framing still holds the city", () => {
    const cam = camAt({ x: 0, y: 60, z: 200 }, { x: 0, y: 1.5, z: 0 });
    expect(cityFrameState(cam, 60, false)).toBe("found");
    expect(cityFrameState(cam, 60, true)).toBe("found");
  });

  it("says lost once the camera looks away from every corner of the level", () => {
    // eight wheel notches over open ground land the pilot here: above the
    // city, pointed at the sky
    const cam = camAt({ x: 0, y: 900, z: 0 }, { x: 0, y: 901, z: 0 });
    expect(cityFrameState(cam, 60, false)).toBe("lost");
  });

  it("keeps a city it already declared lost until a third of its ground grid is back", () => {
    // The near corner and its ground point sit inside the far plane (410), the
    // rest of the level behind it (414+) — two points seen, and the recovery
    // bar is three. That gap is the hysteresis.
    const cam = camAt({ x: 300, y: 65.5, z: 300 }, { x: 20, y: 65.5, z: 20 }, { far: 410 });
    expect(cityFrameState(cam, 20, false)).toBe("found");
    expect(cityFrameState(cam, 20, true)).toBe("lost");
  });

  it("never declares a loss for a world that has no city", () => {
    const cam = camAt({ x: 0, y: 900, z: 0 }, { x: 0, y: 901, z: 0 });
    expect(cityFrameState(cam, null, true)).toBe("found");
  });

  it("does not call a street-level view from inside the city a loss", () => {
    // The pilot stands in the middle of the level and looks at the horizon:
    // every hull corner is behind them, the ground centre is straight ahead-down
    const cam = camAt({ x: 0, y: 5, z: 0 }, { x: 0, y: 4, z: -50 }, { far: 1600 });
    expect(cityFrameState(cam, 60, false)).toBe("found");
  });
});
