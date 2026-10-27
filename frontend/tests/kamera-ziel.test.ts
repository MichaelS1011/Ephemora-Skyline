import { describe, expect, it } from "vitest";
import { cityClampRadius, clampToCity, PIVOT_Y } from "../src/components/CameraRig";
import {
  HERO_FRAMING,
  WORLD_AZIMUTH,
  WORLD_FOV_DEG,
  dataPlots,
  fitWorldOverview,
  fitWorldPoints,
  plotWorldPoints,
} from "../src/city/worldFraming";
import { findFileById, getDirLayout, tourStops } from "../src/city/layout";
import { surfaceForLayout } from "../src/city/worldSurface";
import { presetPose } from "../src/city/cameraPresets";
import { zielPose, type Ziel } from "../src/city/kameraZiel";
import { city, dir, file, finding } from "./helpers/cityFixture";

/**
 * MASTER-2027 §19.04 — a camera position that is a NAMED INPUT.
 *
 * Every image proof so far is a hand-flown pose, and two lanes lose a run
 * trying to land the same frame twice. What was missing is not the arithmetic
 * — `worldFraming.ts` is the one place that fits a city, and the rig flies
 * its numbers for overview flights (`CameraRig.tsx:702-707` assigns the fit
 * directly to the tween's end) — it is a single addressable function from
 * NAME to pose. These cases hold the four promises the name must keep:
 *
 *   • the same input gives bit-identical numbers, twice and in any order;
 *   • a level name returns the very object the overview flight gets
 *     (not close to — `Object.is` on every component);
 *   • every named pose stands inside the city's own collar and above its
 *     street floor, so `clampToCity` is the identity on it;
 *   • a name the city does not hold answers null — no nearest neighbour,
 *     no approximation.
 *
 * The file pose is deliberately derived through `dataPlots` + `fitWorldPoints`
 * with the shipped `HERO_FRAMING`: it must add no measure of its own. Where
 * today's file FLIGHT disagrees (live-azimuth approach, unexported local
 * shot) is the reported finding — see `kameraZiel.ts`'s doc.
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
          file("src/b.ts", "TypeScript", [finding({ severity: "P1", message: "Injection" })]),
        ],
      }),
      dir({ path: "docs", detailFiles: [file("docs/c.md", "Markdown", [])] }),
    ],
    detailFiles: [file("root.ts", "TypeScript", [finding({ severity: "P2", message: "Loose" })])],
  }),
});
const aspect = 16 / 9;

const ALLE_ZIELE: Ziel[] = [
  { art: "übersicht" },
  { art: "bezirk", pfad: ["src"] },
  { art: "datei", id: tourStops(stadt)[0]!.file.id },
  { art: "tour", schritt: 0 },
];

/** Field-by-field `Object.is` — the identity two lanes refused to accept at 1e-6. */
function bitgleich(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): boolean {
  return Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);
}

describe("die benannte Pose (§19.04)", () => {
  it("zweimal dieselbe Eingabe, bitgleich dieselbe Pose", () => {
    for (const ziel of ALLE_ZIELE) {
      const a = zielPose(stadt, ziel, aspect);
      const b = zielPose(stadt, ziel, aspect);
      expect(a, JSON.stringify(ziel)).not.toBeNull();
      expect(bitgleich(a!.position, b!.position), `position ${ziel.art}`).toBe(true);
      expect(bitgleich(a!.target, b!.target), `target ${ziel.art}`).toBe(true);
      expect(Object.is(a!.entfernung, b!.entfernung), `entfernung ${ziel.art}`).toBe(true);
    }
  });

  it("die Übersicht ist exakt der Fit, den der Overview-Flug anfliegt", () => {
    // The rig's overview branch (CameraRig.tsx:702-707) assigns
    // `fitWorldOverview(frame.layout, frame.surface, seitenverhältnis, azimuth, sicht)`
    // to the tween's end; the tween arrives at that end exactly
    // (easeInOutCubic(1) = 1). Same call, same numbers — bit for bit.
    const layout = getDirLayout(stadt, []);
    const surface = surfaceForLayout(layout, false);
    const gefügt = fitWorldOverview(layout, surface, aspect);
    const pose = zielPose(stadt, { art: "übersicht" }, aspect)!;
    expect(
      bitgleich(pose.position, {
        x: gefügt.position.x,
        y: gefügt.position.y,
        z: gefügt.position.z,
      }),
    ).toBe(true);
    expect(
      bitgleich(pose.target, { x: gefügt.target.x, y: gefügt.target.y, z: gefügt.target.z }),
    ).toBe(true);
    expect(Object.is(pose.entfernung, gefügt.distance)).toBe(true);
    // and the already-guarded preset name stays the same number (§06.01)
    const preset = presetPose("übersicht", layout, surface, aspect);
    expect(Object.is(pose.position.x, preset.x)).toBe(true);
    expect(Object.is(pose.position.y, preset.y)).toBe(true);
    expect(Object.is(pose.position.z, preset.z)).toBe(true);
  });

  it("der Bezirk ist der Level-Fit genau dieses Bezirks", () => {
    const pose = zielPose(stadt, { art: "bezirk", pfad: ["src"] }, aspect)!;
    const layout = getDirLayout(stadt, ["src"]);
    const surface = surfaceForLayout(layout, true); // useCityFrame: focusPath.length > 0
    const gefügt = fitWorldOverview(layout, surface, aspect);
    expect(
      bitgleich(pose.position, {
        x: gefügt.position.x,
        y: gefügt.position.y,
        z: gefügt.position.z,
      }),
    ).toBe(true);
    expect(Object.is(pose.entfernung, gefügt.distance)).toBe(true);
    // The whole level's frame must stand somewhere else than one district's.
    const übersicht = zielPose(stadt, { art: "übersicht" }, aspect)!;
    expect(bitgleich(pose.position, übersicht.position)).toBe(false);
  });

  it("die Datei hat kein eigenes Maß — sie ist der Hero-Fit ihres Grundrisses", () => {
    const id = tourStops(stadt)[0]!.file.id;
    const pose = zielPose(stadt, { art: "datei", id }, aspect)!;
    const hit = tourStops(stadt)[0]!;
    const layout = getDirLayout(stadt, hit.chain);
    const surface = surfaceForLayout(layout, hit.chain.length > 0);
    const placement = layout.buildings.find((b) => b.file.id === id)!;
    expect(placement, `die Tour-Stop-Datei ${id} steht als Körper`).toBeDefined();
    const plots = plotWorldPoints(
      // The file's own body, as the city's one plot arithmetic writes it.
      dataPlots(layout).filter(
        (p) =>
          p.x === placement.x && p.z === placement.z && p.w === placement.w && p.d === placement.d,
      ),
      surface,
    );
    const gefügt = fitWorldPoints(plots, aspect, WORLD_AZIMUTH, WORLD_FOV_DEG, HERO_FRAMING);
    expect(
      bitgleich(pose.position, {
        x: gefügt.position.x,
        y: gefügt.position.y,
        z: gefügt.position.z,
      }),
    ).toBe(true);
    expect(
      bitgleich(pose.target, { x: gefügt.target.x, y: gefügt.target.y, z: gefügt.target.z }),
    ).toBe(true);
    expect(Object.is(pose.entfernung, gefügt.distance)).toBe(true);
  });

  it("der Tour-Schritt steht an der Pose seines Stop-Datei", () => {
    const stop = tourStops(stadt)[1]!;
    const tourPose = zielPose(stadt, { art: "tour", schritt: 1 }, aspect)!;
    const dateiPose = zielPose(stadt, { art: "datei", id: stop.file.id }, aspect)!;
    expect(bitgleich(tourPose.position, dateiPose.position)).toBe(true);
    expect(bitgleich(tourPose.target, dateiPose.target)).toBe(true);
    expect(Object.is(tourPose.entfernung, dateiPose.entfernung)).toBe(true);
  });

  /** The level the pilot of this target stands in — same resolution the
   *  rig's `useCityFrame` and the store's flights perform. */
  const bezugKette = (ziel: Ziel): string[] => {
    if (ziel.art === "bezirk") return ziel.pfad;
    if (ziel.art === "übersicht") return [];
    const id = ziel.art === "datei" ? ziel.id : tourStops(stadt)[Math.trunc(ziel.schritt)]!.file.id;
    return findFileById(stadt, id)!.chain;
  };

  it("jede benannte Pose liegt innerhalb der Stadt-Klemme — die Klemme ist die Identität auf ihr", () => {
    for (const ziel of ALLE_ZIELE) {
      const pose = zielPose(stadt, ziel, aspect)!;
      const kette = bezugKette(ziel);
      const layout = getDirLayout(stadt, kette);
      const surface = surfaceForLayout(layout, kette.length > 0);
      const r = Math.hypot(
        pose.position.x - layout.centre.x,
        pose.position.y - PIVOT_Y,
        pose.position.z - layout.centre.z,
      );
      expect(
        r,
        `${ziel.art} bei ${r} vor der Klemme ${cityClampRadius(layout.bounds)}`,
      ).toBeLessThanOrEqual(cityClampRadius(layout.bounds));
      // The stronger promise: the pilot's own guard never moves the pose —
      // collar AND street floor leave it where the name put it.
      const kept = clampToCity(pose.position, layout.bounds, layout.centre, surface);
      expect(bitgleich(pose.position, kept), `${ziel.art} braucht keine Klemme`).toBe(true);
    }
  });

  it("ein Ziel, das die Stadt nicht hergibt, liefert null — keinen Näherungswert", () => {
    expect(zielPose(stadt, { art: "bezirk", pfad: ["garten"] }, aspect)).toBeNull();
    expect(zielPose(stadt, { art: "bezirk", pfad: ["src", "tiefer"] }, aspect)).toBeNull();
    expect(zielPose(stadt, { art: "datei", id: "f-den-da-nicht-gibt" }, aspect)).toBeNull();
    expect(zielPose(stadt, { art: "tour", schritt: -1 }, aspect)).toBeNull();
    expect(zielPose(stadt, { art: "tour", schritt: tourStops(stadt).length }, aspect)).toBeNull();
    expect(zielPose(stadt, { art: "tour", schritt: 1.5 }, aspect)).toBeNull();
    // eine Stadt ohne Befund hat keinen ersten Tour-Schritt
    const stumpf = city({
      tree: dir({ path: "", name: "", detailFiles: [file("x.ts", "TypeScript", [])] }),
    });
    expect(zielPose(stumpf, { art: "tour", schritt: 0 }, aspect)).toBeNull();
  });

  it("jede Pose ist endlich — und steht über der Straße (die Klemme hebt sie nicht)", () => {
    for (const ziel of ALLE_ZIELE) {
      const pose = zielPose(stadt, ziel, aspect)!;
      const werte = [
        pose.position.x,
        pose.position.y,
        pose.position.z,
        pose.target.x,
        pose.target.y,
        pose.target.z,
        pose.entfernung,
        pose.fov,
      ];
      for (const wert of werte) expect(Number.isFinite(wert), ziel.art).toBe(true);
      const kette = bezugKette(ziel);
      const layout = getDirLayout(stadt, kette);
      const surface = surfaceForLayout(layout, kette.length > 0);
      // clampToCity's street floor leaves the pose alone: it already stands
      // on ground a pilot could be at.
      const kept = clampToCity(pose.position, layout.bounds, layout.centre, surface);
      expect(bitgleich(pose.position, kept), `${ziel.art} über der Straße`).toBe(true);
    }
  });
});
