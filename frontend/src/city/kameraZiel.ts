import type { CityData } from "./types";
import { getDirLayout, tourStops, findFileById } from "./layout";
import {
  HERO_FRAMING,
  WORLD_AZIMUTH,
  WORLD_FOV_DEG,
  dataPlots,
  fitWorldOverview,
  fitWorldPoints,
  plotWorldPoints,
} from "./worldFraming";
import { surfaceForLayout } from "./worldSurface";

/**
 * MASTER-2027 §19.04 — a camera position as a NAMED INPUT.
 *
 * An image proof has been a hand-flown pose: five numbers someone steered by
 * hand, accepted as "the same frame" at |Δ| = 0.000000 by the last presence
 * round. The arithmetic to put a camera somewhere exists once, in
 * `worldFraming.ts`; what did not exist is an address: a function that, from
 * a named target, returns the position, the look-at point and the distance
 * WITHOUT flying. One source; the test is one consumer, and every flight
 * that should be reproducible is the other.
 *
 * It adds no measure. A level target (übersicht, bezirk) is the very fit the
 * overview flight assigns to the tween's end (`CameraRig.tsx:702-707`, and
 * `easeInOutCubic(1) = 1` arrives at it exactly — no damping sits between the
 * number and the camera: in FREE mode OrbitControls is disabled and the tween
 * writes the pose directly). A file target is the shipped `HERO_FRAMING`
 * applied to that file's own body through the shared plot arithmetic — a
 * building framed like the share hero frames a city, not a new distance guess.
 *
 * THE FINDING, so this file is not read as the whole truth: the file FLIGHT
 * does not yet take this number. `useStore.ts:1200/1243` builds its shot from
 * a module-private `buildingShot` (unexported — a name cannot read it without
 * becoming the second copy this repo forbids), and the rig's approach for a
 * shot without an explicit pose KEEPS THE LIVE AZIMUTH (`CameraRig.tsx:672-690`),
 * so the arrival depends on where the camera came from. The rig's own
 * explicit-pose branch (`CameraRig.tsx:618-657`) is the consumer waiting for
 * these numbers: it flies a position and a target exactly as given, reduced
 * motion or not. Wiring `navigateToFile` to that branch is a useStore change
 * and was reported, not performed, in this round.
 */

export type Ziel =
  | { art: "übersicht" }
  | { art: "bezirk"; pfad: string[] }
  | { art: "datei"; id: string }
  | { art: "tour"; schritt: number };

/** The pose a name stands for: where to stand, what to look at, how far. */
export interface ZielPose {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  entfernung: number;
  /** The field of view this pose was framed against — a camera needs both. */
  fov: number;
}

/**
 * The pose for a named target, or null when the city does not hold that
 * target. Null, never nearest: an approximation of a district that is not
 * there is the hand-flown pose under the name of a rule.
 */
export function zielPose(city: CityData, ziel: Ziel, aspect: number): ZielPose | null {
  switch (ziel.art) {
    case "übersicht":
      return ebenePose(city, [], aspect);
    case "bezirk": {
      if (!pfadVorhanden(city, ziel.pfad)) return null;
      return ebenePose(city, ziel.pfad, aspect);
    }
    case "datei": {
      const hit = findFileById(city, ziel.id);
      if (!hit) return null;
      const layout = getDirLayout(city, hit.chain);
      const surface = surfaceForLayout(layout, hit.chain.length > 0);
      // The file's own plot, read through the ONE plot arithmetic (`dataPlots`
      // lists buildings in `layout.buildings` order, foundation and margin
      // included) at the shipped hero framing and azimuth. Nothing is retyped.
      const index = layout.buildings.findIndex((b) => b.file.id === ziel.id);
      if (index < 0) return null;
      const plot = dataPlots(layout)[index];
      if (!plot) return null;
      const fit = fitWorldPoints(
        plotWorldPoints([plot], surface),
        aspect,
        WORLD_AZIMUTH,
        WORLD_FOV_DEG,
        HERO_FRAMING,
      );
      return poseAusFit(fit);
    }
    case "tour": {
      const stops = tourStops(city);
      if (!Number.isInteger(ziel.schritt) || ziel.schritt < 0 || ziel.schritt >= stops.length)
        return null;
      return zielPose(city, { art: "datei", id: stops[ziel.schritt]!.file.id }, aspect);
    }
  }
}

/** Does every segment of this path name a directory the tree actually has?
 * (`resolveDir` answers leniently — it stops at the last match; a NAMED
 * target must not inherit that leniency.) */
function pfadVorhanden(city: CityData, pfad: string[]): boolean {
  let node = city.tree;
  for (const seg of pfad) {
    const next = node.children.find((c) => c.name === seg);
    if (!next) return false;
    node = next;
  }
  return true;
}

/** A level's pose: the same fit object the overview flight puts on screen. */
function ebenePose(city: CityData, pfad: string[], aspect: number): ZielPose {
  const layout = getDirLayout(city, pfad);
  const surface = surfaceForLayout(layout, pfad.length > 0);
  const fit = fitWorldOverview(layout, surface, aspect);
  return poseAusFit(fit);
}

function poseAusFit(fit: {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  distance: number;
}): ZielPose {
  return {
    position: { x: fit.position.x, y: fit.position.y, z: fit.position.z },
    target: { x: fit.target.x, y: fit.target.y, z: fit.target.z },
    entfernung: fit.distance,
    fov: WORLD_FOV_DEG,
  };
}

/** Re-exported so a consumer cannot drift the azimuth the name implies. */
export const ZIEL_AZIMUTH = WORLD_AZIMUTH;
export const ZIEL_FOV_DEG = WORLD_FOV_DEG;
