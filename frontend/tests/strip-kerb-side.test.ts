import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDirLayout, stripRowZ, type BlockPlacement, type DirLayout } from "../src/city/layout";
import { fitWorldOverview, WORLD_OVERVIEW_ELEVATION } from "../src/city/worldFraming";
import { FLAT_SURFACE } from "../src/city/worldSurface";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * The group strip is a bar chart, and a bar chart whose base stands behind its
 * own district's towers carries no height. It did: the row was placed on the far
 * kerb while every presentation vantage — the empty-world shot, the construction
 * crane, the reveal to the overview — sits on the +z side, where the key light
 * is too (azimuth 23°, `render/sky.SUN_POSITION`).
 *
 * This file re-measures the claim that moved the row, over a laid-out city and
 * the camera the app actually frames a fresh build with:
 *
 * 1. every bar's camera-facing silhouette is at least 95 % unoccluded;
 * 2. the far kerb, measured the same way, is NOT — so the guard has teeth;
 * 3. the row still reads left (riskiest) to right from that camera, which is the
 *    half of the promise a vantage on the other side of the city would buy its
 *    bars with;
 * 4. the podium stone stands on the kerb the row left, not on this one.
 */

function file(pathStr: string, complexity: number): CityFile {
  return {
    id: pathStr,
    name: pathStr.split("/").pop() ?? pathStr,
    path: pathStr,
    language: "TypeScript",
    linesOfCode: 40 + complexity * 12,
    cyclomaticComplexity: complexity,
    threatLevel: complexity > 20 ? "critical" : "safe",
    findings: complexity > 20 ? [{ severity: "P1", type: "X", line: 1, message: "x" }] : [],
  };
}

function dir(p: string, files: CityFile[]): CityDir {
  return {
    name: p,
    path: p,
    fileCount: files.length,
    linesOfCode: files.reduce((n, f) => n + f.linesOfCode, 0),
    languages: { TypeScript: files.reduce((n, f) => n + f.linesOfCode, 0) },
    findingsBySeverity: { P0: 0, P1: files.filter((f) => f.findings.length).length, P2: 0 },
    threatScore: 40,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files.slice(0, 6),
  };
}

const app = Array.from({ length: 20 }, (_, i) => file(`app/f${i}.ts`, 3 + i * 1.3));
const lib = Array.from({ length: 20 }, (_, i) => file(`lib/g${i}.ts`, 26 - i * 1.1));
const city = {
  repo: { owner: "t", name: "t", branch: "main" },
  totalFiles: 40,
  renderedFiles: 40,
  totalLines: 4000,
  findingsBySeverity: { P0: 0, P1: 8, P2: 0 },
  languages: { TypeScript: 4000 },
  tree: dir("", [...app, ...lib]),
  additionalFiles: [],
  fileConnections: [],
  dirConnections: [],
  meta: {
    churn: false,
    deadCode: false,
    duplicates: false,
    cycles: false,
    coverage: false,
    blame: false,
  },
} as unknown as CityData;
// two child folders, so the level draws two plots with a strip each
city.tree.children = [dir("app", app), dir("lib", lib)];

/** The vantage a fresh build is presented from: the first overview flight. */
const PRESENT_AZIMUTH = Math.atan2(0.75, 0.4);

function cameraFor(layout: DirLayout, azimuth: number): THREE.PerspectiveCamera {
  const fitted = fitWorldOverview(layout, FLAT_SURFACE, 1600 / 1000, azimuth, 52);
  const back = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(WORLD_OVERVIEW_ELEVATION),
    Math.sin(WORLD_OVERVIEW_ELEVATION),
    Math.sin(azimuth) * Math.cos(WORLD_OVERVIEW_ELEVATION),
  ).normalize();
  const cam = new THREE.PerspectiveCamera(52, 1600 / 1000, 0.5, 4000);
  cam.position.copy(fitted.target).addScaledVector(back, fitted.distance);
  cam.lookAt(fitted.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

const FACES: Array<[number, number, number, number]> = [
  [1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
  [0, -1, 1, 0],
];

/** Fraction of a box's camera-facing side surface the towers do not cover. */
function clearOf(target: THREE.Box3, blockers: THREE.Box3[], cam: THREE.PerspectiveCamera): number {
  const { min, max } = target;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const p = new THREE.Vector3();
  let seen = 0;
  let total = 0;
  for (const [nx, nz, tx, tz] of FACES) {
    const fx = nx > 0 ? max.x : nx < 0 ? min.x : cx;
    const fz = nz > 0 ? max.z : nz < 0 ? min.z : cz;
    const normal = new THREE.Vector3(nx, 0, nz);
    if (normal.dot(cam.position.clone().sub(new THREE.Vector3(fx, (min.y + max.y) / 2, fz))) <= 0)
      continue;
    const half = (tx !== 0 ? max.x - min.x : max.z - min.z) / 2;
    for (let i = 1; i <= 5; i++)
      for (let j = 1; j <= 5; j++) {
        const along = -half + (2 * half * i) / 6;
        p.set(
          nx !== 0 ? fx : cx + tx * along,
          min.y + (max.y - min.y) * (j / 6),
          nz !== 0 ? fz : cz + tz * along,
        );
        total++;
        ray.origin.copy(cam.position);
        ray.direction.copy(p).sub(cam.position);
        const len = ray.direction.length();
        ray.direction.divideScalar(len);
        const blocked = blockers.some(
          (b) => ray.intersectBox(b, hit) !== null && hit.distanceTo(cam.position) < len - 1e-3,
        );
        if (!blocked) seen++;
      }
  }
  expect(total).toBeGreaterThan(0);
  return seen / total;
}

/** The towers of the plot a strip belongs to — the occluders the row was built against. */
function plotBoxes(
  block: BlockPlacement,
  rowSign: number,
): {
  bars: Array<{ index: number; box: THREE.Box3 }>;
  towers: THREE.Box3[];
} {
  const bars = (block.strip ?? []).map((bar, index) => {
    const x = block.x + bar.x;
    const z = block.z + rowSign * Math.abs(stripRowZ(block.d, bar.d));
    return {
      index,
      box: new THREE.Box3(
        new THREE.Vector3(x - bar.w / 2, 0.18, z - bar.d / 2),
        new THREE.Vector3(x + bar.w / 2, 0.18 + bar.h, z + bar.d / 2),
      ),
    };
  });
  const towers = block.skyline.map((t) => {
    const x = block.x + t.x;
    const z = block.z + t.z;
    return new THREE.Box3(
      new THREE.Vector3(x - t.w / 2, 0, z - t.d / 2),
      new THREE.Vector3(x + t.w / 2, t.h + 0.3, z + t.d / 2),
    );
  });
  return { bars, towers };
}

const layout = getDirLayout(city, []);
const cam = cameraFor(layout, PRESENT_AZIMUTH);
const plots = layout.blocks.filter((b) => (b.strip ?? []).length > 0);

describe("the group strip stands where the reader is put", () => {
  it("lays out a city that actually carries strips", () => {
    expect(plots.length).toBeGreaterThanOrEqual(2);
    for (const b of plots) expect(b.strip!.length).toBeGreaterThan(2);
  });

  it("leaves every bar's silhouette clear from the presentation vantage", () => {
    for (const block of plots) {
      const { bars, towers } = plotBoxes(block, +1);
      for (const bar of bars) {
        expect(clearOf(bar.box, towers, cam)).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it("loses more than half the same silhouette on the far kerb it came from", () => {
    let here = 0;
    let there = 0;
    let n = 0;
    for (const block of plots) {
      const { bars, towers } = plotBoxes(block, +1);
      const far = plotBoxes(block, -1);
      for (let i = 0; i < bars.length; i++) {
        here += clearOf(bars[i]!.box, towers, cam);
        there += clearOf(far.bars[i]!.box, far.towers, cam);
        n++;
      }
    }
    expect(there / n).toBeLessThan(0.9);
    expect(here / n - there / n).toBeGreaterThan(0.5);
  });

  it("keeps the row reading left (riskiest) to right from that camera", () => {
    const sx = new THREE.Vector3();
    for (const block of plots) {
      const { bars } = plotBoxes(block, +1);
      const xs = bars.map((bar) => sx.copy(bar.box.getCenter(new THREE.Vector3())).project(cam).x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it("keeps the podium stone off the kerb the row took", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/District.tsx"),
      "utf8",
    );
    expect(source).toMatch(/position=\{\[w \/ 2 - 1\.4, 0, -d \/ 2 \+ 1\.4\]\}/);
    // and the row itself resolves to the +z kerb, the side the camera stands on
    expect(stripRowZ(20, 0.7)).toBeGreaterThan(0);
    expect(Math.sign(cam.position.z - layout.centre.z)).toBe(Math.sign(stripRowZ(20, 0.7)));
  });
});
