import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import {
  dataPlots,
  fitWorldPoints,
  HERO_FRAMING,
  plotWorldPoints,
  WORLD_FOV_DEG,
  type WorldPlot,
} from "../city/worldFraming";
import type { WorldSurface } from "../city/worldSurface";

/** A camera pose in the numbers the store and MediaRecorder timeline need. */
export interface ShareHero {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/**
 * The hero is a crop in every format — not a miniature of everything.
 *
 * Fitting every plot makes the city small: even a wide frame holds a square
 * city only by leaving most of its height to ground and sky. So the shot is
 * built around the tallest plot, and the only question is how far the frame
 * reaches beside it. That reach is geometry, not taste: the distance is set by
 * the tallest plot's height, and the horizontal room that distance buys is
 * `distance · tan(fov/2) · aspect`, so a 16:9 frame reaches three times as far
 * to the sides as a 9:16 one at the same height. Plots inside that room are
 * the subject; a district across the map is not, because backing the camera up
 * for it shrinks everything else.
 */
export function shareHeroPlots(
  layout: DirLayout,
  surface: WorldSurface,
  aspect: number,
): WorldPlot[] {
  const plots = dataPlots(layout);
  if (plots.length < 2) return plots;
  const anchor = [...plots].sort((a, b) => b.top - a.top || b.w * b.d - a.w * a.d)[0]!;
  const room =
    fitWorldPoints(plotWorldPoints([anchor], surface), aspect, undefined, undefined, HERO_FRAMING)
      .distance *
    Math.tan(THREE.MathUtils.degToRad(WORLD_FOV_DEG) / 2) *
    Math.max(0.25, Number.isFinite(aspect) ? aspect : 1) *
    HERO_FRAMING.padding.horizontal;
  return plots.filter((p) => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= room);
}

/** The explicit camera pose a share take starts on and returns to. */
export function shareHeroShot(layout: DirLayout, surface: WorldSurface, aspect: number): ShareHero {
  const points = plotWorldPoints(shareHeroPlots(layout, surface, aspect), surface);
  // A level with no plots still needs a finite pose; the level centre is the
  // one point every layout is guaranteed to have.
  const fallback = plotWorldPoints(
    [{ x: layout.centre.x, z: layout.centre.z, w: 8, d: 8, top: 2 }],
    surface,
  );
  const fit = fitWorldPoints(
    points.length > 0 ? points : fallback,
    aspect,
    undefined,
    undefined,
    HERO_FRAMING,
  );
  return {
    position: { x: fit.position.x, y: fit.position.y, z: fit.position.z },
    target: { x: fit.target.x, y: fit.target.y, z: fit.target.z },
  };
}
