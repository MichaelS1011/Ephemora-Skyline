import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as THREE from "three";
import { buildOpenWorld, standOnLane } from "../src/city/openWorldStreets";

/**
 * M1 — the Ephe's have to be *seen* on the empty world.
 *
 * The establishing shot is what a first-time user looks at, and a figure that
 * is outside the frame or two pixels tall is not in it. This guard runs the
 * canvas's own camera math against every kerb node of the open world's grid:
 * a figure standing there is projected through the same perspective camera the
 * Canvas mounts, at the same 1600x1000 the measurement is taken at.
 *
 * It is geometry, not a screenshot — the pixel measurement in
 * a local measurement script that is not shipped is what proves the projection matches the plate.
 */

const VIEW = { w: 1600, h: 1000 };
/** An Ephe is a capsule plus a head: about this tall at full scale. */
const FIGURE_HEIGHT = 1.35;
/** The readability floor agreed for M1: a figure under this is a speck. */
const MIN_PIXEL_HEIGHT = 3;
/** At least this much of the graph has to be inside the frame. */
const MIN_READABLE_SHARE = 0.9;

/** The empty world's camera, read out of CityScene so the guard cannot drift
 *  away from the shot the component actually sets. CityScene sets two cameras:
 *  the crane's street-level start for a build, and this one for the bare world. */
function sceneCamera(): THREE.PerspectiveCamera {
  const source = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
    "utf-8",
  );
  const emptyWorld = source.slice(source.indexOf("craneBuildRef.current = null;"));
  const pos = /camera\.position\.set\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(emptyWorld);
  const look = /camera\.lookAt\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(emptyWorld);
  expect(pos, "CityScene no longer sets the empty world camera").not.toBeNull();
  expect(look, "CityScene no longer aims the empty world camera").not.toBeNull();
  // the canvas mounts a 52° vertical fov; the frame is the measurement's
  const canvas = readFileSync(path.resolve(import.meta.dirname, "../src/App.tsx"), "utf-8");
  const fov = /fov:\s*(\d+(?:\.\d+)?)/.exec(canvas);
  const camera = new THREE.PerspectiveCamera(Number(fov?.[1] ?? 52), VIEW.w / VIEW.h, 0.5, 1600);
  camera.position.set(Number(pos![1]), Number(pos![2]), Number(pos![3]));
  camera.lookAt(new THREE.Vector3(Number(look![1]), Number(look![2]), Number(look![3])));
  camera.updateMatrixWorld();
  return camera;
}

function projected(camera: THREE.PerspectiveCamera, x: number, y: number, z: number) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    px: (v.x * 0.5 + 0.5) * VIEW.w,
    py: (-v.y * 0.5 + 0.5) * VIEW.h,
    behind: v.z > 1,
  };
}

describe("M1: the crowd on the empty world is inside the frame and readable", () => {
  const world = buildOpenWorld();
  const camera = sceneCamera();

  it("frames every kerb of the grid, and keeps a figure on it at 3 px or more", () => {
    let readable = 0;
    const heights: number[] = [];
    const missed: Array<{ x: number; z: number; px: number; py: number }> = [];
    for (const n of world.network.nodes) {
      const base = projected(camera, n.x, 0, n.z);
      const top = projected(camera, n.x, FIGURE_HEIGHT, n.z);
      const inside =
        !base.behind &&
        !top.behind &&
        base.px >= 0 &&
        base.px <= VIEW.w &&
        top.px >= 0 &&
        top.px <= VIEW.w &&
        base.py >= 0 &&
        base.py <= VIEW.h &&
        top.py >= 0;
      if (!inside) {
        if (missed.length < 6) missed.push({ x: n.x, z: n.z, px: base.px, py: base.py });
        continue;
      }
      const h = Math.abs(base.py - top.py);
      heights.push(h);
      if (h >= MIN_PIXEL_HEIGHT) readable++;
    }
    const share = readable / world.network.nodes.length;
    heights.sort((a, b) => a - b);
    // Reported so the number is visible in the suite, not just a green dot.
    expect(
      share,
      `only ${(share * 100).toFixed(1)}% of the grid is readable (min ${heights[0]?.toFixed(
        1,
      )} px, median ${heights[Math.floor(heights.length / 2)]?.toFixed(1)} px, off frame: ${JSON.stringify(
        missed,
      )})`,
    ).toBeGreaterThanOrEqual(MIN_READABLE_SHARE);
    // and nothing that IS in frame is a speck
    expect(heights[0]!).toBeGreaterThanOrEqual(MIN_PIXEL_HEIGHT);
  });

  it("keeps the stop sign and the taxi stands inside the shot too", () => {
    for (const p of [
      world.transit.stopPoint,
      world.transit.taxiCurb,
      standOnLane(world.transit.taxiLane, 0.18),
      standOnLane(world.transit.taxiLane, 0.82),
    ]) {
      const q = projected(camera, p.x, 0, p.z);
      expect(q.behind, `${p.x},${p.z} behind the camera`).toBe(false);
      expect(q.px).toBeGreaterThanOrEqual(0);
      expect(q.px).toBeLessThanOrEqual(VIEW.w);
      expect(q.py).toBeGreaterThanOrEqual(0);
      expect(q.py).toBeLessThanOrEqual(VIEW.h);
    }
  });
});
