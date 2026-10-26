import * as THREE from "three";
import type { CameraPose } from "../urlState";
import type { DirLayout } from "./layout";
import type { WorldSurface } from "./worldSurface";
import {
  HERO_FRAMING,
  OVERVIEW_FRAMING,
  WORLD_AZIMUTH,
  WORLD_FOV_DEG,
  fitWorldPoints,
  overviewWorldPoints,
  type WorldFraming,
  type WorldFit,
} from "./worldFraming";

/**
 * MASTER-2027 §06.01 — named views of a level.
 *
 * The address already carries a camera (`?cam=x,y,z,yaw,pitch`), so a view is
 * reproducible the moment someone has written down five numbers. What was
 * missing is the name: a view that can be asked for, shared, and photographed
 * twice with the same result.
 *
 * This module computes names. It does not fit anything itself — `worldFraming.ts`
 * is the one place that turns a layout into a frame (the overview flight and the
 * share hero both read it), and a second copy of that arithmetic is exactly the
 * drift the brief's "no second architecture" rule is about. Every preset here is
 * a choice of azimuth and framing handed to that function.
 */

export const ANSICHTEN = ["übersicht", "hero", "straße"] as const;
export type Ansicht = (typeof ANSICHTEN)[number];

/** The heading the level is drawn from: south-east, the overview flight's own.
 * An alias of `worldFraming.WORLD_AZIMUTH` — the number is written down once. */
export const STANDARD_AZIMUTH = WORLD_AZIMUTH;

/**
 * The two establishing poses CityScene mounts, in one named place each. The
 * values are the ones the component set as bare literals before; nothing here
 * re-frames the shot — it only gives the shot its one address.
 */
/** A new build starts close and low, at a human eye-line on the construction:
 * the offset is measured from the level's centre, the target sits `targetY`
 * above the ground. The zoom-out to the presentation distance IS the reveal. */
export const BAUBEGINN_POSE = { dx: 14, y: 6, dz: 18, targetY: 2.5 } as const;
/** The empty world's establishing shot — absolute, since its street grid is
 * centred on the origin. Low enough that the Ephe's read as figures. */
export const LEERWELT_POSE = { position: [17, 10, 34], target: [0, 1, 0] } as const;

/**
 * A street-level frame. `worldFraming` keeps its elevation in radians above the
 * horizon; 0,12 rad is ~7°, low enough that a tower shows a facade instead of a
 * roof, and the padding is the hero's — literally the same object, because a
 * restatement of those numbers is exactly the drift this module exists to avoid.
 */
const STREET_FRAMING: WorldFraming = {
  elevation: 0.12,
  padding: HERO_FRAMING.padding,
  verticalOffset: 0,
};

const FRAMINGS: Record<Ansicht, WorldFraming> = {
  // The two views the app already computes elsewhere are imported, not
  // restated: `übersicht` is the overview flight's framing, `hero` the share
  // recording's. A preset that re-typed those numbers would drift the first
  // time one of them moved.
  übersicht: OVERVIEW_FRAMING,
  hero: HERO_FRAMING,
  straße: STREET_FRAMING,
};

/** Is the name one this build can frame? An unknown name is dropped, not guessed. */
export function isAnsicht(value: unknown): value is Ansicht {
  return typeof value === "string" && (ANSICHTEN as readonly string[]).includes(value);
}

/** Yaw/pitch of a camera at `position` looking at `target`, in the rig's YXZ order. */
function lookAngles(
  position: THREE.Vector3,
  target: THREE.Vector3,
): { yaw: number; pitch: number } {
  const m = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0));
  const e = new THREE.Euler().setFromRotationMatrix(m, "YXZ");
  return { yaw: e.y, pitch: e.x };
}

/**
 * The frame a name asks for — the same object the overview flight gets from
 * `fitWorldOverview`, so a caller can use `target` and `position` exactly as it
 * does today.
 */
export function fitAnsicht(
  name: Ansicht,
  layout: DirLayout,
  surface: WorldSurface,
  aspect: number,
  azimuth = STANDARD_AZIMUTH,
  fov = WORLD_FOV_DEG,
): WorldFit {
  return fitWorldPoints(overviewWorldPoints(layout, surface), aspect, azimuth, fov, FRAMINGS[name]);
}

/**
 * Where the camera has to stand to frame this level under `name`.
 *
 * Pure and finite by construction: the fit is the same one the overview flight
 * uses, so a preset cannot land inside a building or below the ground — it lands
 * where the app already knows how to land.
 */
export function presetPose(
  name: Ansicht,
  layout: DirLayout,
  surface: WorldSurface,
  aspect: number,
): CameraPose {
  const fit = fitAnsicht(name, layout, surface, aspect);
  const { x, y, z } = fit.position;
  return { x, y, z, ...lookAngles(fit.position, fit.target) };
}

/** The field of view a preset was computed against — a camera needs both. */
export const PRESET_FOV_DEG = WORLD_FOV_DEG;

/** One tower's body, in the shape the framing maths already knows. */
export interface Hindernis {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Top of the body, in world units above the ground. */
  top: number;
}

/** Does the ray `von` + t·`richtung` (t ∈ [0,1]) pass through this box? */
function strahlTrifft(
  von: THREE.Vector3,
  nach: THREE.Vector3,
  b: Hindernis,
  spielraum: number,
): boolean {
  const min = { x: b.x - b.w / 2 - spielraum, y: 0, z: b.z - b.d / 2 - spielraum };
  const max = { x: b.x + b.w / 2 + spielraum, y: b.top, z: b.z + b.d / 2 + spielraum };
  let t0 = 0;
  let t1 = 1;
  for (const achse of ["x", "y", "z"] as const) {
    const richtung = nach[achse] - von[achse];
    if (Math.abs(richtung) < 1e-9) {
      if (von[achse] < min[achse] || von[achse] > max[achse]) return false;
      continue;
    }
    let ein = (min[achse] - von[achse]) / richtung;
    let aus = (max[achse] - von[achse]) / richtung;
    if (ein > aus) [ein, aus] = [aus, ein];
    t0 = Math.max(t0, ein);
    t1 = Math.min(t1, aus);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Z-01 (§07.11) — the azimuth a camera has to stand at to see a point on the
 * street, unobstructed.
 *
 * Why this exists and the plan-view version does not: the first attempt at this
 * question asked whether the line from camera to kerb crossed a neighbouring
 * footprint *in plan*. That model is wrong for this camera, which looks down at
 * 0,68 rad — a tower one plot north of the target does not hide it, the ray
 * passes over the neighbour's shoulder. What does hide it is the neighbour's
 * *body*, between the lens and the point, and that is a three-dimensional
 * question. So the test is a ray against each tower's box, with its real height.
 *
 * Candidates are the eight compass azimuths nearest the current one first, so a
 * camera that already sees the point is never moved for the sake of moving. When
 * every direction is walled in, the current azimuth is returned: a guide behind
 * a wall is still a guide, and a camera that swings to a random clear direction
 * because a tower is dense is a camera the reader did not ask for.
 */
export function blickwinkelFür(
  punkt: { x: number; y: number; z: number },
  entfernung: number,
  elevation: number,
  hindernisse: readonly Hindernis[],
  von = STANDARD_AZIMUTH,
  spielraum = 0.4,
): number {
  const ziel = new THREE.Vector3(punkt.x, punkt.y, punkt.z);
  const ordnung = [0, 1, -1, 2, -2, 3, 3.5, 4].map((schritt) => von + (schritt * Math.PI) / 4);
  for (const azimut of ordnung) {
    const kamera = new THREE.Vector3(
      ziel.x + Math.cos(azimut) * Math.cos(elevation) * entfernung,
      ziel.y + Math.sin(elevation) * entfernung,
      ziel.z + Math.sin(azimut) * Math.cos(elevation) * entfernung,
    );
    if (!hindernisse.some((b) => strahlTrifft(kamera, ziel, b, spielraum))) return azimut;
  }
  return von;
}
