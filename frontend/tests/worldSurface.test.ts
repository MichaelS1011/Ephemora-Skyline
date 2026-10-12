import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  FLAT_SURFACE,
  SURFACE_LIMITS,
  makeWorldSurface,
  surfaceHeight,
  surfaceMatrix,
  surfaceNormal,
  surfacePoint,
  surfaceQuaternion,
  surfaceStreetSegments,
  surfaceForLayout,
} from "../src/city/worldSurface";
import { farLodExitDistance, type DirLayout } from "../src/city/layout";
import { fitWorldOverview, WORLD_OVERVIEW_PADDING } from "../src/city/worldFraming";
import { makeSurfaceGroundGeometry } from "../src/render/ground";
import { clampToCity } from "../src/components/CameraRig";

describe("world land grows with its drawn footprint", () => {
  it("keeps small towns exactly flat, including their old matrices", () => {
    for (const extent of [0, 10, 44, SURFACE_LIMITS.flatExtent]) {
      const surface = makeWorldSurface(extent, { x: 80, z: -20 });
      expect(surface.strength).toBe(0);
      expect(surfacePoint(surface, 42, 12, -9).toArray()).toEqual([42, 12, -9]);
      const matrix = new THREE.Matrix4().makeTranslation(42, 12, -9);
      expect(surfaceMatrix(surface, matrix)).toBe(matrix);
    }
  });

  it("does not let wide empty perimeter roads bend a single small plot", () => {
    const layout = {
      centre: { x: 0, z: 0 },
      buildings: [{ x: 0, z: 0, w: 8, d: 8 }],
      blocks: [],
      streets: [{ x1: -100, z1: -100, x2: 100, z2: 100 }],
    } as unknown as DirLayout;
    expect(surfaceForLayout(layout).strength).toBe(0);
    expect(surfaceForLayout(layout).radius).toBe(Infinity);
  });

  it("has no size threshold jump and bounds the greatest land slope", () => {
    let last = 0;
    for (let extent = 0; extent <= 600; extent += 0.5) {
      const surface = makeWorldSurface(extent);
      expect(surface.strength).toBeGreaterThanOrEqual(last);
      expect(surface.strength - last).toBeLessThan(0.006);
      if (surface.strength > 0) {
        const slope = surfaceNormal(surface, extent, 0).angleTo(new THREE.Vector3(0, 1, 0));
        expect(slope).toBeLessThanOrEqual(Math.asin(SURFACE_LIMITS.maxSlope) + 1e-8);
      }
      last = surface.strength;
    }
    expect(makeWorldSurface(45 + 0.0001).strength).toBeLessThan(1e-10);
    expect(makeWorldSurface(600).strength).toBe(1);
  });

  it("makes a detail view calmer without changing the land's centre", () => {
    const centre = { x: 80, z: -52 };
    const overview = makeWorldSurface(200, centre);
    const detail = makeWorldSurface(200, centre, true);
    expect(detail.strength).toBeCloseTo(overview.strength * SURFACE_LIMITS.detailStrength);
    expect(surfacePoint(detail, centre.x, 0, centre.z).toArray()).toEqual([80, 0, -52]);
    expect(Math.abs(surfaceHeight(detail, 180, -52))).toBeLessThan(
      Math.abs(surfaceHeight(overview, 180, -52)),
    );
  });
});

describe("everything occupies the same surface", () => {
  const surface = makeWorldSurface(220, { x: 15, z: -12 });
  it("preserves measured height and size along the local normal", () => {
    const ground = surfacePoint(surface, 190, 0, 52);
    const roof = surfacePoint(surface, 190, 34, 52);
    expect(roof.distanceTo(ground)).toBeCloseTo(34);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(190, 34, 52),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7),
      new THREE.Vector3(2, 3, 4),
    );
    const bent = surfaceMatrix(surface, matrix).clone();
    const p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    bent.decompose(p, q, scale);
    expect(p.distanceTo(roof)).toBeLessThan(1e-6);
    scale.toArray().forEach((value, i) => expect(value).toBeCloseTo([2, 3, 4][i]!));
    expect(
      new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(surfaceNormal(surface, 190, 52)),
    ).toBeLessThan(1e-6);
  });

  it("raycasts the actual curved building at its displayed roof", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshBasicMaterial());
    mesh.position.copy(surfacePoint(surface, 190, 4, 52));
    mesh.quaternion.copy(surfaceQuaternion(surface, 190, 52));
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      surfacePoint(surface, 190, 20, 52),
      surfaceNormal(surface, 190, 52).negate(),
    );
    const hit = ray.intersectObject(mesh)[0];
    expect(hit).toBeDefined();
    expect(hit!.distance).toBeCloseTo(12);
    expect(hit!.point.distanceTo(surfacePoint(surface, 190, 8, 52))).toBeLessThan(1e-6);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it("keeps collapsed construction instances finite and invisible", () => {
    const flat = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(190, 2, 52);
    const bent = surfaceMatrix(surface, flat);
    expect(bent.elements.every(Number.isFinite)).toBe(true);
    expect(bent.determinant()).toBe(0);
    expect(
      new THREE.Vector3().setFromMatrixPosition(bent).distanceTo(surfacePoint(surface, 190, 2, 52)),
    ).toBeLessThan(1e-6);
  });

  it("keeps a street continuous and short enough to follow the land", () => {
    const line = { x1: -100, z1: -50, x2: 180, z2: 80 };
    const pieces = surfaceStreetSegments(surface, line);
    expect(pieces[0]!.x1).toBe(line.x1);
    expect(pieces.at(-1)!.z2).toBe(line.z2);
    pieces.forEach((piece, i) => {
      const length = Math.hypot(piece.x2 - piece.x1, piece.z2 - piece.z1);
      expect(length).toBeLessThanOrEqual(SURFACE_LIMITS.roadSegment + 1e-8);
      if (i > 0) expect([piece.x1, piece.z1]).toEqual([pieces[i - 1]!.x2, pieces[i - 1]!.z2]);
      expect((length * length) / (8 * surface.radius)).toBeLessThan(0.02);
    });
    expect(surfaceStreetSegments(FLAT_SURFACE, line)).toEqual([line]);
  });

  it("uses fixed-budget ground geometry and follows the same analytic surface", () => {
    for (const extent of [2, 70, 236, 1200]) {
      const land = makeWorldSurface(extent);
      const geometry = makeSurfaceGroundGeometry(land);
      expect(geometry.getAttribute("position").count).toBeLessThan(10000);
      const top = geometry.getAttribute("position");
      if (geometry.type === "SphereGeometry") {
        let highest = -Infinity;
        for (let i = 0; i < top.count; i++) highest = Math.max(highest, top.getY(i));
        expect(highest).toBeCloseTo(-0.05, 3);
      }
      geometry.dispose();
    }
  });

  it("keeps the free camera above curved land at the selected district", () => {
    const kept = clampToCity({ x: 190, y: -100, z: 52 }, 220, surface.centre, surface);
    expect(kept.y).toBeCloseTo(surfaceHeight(surface, 190, 52) + 1);
    expect(clampToCity({ x: 190, y: -100, z: 52 }, 220).y).toBe(1);
  });
});

describe("overview framing follows data rather than empty streets", () => {
  const layout = (
    plots: Array<{ x: number; z: number; w: number; d: number; h: number }>,
    bounds: number,
  ) =>
    ({
      centre: { x: 0, z: 0 },
      bounds,
      buildings: plots,
      blocks: [],
      streets: [{ x1: -300, z1: -300, x2: 300, z2: 300 }],
    }) as unknown as DirLayout;

  it("gives a two-building town a close shot centred on its own land", () => {
    const data = layout(
      [
        { x: 90, z: -40, w: 4, d: 4, h: 5 },
        { x: 97, z: -40, w: 4, d: 4, h: 5 },
      ],
      100,
    );
    const shot = fitWorldOverview(data, FLAT_SURFACE, 1.5);
    expect(shot.distance).toBeLessThan(35);
    const subject = new THREE.Box3().setFromPoints(shot.points).getCenter(new THREE.Vector3());
    expect(subject.x).toBeCloseTo(93.5);
    expect(subject.z).toBeCloseTo(-40);
    expect(shot.target.distanceTo(subject)).toBeLessThan(2);
  });

  it.each([1.25, 1.5, 16 / 9, 2.2])(
    "keeps every curved plot inside a %s viewport with HUD room",
    (aspect) => {
      const data = layout(
        Array.from({ length: 20 }, (_, i) => ({
          x: ((i % 5) - 2) * 42,
          z: (Math.floor(i / 5) - 1.5) * 42,
          w: 20,
          d: 20,
          h: 4 + (i % 4) * 9,
        })),
        110,
      );
      const surface = surfaceForLayout(data);
      const shot = fitWorldOverview(data, surface, aspect);
      // A complete world overview must recover actual buildings even when
      // arriving from the distant heat-cell mode, not merely avoid cropping.
      expect(shot.distance).toBeLessThan(farLodExitDistance(data.bounds));
      const camera = new THREE.PerspectiveCamera(52, aspect, 0.5, 5000);
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
      camera.updateMatrixWorld(true);
      for (const point of shot.points) {
        const ndc = point.clone().project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(WORLD_OVERVIEW_PADDING.horizontal + 1e-6);
        expect(ndc.y).toBeLessThanOrEqual(WORLD_OVERVIEW_PADDING.top + 1e-6);
        expect(ndc.y).toBeGreaterThanOrEqual(-WORLD_OVERVIEW_PADDING.bottom - 1e-6);
        expect(ndc.z).toBeGreaterThan(-1);
        expect(ndc.z).toBeLessThan(1);
      }
    },
  );
});
