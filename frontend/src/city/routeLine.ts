/**
 * MASTER-2027 §07.06 — the route a sent resident is walking, drawn on the ground.
 *
 * Until now the errand existed only as a plan inside the figure (`Ephe.path`,
 * `Ephe.finalX`): the reader pressed a dossier, a body started moving, and
 * nothing on the screen said where it was going or how far it had left to go.
 * This module turns that plan into one flat stripe on the kerb line.
 *
 * It is deliberately NOT a second version of the dependency arc. An arc is a
 * relationship between two files and flies above the city; a route is one
 * person's walk and lies on the street they actually take. So the stripe uses
 * the arc's proven ink colour, sits on the ground where the crowd walks, and is
 * a solid line: the road already owns the dashed idiom (`ENV.laneDash`), and a
 * dashed route would read as more street paint rather than as a plan.
 */

import * as THREE from "three";
import { SURFACE_LIMITS, surfacePoint, type WorldSurface } from "./worldSurface";

/** A point of the plan, in the city's own world coordinates. */
export interface RoutePoint {
  x: number;
  z: number;
}

/**
 * The stripe's two numbers, each derived before the first pixel was drawn.
 *
 * `width` — `ephe-readability.test.ts` measures the district camera at 19.053
 * px per world unit across at the far end of the resident band (a figure 20 px
 * tall) and 28.579 px at the near end (30 px). A ground feature is seen at the
 * overview's 0.68 rad elevation, so its short axis lands on the plate squashed
 * by sin(0.68) = 0.6287: 0.26 units is 3.11 px at the far end and 4.67 px at
 * the near end when the leg runs across the view, and 4.96 / 7.43 px when it
 * runs away from it. That keeps the project's own ≥3 px floor at both ends of
 * the band, and stays under half the width of the kerb stone it lies on
 * (2 × 0.275), so the line reads as paint on the walkway, not as a walkway.
 *
 * `y` — the highest opaque paint in the world tops out at 0.08 (kerb boxes) and
 * the figures' contact patch sits at `CONTACT_PATCH_Y` = 0.09, so the stripe
 * goes at 0.093: above every surface it crosses, below the ring it shares no
 * pixel with, and never depth-fighting with the plate under it.
 */
export const ROUTE_LINE = {
  width: 0.26,
  y: 0.093,
  /** Long flat quads bridge a curved surface; the street paint cuts itself at
   *  the same limit (`SURFACE_LIMITS.roadSegment`) for the same reason. */
  maxStep: SURFACE_LIMITS.roadSegment,
  /** Corner coverage: an 8-sided disc at every plan node, so a turn has no
   *  notch where two legs meet at 90°. */
  joinSections: 8,
} as const;

/** The plan as the walker will execute it, in the order it is walked.
 *
 *  `Ephe.path` holds the graph hops still to come (`graphPath` returns them
 *  without the node the figure stands at), and `finalX/finalZ` is the off-graph
 *  last step to a door. The figure walks each of these as a straight leg — that
 *  is what `walkToward` does — so the polyline through them IS the walk, and a
 *  stripe along it cannot promise a route the body does not take. */
export function planPolyline(
  x: number,
  z: number,
  path: readonly number[],
  nodes: readonly { x: number; z: number }[],
  finalX: number | null,
  finalZ: number,
): RoutePoint[] {
  const points: RoutePoint[] = [{ x, z }];
  for (const hop of path) {
    const n = nodes[hop];
    if (n) points.push({ x: n.x, z: n.z });
  }
  if (finalX !== null) points.push({ x: finalX, z: finalZ });
  return points;
}

/**
 * The stripe as one geometry: a quad per leg, a small disc at each node.
 *
 * Returns null for a plan with nothing to draw (fewer than two usable points),
 * so the caller can render no mesh at all instead of an empty one.
 */
export function stripeGeometry(
  points: readonly RoutePoint[],
  surface: WorldSurface,
  width: number = ROUTE_LINE.width,
  y: number = ROUTE_LINE.y,
): THREE.BufferGeometry | null {
  const plan = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (plan.length < 2) return null;

  // Densify every leg so no span is longer than the street paint allows itself
  // on this surface, and remember which vertices are the plan's own nodes.
  const dense: Array<{ x: number; z: number; node: boolean }> = [];
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i]!;
    dense.push({ x: a.x, z: a.z, node: true });
    const b = plan[i + 1];
    if (!b) break;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / ROUTE_LINE.maxStep));
    for (let s = 1; s < steps; s++)
      dense.push({ x: a.x + (dx * s) / steps, z: a.z + (dz * s) / steps, node: false });
  }
  if (dense.length < 2) return null;

  const half = width / 2;
  const verts: number[] = [];
  const put = (x: number, z: number): void => {
    const v = surfacePoint(surface, x, y, z);
    verts.push(v.x, v.y, v.z);
  };

  for (let i = 0; i + 1 < dense.length; i++) {
    const a = dense[i]!;
    const b = dense[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    put(a.x + nx, a.z + nz);
    put(a.x - nx, a.z - nz);
    put(b.x - nx, b.z - nz);
    put(a.x + nx, a.z + nz);
    put(b.x - nx, b.z - nz);
    put(b.x + nx, b.z + nz);
  }

  for (let i = 1; i + 1 < dense.length; i++) {
    if (!dense[i]!.node) continue;
    const a = dense[i]!;
    for (let s = 0; s < ROUTE_LINE.joinSections; s++) {
      const t0 = (s / ROUTE_LINE.joinSections) * Math.PI * 2;
      const t1 = ((s + 1) / ROUTE_LINE.joinSections) * Math.PI * 2;
      put(a.x, a.z);
      put(a.x + Math.cos(t0) * half, a.z + Math.sin(t0) * half);
      put(a.x + Math.cos(t1) * half, a.z + Math.sin(t1) * half);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.computeBoundingSphere();
  return geo;
}
