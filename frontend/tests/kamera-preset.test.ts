import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "fs";
import path from "path";
import {
  ANSICHTEN,
  blickwinkelFür,
  PRESET_FOV_DEG,
  isAnsicht,
  presetPose,
  type Hindernis,
} from "../src/city/cameraPresets";
import { fitWorldOverview } from "../src/city/worldFraming";
import { FLAT_SURFACE } from "../src/city/worldSurface";
import { getDirLayout } from "../src/city/layout";
import { city, dir, file, finding } from "./helpers/cityFixture";

/**
 * MASTER-2027 §06.01 — named views have to be numbers, not adjectives.
 *
 * The address already carries a camera, so "reproducible" was one step away:
 * what was missing was a name for the view. These cases hold the four things a
 * name has to guarantee — the pose is finite, the three names are three
 * different views, the level is inside the frame the name promises, and the
 * preset adds no framing arithmetic of its own (`worldFraming.ts` stays the
 * single place that fits a city).
 */

const stadt = city({
  tree: dir({
    path: "",
    name: "",
    children: [
      dir({
        path: "src",
        detailFiles: [
          file("src/a.ts", "TypeScript", [finding({ severity: "P0", message: "Secret" })]),
        ],
      }),
      dir({ path: "docs", detailFiles: [file("docs/b.md", "Markdown", [])] }),
    ],
    detailFiles: [file("c.ts", "TypeScript", [finding({ severity: "P2", message: "Loose" })])],
  }),
});
const layout = getDirLayout(stadt, []);
const seitenverhältnis = 1280 / 800;

/** The camera a reader would land in: the pose, the fov, the aspect. */
const kamera = (name: (typeof ANSICHTEN)[number]) => {
  const pose = presetPose(name, layout, FLAT_SURFACE, seitenverhältnis);
  const cam = new THREE.PerspectiveCamera(PRESET_FOV_DEG, seitenverhältnis, 0.1, 5000);
  cam.position.set(pose.x, pose.y, pose.z);
  cam.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return { cam, pose };
};

describe("the named views of a level (§06.01)", () => {
  it("names three views and nothing else", () => {
    expect([...ANSICHTEN]).toEqual(["übersicht", "hero", "straße"]);
    expect(isAnsicht("straße")).toBe(true);
    expect(isAnsicht("mond")).toBe(false);
    expect(isAnsicht(undefined)).toBe(false);
  });

  it("lands on a finite pose for every view", () => {
    for (const name of ANSICHTEN) {
      const pose = presetPose(name, layout, FLAT_SURFACE, seitenverhältnis);
      for (const [feld, wert] of Object.entries(pose))
        expect(Number.isFinite(wert), `${name}.${feld} = ${wert}`).toBe(true);
      expect(pose.y, `${name} stands above the ground`).toBeGreaterThan(0);
    }
  });

  it("gives three different views, not one view named three times", () => {
    const { pose: übersicht } = kamera("übersicht");
    const { pose: hero } = kamera("hero");
    const { pose: straße } = kamera("straße");
    const abstand = (a: typeof übersicht, b: typeof übersicht) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(abstand(übersicht, hero)).toBeGreaterThan(0.5);
    expect(abstand(hero, straße)).toBeGreaterThan(0.5);
    expect(abstand(übersicht, straße)).toBeGreaterThan(0.5);
    // the low view really looks less steeply down than the overview
    expect(straße.pitch).toBeGreaterThan(übersicht.pitch);
  });

  it("frames every data-bearing plot — the level is found, not lost", () => {
    // The same nine ground points and silhouette points the pilot's own
    // lost/found rule uses, read through a camera built from the preset.
    const punkte: THREE.Vector3[] = [];
    const bounds = Math.max(1, layout.bounds);
    const kanten = (y: number) => {
      const out: THREE.Vector3[] = [];
      for (const sx of [-1, 0, 1])
        for (const sz of [-1, 0, 1])
          out.push(
            new THREE.Vector3(layout.centre.x + sx * bounds, y, layout.centre.z + sz * bounds),
          );
      return out;
    };
    punkte.push(...kanten(0), ...kanten(4));
    for (const name of ANSICHTEN) {
      const { cam } = kamera(name);
      const kegel = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      );
      const gesehen = punkte.filter((p) => kegel.containsPoint(p)).length;
      // A preset that showed fewer than the nine ground points would be a view
      // of the sky, not of the city.
      expect(
        gesehen,
        `${name} sieht ${gesehen} von ${punkte.length} Punkten`,
      ).toBeGreaterThanOrEqual(9);
    }
  });

  it("adds no framing arithmetic of its own", () => {
    // `übersicht` must be the overview flight's own fit, byte for byte.
    const gefügt = fitWorldOverview(layout, FLAT_SURFACE, seitenverhältnis);
    const pose = presetPose("übersicht", layout, FLAT_SURFACE, seitenverhältnis);
    expect(pose.x).toBeCloseTo(gefügt.position.x, 6);
    expect(pose.y).toBeCloseTo(gefügt.position.y, 6);
    expect(pose.z).toBeCloseTo(gefügt.position.z, 6);
  });

  it("is stable across calls, so two loads of one name are one view", () => {
    const a = presetPose("hero", layout, FLAT_SURFACE, seitenverhältnis);
    const b = presetPose("hero", layout, FLAT_SURFACE, seitenverhältnis);
    expect(b).toEqual(a);
  });
});

/**
 * MASTER-2027 Z-01 (§07.11) — the azimuth a guide is watched from.
 *
 * The oracle here is deliberately not the implementation: a direction is
 * called clear by walking 240 points along the camera's line of sight and
 * asking whether any of them stands inside a tower. If that agrees with
 * `blickwinkelFür`, the function found a real gap and not a hole in its own
 * slab test.
 */
describe("blickwinkelFür — the direction that sees the kerb", () => {
  const elevation = 0.68;
  const punkt = { x: 0, y: 0.9, z: 0 };

  const kameraBei = (azimut: number, entfernung = 30) => ({
    x: punkt.x + Math.cos(azimut) * Math.cos(elevation) * entfernung,
    y: punkt.y + Math.sin(elevation) * entfernung,
    z: punkt.z + Math.sin(azimut) * Math.cos(elevation) * entfernung,
  });

  const freiDurchlaufen = (azimut: number, hue: readonly Hindernis[]): boolean => {
    const k = kameraBei(azimut);
    for (let i = 1; i < 240; i++) {
      const t = i / 240;
      const x = k.x + (punkt.x - k.x) * t;
      const y = k.y + (punkt.y - k.y) * t;
      const z = k.z + (punkt.z - k.z) * t;
      for (const b of hue) {
        if (
          y > 0 &&
          y < b.top &&
          Math.abs(x - b.x) < b.w / 2 + 0.4 &&
          Math.abs(z - b.z) < b.d / 2 + 0.4
        )
          return false;
      }
    }
    return true;
  };

  it("never moves a camera that can already see", () => {
    expect(blickwinkelFür(punkt, 30, elevation, [], 1.1)).toBe(1.1);
  });

  it("steps aside for a tower standing in the way, and the new line is really free", () => {
    const wand: Hindernis = { x: 14, z: 0, w: 6, d: 6, top: 24 };
    const von = 0;
    const gewaehlt = blickwinkelFür(punkt, 30, elevation, [wand], von);
    expect(gewaehlt).not.toBeCloseTo(von, 6);
    expect(
      Math.abs(((gewaehlt - von + Math.PI * 3) % (Math.PI * 2)) - Math.PI),
    ).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
    expect(freiDurchlaufen(gewaehlt, [wand]), `azimut ${gewaehlt.toFixed(3)}`).toBe(true);
  });

  it("comes back to the asked direction when every direction is walled in", () => {
    const ring: Hindernis[] = [
      { x: 20, z: 0, w: 8, d: 60, top: 40 },
      { x: -20, z: 0, w: 8, d: 60, top: 40 },
      { x: 0, z: 20, w: 60, d: 8, top: 40 },
      { x: 0, z: -20, w: 60, d: 8, top: 40 },
    ];
    expect(blickwinkelFür(punkt, 30, elevation, ring, 0.3)).toBe(0.3);
  });

  it("is decided by the body's height, not by its footprint in plan", () => {
    // The mistake this replaces: a short neighbour one plot away hides nothing
    // from a camera looking down at 0,68 rad — the ray passes over its roof.
    const kurz: Hindernis = { x: 12, z: 0, w: 6, d: 6, top: 2 };
    expect(blickwinkelFür(punkt, 30, elevation, [kurz], 0)).toBe(0);
    const hoch: Hindernis = { x: 12, z: 0, w: 6, d: 6, top: 40 };
    expect(blickwinkelFür(punkt, 30, elevation, [hoch], 0)).not.toBe(0);
  });
});

describe("the guide is framed, not followed blindly", () => {
  const quelle = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
    "utf-8",
  );

  it("flies once per phase, on the nearest clear line", () => {
    expect(quelle).toContain("blickwinkelFür(");
    expect(quelle).toContain("HERO_FRAMING");
    expect(quelle).toContain("geflogenRef.current === schluessel");
    expect(quelle).toContain("const schluessel = `${guide.role}|${guide.targetFileId}`;");
    // One flight per errand: a second one at the arrival is the camera moving,
    // not the guide, and it landed on top of the look-around (§07.11).
    expect(quelle).not.toContain('guidePhase === "arrived" ? "an" : "weg"');
  });

  it("does not fly under reduced motion, and leaves a named view alone", () => {
    expect(quelle).toMatch(/if \(prefersReducedMotion\(\)\) return;\n\s+const schluessel/);
    expect(quelle).toMatch(
      /const plot = layout\.buildings\.find\(\(b\) => b\.file\.id === guide\.targetFileId\)/,
    );
  });
});
