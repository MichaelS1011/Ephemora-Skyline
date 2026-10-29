import * as THREE from "three";

/**
 * The shape of one bone — the geometry every limb, boot, hand and the hair cap
 * are drawn with.
 *
 * The crowd has no skeleton to skin and no mesh of its own per figure: ten limb
 * slots per resident are written into ONE instanced pass, and each slot gets a
 * matrix between two joints (`writeBone`). What that matrix does to the shared
 * geometry is scale it — radius across, half the bone length along. So the
 * shape of the geometry IS the shape of every arm and leg in the city.
 *
 * It used to be a unit SPHERE. Scaled between two joints a sphere becomes a
 * spindle: full radius only at the middle of the bone and zero at both joints.
 * Measured on the real scan at a 30 px resident (2026-10-29, 1280x800,
 * `--use-angle=metal`, projected through the live camera matrix):
 *
 *   - the sleeve's radius at the shoulder joint was 0.000 units, so its outer
 *     edge sat 0.058 units — 1.66 px — clear of the coat's flank, and the
 *     sleeve read as a light blob floating beside the coat instead of an arm
 *     hanging from a shoulder. At 20 px the same gap is 1.10 px: still open.
 *   - the two leg bones met point to point at the knee, so the leg's silhouette
 *     pinched to a single pixel between hip and boot (measured min/max run over
 *     the leg rows: 0.22 of its widest).
 *   - the shoulders had no line at all: the top of the figure tapered from a
 *     7.3 px head straight into an arm that only reached full width at elbow
 *     height, so the longest run in the top fifth was 8-9 px against a widest
 *     run of 15-22 px (ratio 0.36-0.60).
 *
 * A TUBE with a bevelled end fixes all three out of the same matrix: the radius
 * is 1 for the middle 76 % of the bone and only rounds off in the last 12 % at
 * each end. At the shoulder joint that leaves 0,88 of the full radius instead of
 * zero — a sleeve 3,77 px wide against 0,00 px on a 30 px resident — and its
 * inner edge reaches 0,124 from the centre line against the coat's flank of
 * 0,131, so it OVERLAPS the coat by 0,007 units (0,20 px at 30 px, 0,13 px at
 * 20 px) and fuses with it. The knee gets two near-full-width ends meeting
 * instead of two points.
 *
 * The shape stays inside the SAME normalised box a unit sphere occupied —
 * radius 1 across, ±1 along the bone — because every other user of this
 * geometry (boots, hands, the hair cap) is written with a scale that was chosen
 * against that box. A shape with a longer axis would silently grow the boots
 * and turn the hair into a hat, so `tests/epheBody.test.ts` pins the box.
 */

/**
 * How much of each end is rounded off, as a fraction of the half-length. The
 * number is not free: it is what the sleeve still has left AT its joint.
 *
 *   keeps at the joint   sleeve width at 30 px   inner edge vs the coat's flank
 *   0.00 (a cut pipe)    1.00                    4,29 px            0,115 — inside
 *   0.12                 0.88                    3,77 px            0,124 — inside by 0,007
 *   0.22                 0.78                    3,34 px            0,1315 — 0,0005 outside
 *   a sphere             0.00                    0,00 px            0,190  — 0,059 outside
 *
 * 0,12 is the largest bevel whose sleeve still overlaps the coat's flank at the
 * shoulder line — the claim this shape exists to keep, because a sleeve that
 * stops at the flank reads as a light blob beside the coat. 0,22 was tried and
 * measured: it closes the sphere's 2,97 px gap to 0,014 px of touching, which is
 * invisible, but it gives up the overlap and 0,43 px of shoulder width with it.
 */
export const BONE_BEVEL = 0.12;

/** Radii per vertex around the bone. Ten is smooth at four pixels wide and
 *  costs less than the six-by-eight sphere this replaced. */
export const BONE_SEGMENTS = 10;

/**
 * The lathe profile, as (radius, y) pairs from one joint to the other.
 *
 * Ordered by y, ends on the axis (radius 0) so the tube is closed at both
 * joints: a bone that ended in an open ring would show the inside of the coat
 * through the shoulder at the near eye.
 */
export function boneProfile(bevel: number = BONE_BEVEL): [number, number][] {
  const b = Math.max(0, Math.min(0.5, bevel));
  const points: [number, number][] = [
    [0, -1],
    [1 - b, -1],
  ];
  // The bottom corner: a quarter circle from pointing down to pointing out,
  // centred on the point where the flat end meets the straight side. Two steps
  // is a cap of 1.9 px at a 30 px resident and costs 40 triangles less per
  // instance than three — the limb pass carries eleven instances per figure.
  const steps = 2;
  for (let i = 1; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    points.push([1 - b + b * Math.cos(a), -1 + b + b * Math.sin(a)]);
  }
  // The straight side, then the same corner at the top.
  points.push([1, 1 - b]);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    points.push([1 - b + b * Math.cos(a), 1 - b + b * Math.sin(a)]);
  }
  points.push([0, 1]);
  return points;
}

/** The geometry the whole crowd's limbs share. One per component, disposed with
 *  it — the same contract the sphere it replaced had. */
export function boneGeometry(radialSegments: number = BONE_SEGMENTS): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    boneProfile().map(([r, y]) => new THREE.Vector2(r, y)),
    radialSegments,
  );
}
