import * as THREE from "three";
import type { DirLayout } from "./layout";
import { surfacePoint, surfaceQuaternion, type WorldSurface } from "./worldSurface";

export const WORLD_OVERVIEW_ELEVATION = 0.68;
export const WORLD_OVERVIEW_PADDING = { top: 0.6, bottom: 0.76, horizontal: 0.88 } as const;
const VERTICAL_OFFSET = 0.08;

/** Corners of the data-bearing plots in their REAL tangent foundations.
 * Roads, measuring poles and alarm light beams cannot shrink the subject. */
export function overviewWorldPoints(layout: DirLayout, surface: WorldSurface): THREE.Vector3[] {
  const plots = [
    ...layout.buildings.map((b) => ({ ...b, top: b.h + 1.5 })),
    ...layout.blocks.map((b) => ({
      ...b,
      top:
        Math.max(1, ...b.skyline.map((tower) => tower.h), ...(b.strip ?? []).map((bar) => bar.h)) +
        1.5,
    })),
  ];
  const points: THREE.Vector3[] = [];
  for (const plot of plots) {
    const anchor = surfacePoint(surface, plot.x, 0, plot.z);
    const orientation = surfaceQuaternion(surface, plot.x, plot.z);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        for (const y of [0, plot.top]) {
          points.push(
            new THREE.Vector3(x * (plot.w / 2 + 1.5), y, z * (plot.d / 2 + 1.5))
              .applyQuaternion(orientation)
              .add(anchor),
          );
        }
  }
  return points.length > 0 ? points : [surfacePoint(surface, layout.centre.x, 0, layout.centre.z)];
}

/** Fit to the actual vertical/horizontal frustum, reserving room for the HUD.
 * View azimuth can be kept; the overview's elevation is explicit and calm. */
export function fitWorldOverview(
  layout: DirLayout,
  surface: WorldSurface,
  aspect: number,
  azimuth = Math.atan2(0.75, 0.4),
  fov = 52,
): { position: THREE.Vector3; target: THREE.Vector3; distance: number; points: THREE.Vector3[] } {
  const points = overviewWorldPoints(layout, surface);
  const target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const elevation = WORLD_OVERVIEW_ELEVATION;
  const back = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
  );
  const right = new THREE.Vector3(back.z, 0, -back.x).normalize();
  const up = new THREE.Vector3().crossVectors(back, right).normalize();
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const horizontal =
    Math.tan(THREE.MathUtils.degToRad(fov) / 2) *
    Math.max(0.25, Number.isFinite(aspect) ? aspect : 1) *
    WORLD_OVERVIEW_PADDING.horizontal;
  let distance = 24;
  const relative = new THREE.Vector3();
  for (const point of points) {
    relative.copy(point).sub(target);
    const depth = relative.dot(back);
    const height = relative.dot(up);
    distance = Math.max(
      distance,
      (height + WORLD_OVERVIEW_PADDING.top * vertical * depth) /
        ((WORLD_OVERVIEW_PADDING.top + VERTICAL_OFFSET) * vertical),
      (-height + WORLD_OVERVIEW_PADDING.bottom * vertical * depth) /
        ((WORLD_OVERVIEW_PADDING.bottom - VERTICAL_OFFSET) * vertical),
      depth + Math.abs(relative.dot(right)) / horizontal,
    );
  }
  distance *= 1.03;
  // Shift the subject down slightly: the scan summary occupies the top of the canvas.
  target.addScaledVector(up, VERTICAL_OFFSET * vertical * distance);
  return { points, target, distance, position: target.clone().addScaledVector(back, distance) };
}
