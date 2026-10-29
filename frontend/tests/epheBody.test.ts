// @vitest-environment node
/**
 * The shape of one bone, held to the pixels it is drawn at.
 *
 * Every arm, leg, boot, hand and the hair cap of every resident is ONE shared
 * geometry, written into a single instanced pass as a matrix between two
 * joints: radius across, half the bone length along. So the geometry's own
 * shape decides what a limb looks like — and the shape it had (a unit sphere)
 * is a spindle once it is stretched: full radius at the middle of the bone,
 * zero at both joints.
 *
 * Measured on a real scan at a 30 px resident (2026-10-29, 1280x800,
 * `--use-angle=metal`, projected through the live camera matrix), the sphere's
 * zero width at the shoulder joint put the sleeve's outer edge 0.058 units —
 * 1.66 px — clear of the coat's flank, so the arm read as a light blob floating
 * beside the coat, and the two leg bones met point to point at the knee.
 *
 * These cases pin the SHAPE and the two pixel consequences of it. They do not
 * claim a render: the frames are in the round's report.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { BONE_BEVEL, BONE_SEGMENTS, boneGeometry, boneProfile } from "../src/city/epheBody";
import { FIGURE } from "../src/components/Pedestrians";
import { WORLD_OVERVIEW_ELEVATION } from "../src/city/worldFraming";

/** The same two scales `ephe-readability.test.ts` derives from the district
 *  camera: a resident `h` px tall buys this much per unit up and across. */
const COS = Math.cos(WORLD_OVERVIEW_ELEVATION);
const scales = (h: number): { up: number; across: number } => {
  const up = h / FIGURE.crown;
  return { up, across: up / COS };
};

/** The half-width of a sleeve at the shoulder joint, in figure units: its own
 *  radius (0.075, written by the frame loop) times what the profile has left at
 *  the very end of the bone. A stretched sphere has 0 there. */
const sleeveAtJoint = (profileEnd: number): number => 0.075 * profileEnd;

/** One contiguous horizontal run through the coat and both arms at the
 *  shoulder line — the row that reads as the shoulders. */
const shoulderRow = (profileEnd: number): number =>
  2 * (FIGURE.shoulderWidth + sleeveAtJoint(profileEnd));

describe("the bone the whole crowd is drawn with", () => {
  it("keeps the normalised box every other write was measured against", () => {
    const geo = boneGeometry();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    // Along the bone the extent is exactly ±1: `writeBone` scales by half the
    // joint distance and the boots, hands and hair cap are scaled in the same
    // normalised space. A longer axis would silently grow all three.
    expect(box.min.y).toBeCloseTo(-1, 6);
    expect(box.max.y).toBeCloseTo(1, 6);
    // Across, the widest sampled vertex is one radius out (a lathe with `n`
    // segments samples a polygon; its radius is 1 at the vertices).
    expect(Math.max(-box.min.z, box.max.z)).toBeCloseTo(1, 6);
    expect(Math.max(-box.min.x, box.max.x)).toBeGreaterThan(0.9);
  });

  it("is a tube with a bevelled end, not a spindle", () => {
    const profile = boneProfile();
    // closed at both joints: an open ring would show the inside of the coat
    // through the shoulder at the near eye
    expect(profile[0]).toEqual([0, -1]);
    expect(profile[profile.length - 1]).toEqual([0, 1]);
    // full width over the whole middle of the bone
    // `<= 1 - b` alone misses both points: the profile builds -1 + b + b·sin(0)
    // and that rounds to 0.7800000000000001 against a bound of 0.78.
    const straight = profile.filter(([, y]) => Math.abs(y) <= 1 - BONE_BEVEL + 1e-9);
    expect(straight.length).toBeGreaterThanOrEqual(2);
    for (const [r] of straight) expect(r).toBeCloseTo(1, 6);
    // and the end keeps most of the radius: a shoulder, not a needle
    expect(1 - BONE_BEVEL).toBeGreaterThanOrEqual(0.75);
    expect(BONE_BEVEL).toBeLessThanOrEqual(0.25);
    // the straight section is the bone, not the cap
    expect(1 - BONE_BEVEL).toBeGreaterThanOrEqual(0.7);
  });

  it("costs less than the pass it replaced can afford", () => {
    const geo = boneGeometry();
    // eleven limb instances per figure, one draw for the whole city: the shape
    // may not become a mesh worth its own triangle budget
    expect(geo.index!.count / 3).toBeLessThanOrEqual(160);
    expect(BONE_SEGMENTS).toBeGreaterThanOrEqual(8);
    expect(BONE_SEGMENTS).toBeLessThanOrEqual(12);
  });

  for (const h of [20, 30] as const) {
    it(`gives the shoulders a line at a ${h} px resident`, () => {
      const { across } = scales(h);
      const head = 2 * FIGURE.headR * across;
      const end = boneProfile().filter(([, y]) => Math.abs(y) > 1 - BONE_BEVEL)[0]
        ? 1 - BONE_BEVEL
        : 0;
      const row = shoulderRow(end) * across;
      // The arm has a width AT the joint at all — the sphere had none there, and
      // that is the 1,66 px gap the sleeve floated in beside the coat. Written
      // as a width, because `sleeveAtJoint` is a radius and the 2,86 px the
      // figure's own comment quotes is a diameter.
      expect(2 * sleeveAtJoint(end) * across).toBeGreaterThanOrEqual(1.66);
      // The shoulder row is a step against the head above it, not a taper: the
      // measured front-facing frames read 9 px of head against 18-21 px of
      // shoulder at 30 px. A sphere puts the sleeve's width at the joint at
      // zero, which takes the row down to 1,48 × the head — no shoulder line.
      expect(row).toBeGreaterThan(head * 1.8);
      expect(row - head).toBeGreaterThanOrEqual(h === 30 ? 5 : 4);
    });
  }

  it("reaches the coat it hangs from", () => {
    // The sleeve's inner edge against the coat's own flank AT the shoulder
    // line, read off the shipped coat lathe rather than guessed between two of
    // its rows: between 0.150 at y=+0.115 and 0.126 at +0.172 the flank at
    // +0.16 is 0.148, not the 0.131 an earlier draft of this case assumed.
    const flank = (y: number): number => {
      const c = FIGURE.coat;
      for (let i = 1; i < c.length; i++) {
        const [r0, y0] = c[i - 1]!;
        const [r1, y1] = c[i]!;
        if (y0 <= y && y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
      }
      return 0;
    };
    const end = 1 - BONE_BEVEL;
    const inner = FIGURE.shoulderWidth - sleeveAtJoint(end);
    expect(inner).toBeLessThan(flank(FIGURE.shoulderY));
    // and it is an overlap, not a touch: 0,007 units is 0,20 px of the sleeve
    // lying over the coat at a 30 px resident. A sphere sits 0,059 outside.
    expect(flank(FIGURE.shoulderY) - inner).toBeGreaterThanOrEqual(0.005);
  });

  it("is the geometry the crowd's limb pass actually builds", () => {
    // A shape guard, not a wording: swapping the shared limb geometry back to a
    // stretched sphere is exactly the regression this round removes, and every
    // other case here would stay green.
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    expect(src).toContain("const limbGeo = useMemo(() => boneGeometry(), [])");
    expect(src).not.toContain("new THREE.SphereGeometry(1, 8, 6)");
  });
});
