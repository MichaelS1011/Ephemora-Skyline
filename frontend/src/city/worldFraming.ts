import * as THREE from "three";
import type { DirLayout } from "./layout";
import { surfacePoint, surfaceQuaternion, type WorldSurface } from "./worldSurface";

export const WORLD_OVERVIEW_ELEVATION = 0.68;
/** The camera the app mounts with (App.tsx) — every fit below assumes it. */
export const WORLD_FOV_DEG = 52;
export const WORLD_OVERVIEW_PADDING = { top: 0.6, bottom: 0.76, horizontal: 0.88 } as const;
const VERTICAL_OFFSET = 0.08;

/** One data-bearing plot: its footprint, its world XZ and how tall it stands. */
export interface WorldPlot {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

/** Every building and district that carries data. Roads, poles and alarm
 * beams are not plots: they must not shrink the subject. */
export function dataPlots(layout: DirLayout): WorldPlot[] {
  return [
    ...layout.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, top: b.h + 1.5 })),
    ...layout.blocks.map((b) => ({
      x: b.x,
      z: b.z,
      w: b.w,
      d: b.d,
      top:
        Math.max(1, ...b.skyline.map((tower) => tower.h), ...(b.strip ?? []).map((bar) => bar.h)) +
        1.5,
    })),
  ];
}

/** Corners of the given plots in their REAL tangent foundations. */
export function plotWorldPoints(plots: WorldPlot[], surface: WorldSurface): THREE.Vector3[] {
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
  return points;
}

/** Corners of every data-bearing plot in its real tangent foundation. */
export function overviewWorldPoints(layout: DirLayout, surface: WorldSurface): THREE.Vector3[] {
  const points = plotWorldPoints(dataPlots(layout), surface);
  return points.length > 0 ? points : [surfacePoint(surface, layout.centre.x, 0, layout.centre.z)];
}

export interface WorldFit {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  points: THREE.Vector3[];
}

/** How much of the frustum the subject may claim, and from what angle. */
export interface WorldFraming {
  elevation: number;
  padding: { top: number; bottom: number; horizontal: number };
  /** Shifts the subject down inside the frame (the scan summary sits on top). */
  verticalOffset: number;
}

export const OVERVIEW_FRAMING: WorldFraming = {
  elevation: WORLD_OVERVIEW_ELEVATION,
  padding: { ...WORLD_OVERVIEW_PADDING },
  verticalOffset: VERTICAL_OFFSET,
};

/** A recorded city has no HUD to make room for: the frame is the subject, and
 * a low angle gives the towers a face instead of only their roofs. Measured on
 * four layouts (1-6 plots, all three formats): the subject claims 88-89 % of a
 * 9:16 frame and 40-47 % of a 16:9 one — the rest of the wide frame is the
 * ground it stands on — with no plot corner crossing an edge. */
export const HERO_FRAMING: WorldFraming = {
  elevation: 0.5,
  padding: { top: 0.99, bottom: 0.82, horizontal: 0.97 },
  verticalOffset: 0,
};

/** Fit a point cloud to the actual vertical/horizontal frustum, reserving room
 * for the HUD. View azimuth can be kept; the elevation is explicit and calm. */
export function fitWorldPoints(
  points: THREE.Vector3[],
  aspect: number,
  azimuth = Math.atan2(0.75, 0.4),
  fov = WORLD_FOV_DEG,
  framing: WorldFraming = OVERVIEW_FRAMING,
): WorldFit {
  const target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const elevation = framing.elevation;
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
    framing.padding.horizontal;
  const offset = framing.verticalOffset;
  let distance = 24;
  const relative = new THREE.Vector3();
  for (const point of points) {
    relative.copy(point).sub(target);
    const depth = relative.dot(back);
    const height = relative.dot(up);
    distance = Math.max(
      distance,
      (height + framing.padding.top * vertical * depth) /
        ((framing.padding.top + offset) * vertical),
      (-height + framing.padding.bottom * vertical * depth) /
        ((framing.padding.bottom - offset) * vertical),
      depth + Math.abs(relative.dot(right)) / horizontal,
    );
  }
  distance *= 1.03;
  // Shift the subject down slightly: the scan summary occupies the top of the canvas.
  target.addScaledVector(up, offset * vertical * distance);
  return { points, target, distance, position: target.clone().addScaledVector(back, distance) };
}

/** Fit every data-bearing plot. This is the old overview contract, unchanged. */
export function fitWorldOverview(
  layout: DirLayout,
  surface: WorldSurface,
  aspect: number,
  azimuth = Math.atan2(0.75, 0.4),
  fov = 52,
): WorldFit {
  return fitWorldPoints(overviewWorldPoints(layout, surface), aspect, azimuth, fov);
}
