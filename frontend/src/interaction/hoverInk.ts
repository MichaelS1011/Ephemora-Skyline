/**
 * Shared resources for the pointer's ink annotation (see interaction/hover for
 * the contract it draws).
 *
 * One unit footprint buffer for the whole city, scaled per object: the ground
 * cut line is four straight lines, so a flat box's edges are exactly it. The
 * body's own contour reuses the edge buffer the building already computed —
 * a second `LineSegments` over the same geometry, in ink, invisible at rest.
 * Hovering one building therefore costs two draw calls and no allocations.
 */

import * as THREE from "three";
import { HOVER_INK } from "./hover";

/** Unit footprint outline (1 × 1 in x/z), scaled per object. */
export const FOOTPRINT_EDGES: THREE.EdgesGeometry = (() => {
  const box = new THREE.BoxGeometry(1, 0.02, 1);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  return edges;
})();

/**
 * The ink material: one per hoverable object, because the glow is per object
 * and cannot be shared. Created at opacity 0 with the meshes hidden, so a city
 * nobody points at pays nothing for it.
 */
export function makeInkMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: HOVER_INK,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}
