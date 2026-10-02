import { describe, it, expect } from "vitest";
import {
  approachFromCurrentDirection,
  flightDuration,
  turntableStep,
  TURN_MAX_PHI,
  TURN_MIN_PHI,
} from "../src/components/CameraRig";

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

  it("falls back to the legacy south-east formula when camPos == camTarget", () => {
    const pos = approachFromCurrentDirection(
      { x: 10, y: 4, z: -3 },
      { x: 10, y: 4, z: -3 },
      { x: 50, y: 0, z: -20 },
      40,
    );
    expect(pos.x).toBeCloseTo(50 + 40 * 0.4, 6);
    expect(pos.y).toBeCloseTo(40 * 0.75, 6);
    expect(pos.z).toBeCloseTo(-20 + 40 * 0.75, 6);
  });

  it("falls back when camPos is numerically indistinguishable from camTarget", () => {
    const pos = approachFromCurrentDirection(
      { x: 1e-12, y: 1e-12, z: 1e-12 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      30,
    );
    expect(pos.y).toBeCloseTo(30 * 0.75, 6);
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
