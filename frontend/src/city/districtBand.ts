import * as THREE from "three";
import { ENV } from "./palette";

/**
 * The district's ground band (Zielbild 2026-10-22, element #20): the plot
 * announces its risk on the ground it stands on.
 *
 * Same construction as the chosen tower's contour and the route stripe, for the
 * same measured reason. Measured over the seven ground surfaces a band can lie
 * on (`bezirksflaeche-sonde.mjs`), no risk tone carries an edge alone:
 * `medium` reaches 1.04:1 on the plaza ground, `low` 1.07:1 on a crossing,
 * `high` 1.01:1 on a kerb stone. Framed by the casing ink the weaker of the two
 * edges is ≥ 3.13:1 on every surface at every level.
 *
 * One level is different and is not hidden: `safe` sits 1.95:1 from its own
 * casing, so on that band the two layers cannot be told apart. It still reads,
 * because the core itself clears the ground by 6.44:1 — what is lost is the
 * frame, not the line.
 *
 * One vertex-coloured geometry per district: casing annulus plus core annulus,
 * flat, outside the kerb stones. That is one mesh per district, which is what
 * the step costs and the fps gate has to carry.
 */
export const DISTRICT_BAND = {
  /** From the plot's half-size to the band's inner edge — clear of the kerb. */
  abstand: 1.35,
  /**
   * Height of the dark frame, and of the risk core inside it.
   *
   * The frame is 0,40 units wide on each side of the core, and that number is
   * the measurement, not a taste: the first build framed the core with 0,25 and
   * the plate showed **1 px** of frame (median over 69 detected band edges,
   * `bezirksband-messung.json`) where the step's own criterion asked for 2. At
   * the ground's operating scale a flat band loses sin(0.68) of its height to
   * the view, so 0,25 units arrive as one pixel — and one pixel of frame does
   * not carry an edge, it carries a suggestion.
   */
  casingWidth: 1.35,
  coreWidth: 0.55,
  /** Above the plot slab (top at 0,18) and below the kerb crown. */
  y: 0.2,
} as const;

type Vec3 = [number, number, number];

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

/** A flat rectangular annulus, tiled as four non-overlapping rectangles. */
function band(
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
 * The band of one district plot, in the plot's own local space (origin at the
 * plot centre, `w`/`d` the tower field it frames).
 */
export function districtBandGeometry(
  w: number,
  d: number,
  coreHex: string,
): THREE.BufferGeometry | null {
  const { abstand, casingWidth, coreWidth, y } = DISTRICT_BAND;
  if (!(w > 0 && d > 0) || !Number.isFinite(w + d)) return null;
  const core = new THREE.Color(coreHex);
  const casing = new THREE.Color(ENV.arcCasing);
  const pos: number[] = [];
  const col: number[] = [];
  const hx = w / 2 + abstand + casingWidth;
  const hz = d / 2 + abstand + casingWidth;
  const pad = (casingWidth - coreWidth) / 2;
  band(pos, col, hx, hz, casingWidth, y, casing);
  band(pos, col, hx - pad, hz - pad, coreWidth, y + 0.01, core);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
