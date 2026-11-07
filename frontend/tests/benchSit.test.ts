// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { FIGURE, writeEpheLimbPose, type EpheLimbPose } from "../src/components/Pedestrians";
import { SEAT } from "../src/city/seatSurface";

const PEDESTRIANS = readFileSync(
  new URL("../src/components/Pedestrians.tsx", import.meta.url),
  "utf-8",
);

const pose = (): EpheLimbPose => ({
  footX: 0,
  footY: 0,
  footZ: 0,
  handX: 0,
  handY: 0,
  handZ: 0,
  kneeForward: 0,
});

const sit = (side: -1 | 1, blend: number): EpheLimbPose => {
  const p = pose();
  writeEpheLimbPose(p, 0, side, "sit", 0, undefined, 0.13, 1, 0, blend);
  return p;
};

describe("the seated pose", () => {
  it("puts the hip on the seat crown above the slab", () => {
    expect(SEAT.slabY + SEAT.kronenY - FIGURE.hipY).toBeCloseTo(0.08, 9);
  });

  it("brings both feet forward and both hands onto the thighs", () => {
    for (const side of [-1, 1] as const) {
      const p = sit(side, 1);
      expect(p.footZ).toBeGreaterThan(0.3);
      expect(p.kneeForward).toBeGreaterThan(0.15);
      expect(p.handZ).toBeGreaterThan(0.15);
      expect(p.handY).toBeGreaterThan(0.6);
    }
  });

  it("is the standing body at blend 0", () => {
    const standing = pose();
    writeEpheLimbPose(standing, 0, 1, "idle");
    const arrived = sit(1, 0);
    for (const key of Object.keys(standing) as Array<keyof EpheLimbPose>) {
      expect(arrived[key]).toBeCloseTo(standing[key], 9);
    }
  });

  it("schedules a bench on a root level with no plaza homes", () => {
    // The demo's root has six district plots and no building on the central
    // plaza, so `homes` is empty and `cityLife` is false. A bench belongs to a
    // district, not to a home: gating the scheduler on `cityLife` made every
    // root-level bench unreachable.
    expect(PEDESTRIANS).toContain("if (S.tBench <= 0 && benchesRef.current.length > 0) {");
  });

  it("arms the pose only while a resident is going to or on a bench", () => {
    expect(PEDESTRIANS).toContain('| "toBench"');
    expect(PEDESTRIANS).toContain('| "sit"');
    expect(PEDESTRIANS).toContain('e.sitBlend = ramp(e.sitBlend, e.mode === "sit" ? 1 : 0');
    expect(PEDESTRIANS).toContain('e.mode === "sit" || e.sitBlend > 0.002');
    expect(PEDESTRIANS).toContain(
      "const sitLift = e.sitBlend * (SEAT.slabY + SEAT.kronenY - FIGURE.hipY);",
    );
  });
});
