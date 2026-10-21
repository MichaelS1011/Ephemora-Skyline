// The share hero is a crop decision, not a camera preference. Every format
// crops: the subject is the tallest plot plus whatever stands within the
// horizontal room the framing distance buys — and that room is proportional to
// the aspect, so a wide frame reaches further to the sides than a tall one.
// These cases pin the room rule, the tightness, and the fact that no corner of
// the subject leaves the recorded image.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { shareHeroPlots, shareHeroShot } from "../src/share/heroShot";
import { FLAT_SURFACE } from "../src/city/worldSurface";
import { fitWorldOverview, plotWorldPoints, WORLD_FOV_DEG } from "../src/city/worldFraming";
import type { DirLayout } from "../src/city/layout";

const layout = {
  centre: { x: 0, z: 0 },
  buildings: [],
  blocks: [
    { x: 0, z: 0, w: 20, d: 20, skyline: [{ h: 30 }, { h: 26 }], strip: [] },
    { x: 30, z: 0, w: 20, d: 20, skyline: [{ h: 22 }], strip: [] },
    { x: 250, z: 0, w: 20, d: 20, skyline: [{ h: 8 }], strip: [] },
  ],
} as unknown as DirLayout;

const distance = (shot: ReturnType<typeof shareHeroShot>): number =>
  Math.hypot(
    shot.position.x - shot.target.x,
    shot.position.y - shot.target.y,
    shot.position.z - shot.target.z,
  );

const cameraFor = (shot: ReturnType<typeof shareHeroShot>, aspect: number) => {
  const camera = new THREE.PerspectiveCamera(WORLD_FOV_DEG, aspect, 0.1, 20000);
  camera.position.set(shot.position.x, shot.position.y, shot.position.z);
  camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
};

describe("the share hero picks its subject by the room the format buys", () => {
  it("takes the near neighbour in landscape and leaves it out in portrait", () => {
    const portrait = shareHeroPlots(layout, FLAT_SURFACE, 9 / 16);
    const landscape = shareHeroPlots(layout, FLAT_SURFACE, 16 / 9);
    expect(portrait.map((p) => p.x)).toEqual([0]);
    expect(landscape.map((p) => p.x)).toEqual([0, 30]);
    expect(landscape.some((p) => p.x === 250)).toBe(false);
  });

  it("puts the taller frame closer than the wide one on the same city", () => {
    expect(distance(shareHeroShot(layout, FLAT_SURFACE, 9 / 16))).toBeLessThan(
      distance(shareHeroShot(layout, FLAT_SURFACE, 16 / 9)),
    );
  });

  it("stands closer than the interactive overview and keeps the subject inside", () => {
    for (const aspect of [9 / 16, 1, 16 / 9]) {
      const shot = shareHeroShot(layout, FLAT_SURFACE, aspect);
      const overview = fitWorldOverview(layout, FLAT_SURFACE, aspect);
      expect(distance(shot)).toBeLessThan(overview.distance);
      const camera = cameraFor(shot, aspect);
      let minX = 9;
      let maxX = -9;
      for (const point of plotWorldPoints(
        shareHeroPlots(layout, FLAT_SURFACE, aspect),
        FLAT_SURFACE,
      )) {
        const ndc = point.clone().project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        minX = Math.min(minX, ndc.x);
        maxX = Math.max(maxX, ndc.x);
      }
      expect((maxX - minX) / 2).toBeGreaterThan(0.35);
    }
  });

  it("returns finite numbers for a level with no plots", () => {
    const empty = { ...layout, blocks: [], buildings: [] } as unknown as DirLayout;
    const shot = shareHeroShot(empty, FLAT_SURFACE, 9 / 16);
    expect(Number.isFinite(shot.position.x + shot.position.y + shot.position.z)).toBe(true);
    expect(Number.isFinite(shot.target.x + shot.target.y + shot.target.z)).toBe(true);
  });
});
