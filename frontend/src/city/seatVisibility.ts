import * as THREE from "three";

/**
 * Deciding, in screen pixels, whether a district's nameplate covers its seat.
 *
 * The world-space rule in `seatSurface.ts` cannot do this and was measured
 * failing at both ends: at 4,58 units one bench of four sat 100 % under its
 * plate, at 10,4 units the demo loses every bench (`sitz-marke-messung.json`,
 * 2026-10-25). The plate is a DOM box of constant pixel width while the plot it
 * names shrinks with distance — so the only honest comparison happens after the
 * projection, in the pixels the reader actually gets.
 *
 * One rule, stated before building: a bench is hidden when its own projected
 * rectangle is more than half covered. Half, because a bench clipped to a corner
 * is still a bench a resident can walk to; a bench under the plate is a click
 * that lands on a sign.
 */
const VERDECKUNGSGRENZE = 0.5;

type Rechteck = { x: number; y: number; width: number; height: number };

/** The eight corners of an object's bounding box, in page pixels. */
export function projektion(
  objekt: THREE.Object3D,
  kamera: THREE.Camera,
  leinwand: HTMLElement,
): Rechteck | null {
  const geo = (objekt as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (!geo) return null;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return null;
  const punkt = new THREE.Vector3();
  const brect = leinwand.getBoundingClientRect();
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const sx of [bb.min.x, bb.max.x])
    for (const sy of [bb.min.y, bb.max.y])
      for (const sz of [bb.min.z, bb.max.z]) {
        punkt.set(sx, sy, sz);
        objekt.localToWorld(punkt);
        punkt.project(kamera);
        const px = brect.left + (punkt.x * 0.5 + 0.5) * brect.width;
        const py = brect.top + (-punkt.y * 0.5 + 0.5) * brect.height;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
  if (!Number.isFinite(x0 + x1 + y0 + y1)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Anteil der Bank, der unter `plakette` liegt. 0 = frei, 1 = ganz verdeckt. */
export function verdeckungsanteil(sitz: Rechteck, plakette: Rechteck): number {
  const dx = Math.max(
    0,
    Math.min(sitz.x + sitz.width, plakette.x + plakette.width) - Math.max(sitz.x, plakette.x),
  );
  const dy = Math.max(
    0,
    Math.min(sitz.y + sitz.height, plakette.y + plakette.height) - Math.max(sitz.y, plakette.y),
  );
  const flaeche = sitz.width * sitz.height;
  if (!(flaeche > 0)) return 0;
  return (dx * dy) / flaeche;
}

/** True, when the seat must not be drawn because its own plate sits on it. */
export function bankUnterPlakette(
  sitz: THREE.Object3D,
  plakette: HTMLElement,
  kamera: THREE.Camera,
  leinwand: HTMLElement,
): boolean {
  const r = projektion(sitz, kamera, leinwand);
  if (!r) return false;
  const p = plakette.getBoundingClientRect();
  if (!(p.width > 0) || !(p.height > 0)) return false;
  return (
    verdeckungsanteil(r, { x: p.x, y: p.y, width: p.width, height: p.height }) > VERDECKUNGSGRENZE
  );
}
