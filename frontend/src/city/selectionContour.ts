import * as THREE from "three";
import { BUILDING_SELECTION, ENV } from "./palette";

/**
 * The contour of the chosen tower (Zielbild 2026-10-22, element #10).
 *
 * The target frame marks the selected building twice — a band at the roof line
 * and a band on the ground around its footprint — and both read because a
 * darker edge frames them. That framing is arithmetic, not decoration: measured
 * over the 24 facade tones and the 20 environment surfaces a band can lie on,
 * the selection gold clears 2.5:1 on 12 of 44 and the casing ink on 38 of 44.
 * Neither alone is a contour a reader can rely on; framed together, the weaker
 * of the two edges is ≥ 3.04:1 on every surface in the city. So the band is
 * casing plus core — the construction the connection arcs already use.
 *
 * One vertex-coloured geometry holds all four parts, so the whole contour costs
 * a single draw call: what the old circular ring cost on its own, for a marker
 * that now names the building instead of the ground beneath it.
 */
export const SELECTION_CONTOUR = {
  /** How far the band stands proud of the facade, in world units. */
  gap: 0.06,
  /** The core is drawn a hand's width in front of its own casing. */
  coreAhead: 0.03,
  /**
   * Roof band: height of the dark frame, height of the gold core inside it.
   *
   * The two margins are the point of the numbers, not the core: measured on the
   * plate at the demo's parked overview, the world runs at 12,75 px per unit
   * across a mid-rise tower, not the 19,05 px the resident band is calibrated
   * at. A frame of 0,08 units there is one pixel, and one pixel of casing does
   * not carry its 6:1 edge — the gold sat on the facade at 2,1:1. So the frame
   * is a quarter of the band on each side, which is ≥ 2 px at that scale.
   */
  roofCasing: 0.8,
  roofCore: 0.36,
  /**
   * Ground band: wider again, because it lies flat and the view sees it at
   * sin(0.68) of its height. Same order as the ring it replaces, which was
   * 0,23 × the footprint wide.
   */
  footCasing: 1.16,
  footCore: 0.46,
  /** Height of the ground band above the plaza, so it does not sink in. */
  footY: 0.09,
} as const;

type Vec3 = [number, number, number];

/** Append a quad as two triangles, every vertex wearing the same colour. */
function quad(
  pos: number[],
  col: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: THREE.Color,
): void {
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

/** A horizontal ribbon around a box, from `y0` to `y1`, at half extents. */
function wallBand(
  pos: number[],
  col: number[],
  hx: number,
  hz: number,
  y0: number,
  y1: number,
  color: THREE.Color,
): void {
  quad(pos, col, [-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [-hx, y1, hz], color);
  quad(pos, col, [hx, y0, -hz], [-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], color);
  quad(pos, col, [hx, y0, hz], [hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], color);
  quad(pos, col, [-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, hz], [-hx, y1, -hz], color);
}

/** A flat rectangular annulus, tiled as four non-overlapping rectangles. */
function footBand(
  pos: number[],
  col: number[],
  hx: number,
  hz: number,
  width: number,
  y: number,
  color: THREE.Color,
): void {
  const ix = hx - width;
  const iz = hz - width;
  const rect = (x0: number, x1: number, z0: number, z1: number): void =>
    quad(pos, col, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color);
  rect(-hx, hx, iz, hz);
  rect(-hx, hx, -hz, -iz);
  rect(ix, hx, -iz, iz);
  rect(-hx, -ix, -iz, iz);
}

/**
 * The contour of one selected building, in that building's own local space:
 * origin at the centre of the footprint, `roofY` at the top of the mass.
 */
export function selectionContourGeometry(
  w: number,
  d: number,
  roofY: number,
): THREE.BufferGeometry | null {
  const { gap, coreAhead, roofCasing, roofCore, footCasing, footCore, footY } = SELECTION_CONTOUR;
  if (!(w > 0 && d > 0) || !Number.isFinite(w + d + roofY)) return null;

  const casing = new THREE.Color(ENV.arcCasing);
  const core = new THREE.Color(BUILDING_SELECTION);
  const pos: number[] = [];
  const col: number[] = [];

  const hx = w / 2 + gap;
  const hz = d / 2 + gap;
  // Roof: the dark frame runs flush to the roof line, the gold sits centred in
  // it and a little forward, so the two never share a plane.
  const pad = (roofCasing - roofCore) / 2;
  wallBand(pos, col, hx, hz, roofY - roofCasing, roofY, casing);
  wallBand(pos, col, hx + coreAhead, hz + coreAhead, roofY - roofCasing + pad, roofY - pad, core);
  // Foot: the same frame around a flat annulus on the plaza, core centred in it
  // so the frame is equally thick inside and outside.
  const footPad = (footCasing - footCore) / 2;
  footBand(pos, col, hx + footCasing, hz + footCasing, footCasing, footY, casing);
  footBand(
    pos,
    col,
    hx + footCasing - footPad,
    hz + footCasing - footPad,
    footCore,
    footY + 0.01,
    core,
  );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
