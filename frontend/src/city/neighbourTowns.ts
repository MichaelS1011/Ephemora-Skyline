/**
 * The towns next door — the other folders this browser has scanned.
 *
 * A reader who works in several projects has no way to see one against
 * another: the city shows one folder at a time, and the picker that lists the
 * rest is a menu, not a picture. So the open land outside the belt carries a
 * hamlet per other city — its districts as towers, drawn on the SAME height
 * rail and in the SAME colour law as a building in the reader's own city. The
 * claim is deliberately small: where is my mass. Not which project is worse.
 *
 * Two rules shape this file and both are load-bearing:
 *
 *  - **Nothing is named.** The exported picture is a pixel copy of the live
 *    WebGL canvas (`share/image.ts` → `share/capture.ts`), and the anonymity
 *    argument holds only because project names enter a frame through
 *    `frameTexts()` behind the `showNames` switch. Text painted into the scene
 *    would walk around that gate, so a neighbour town is geometry only.
 *  - **One rail, one colour.** Height comes from `heightForComplexity` and ink
 *    from `complexityColor`, both fed by the same 0..1
 *    `syntheticComplexity` — the pair every building in the city already uses.
 *    A second scale here would make the comparison false by construction. The
 *    ink is then stepped toward the horizon haze (`NEIGHBOUR_RECEDE`), which
 *    recedes a neighbour WITHOUT touching its height.
 *
 * A town exists exactly while its scan does. The backend keeps twenty cities
 * for twenty-four hours in memory (`analysis-store.ts`), so a neighbour whose
 * id no longer answers simply has no towers — never a half-drawn village.
 */
import * as THREE from "three";
import { complexityColor, ENV } from "./palette";
import { heightForComplexity, syntheticComplexity } from "./mapping";
import { STANDARD_AZIMUTH } from "./cameraPresets";
import type { CityData, CityDir } from "./types";
import type { RecentCity } from "../recentCities";

/** Five hamlets is a neighbourhood; nineteen is a stamp. */
export const NEIGHBOUR_MAX = 5;

/** A town of more towers than this reads as a skyline, not as a second city. */
export const TOWERS_PER_TOWN = 6;

/**
 * Where the ring stands, as a multiple of the level's own half-extent.
 *
 * The ground's ramp (`render/ground.ts:GROUND_RAMP`) leaves the cell field's
 * extent untouched up to 1, shades the city's surroundings to a peak at 1,2 and
 * ends that shading at 2,25, before the haze takes over from 1,5. The ring sits
 * past the shading's end and inside the haze's climb, because of what the frame
 * measured: at 1,35 the tallest neighbour stood **220 px** in the arrival frame
 * against the reader's own tallest district at ~180 px — a context that
 * out-shouts the subject. Distance is the honest lever there: it shrinks the
 * neighbour WITHOUT touching the height rail, so a knottier project still
 * stands taller than yours, only smaller in the picture.
 */
export const NEIGHBOUR_RING_FACTOR = 1.7;

/** How far apart the hamlets sit on that ring. */
export const NEIGHBOUR_SPREAD_RAD = (Math.PI * 2) / NEIGHBOUR_MAX;

/** How wide one hamlet is, in world units, around its own bearing. */
export const NEIGHBOUR_HAMLET_SPAN = 9;

/**
 * How far a neighbour's ink is pulled toward the horizon haze.
 *
 * A neighbour is context, not the subject: the reader's own city is what they
 * came to read. Receding the colour — never the height — lets a genuinely
 * knottier project still stand taller than yours while keeping the eye on the
 * city in the middle. The mixing happens against `ENV.fog`, the value the far
 * ground already dissolves into, so the towns sit IN the distance rather than
 * in front of it.
 */
export const NEIGHBOUR_RECEDE = 0.45;

/** How wide a neighbour's own tower stands, in world units. */
export const TOWER_FOOT = 3.2;

/** How wide a neighbour's own paved pad is, in world units. */
export const TOWER_FOOT_PAD = 5.4;

/**
 * The bearing the hamlets are allowed to stand on: the side of the city that
 * faces AWAY from the arrival camera, read from the one azimuth the rig uses.
 * The near sector is where the dock sits, and a hamlet drawn there is a hamlet
 * the reader cannot see.
 */
export const FAR_BEARING = Math.atan2(-Math.cos(STANDARD_AZIMUTH), -Math.sin(STANDARD_AZIMUTH));

/** The arc the hamlets are spread over, centred on `FAR_BEARING`. */
export const NEIGHBOUR_ARC = (110 * Math.PI) / 180;

export interface NeighbourTower {
  /** The one number the tower is drawn from: 0..1 synthetic complexity. */
  t: number;
  /** World units, from the city's own rail. */
  height: number;
  /** Hex from `complexityColor` — the same ink a building of that t wears. */
  ink: string;
}

export interface NeighbourAnchor {
  x: number;
  z: number;
}

/**
 * Which other cities to ask for. The current one is never a neighbour, and the
 * browser's own order (newest first, `recentCities.ts`) is kept so the towns
 * the reader worked on last are the ones standing closest.
 */
export function selectNeighbourIds(
  entries: readonly RecentCity[],
  currentId: string | null,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of entries) {
    if (currentId !== null && entry.id === currentId) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ids.push(entry.id);
    if (ids.length === NEIGHBOUR_MAX) break;
  }
  return ids;
}

/** The tallest of a district's own skyline files, as the rail sees it. */
function crownComplexity(dir: CityDir): number {
  let best = 0;
  for (const file of dir.districtFiles) best = Math.max(best, syntheticComplexity(file));
  return best;
}

const _ink = new THREE.Color();
const _haze = new THREE.Color(ENV.fog);

/** The city's own complexity ink, stepped `NEIGHBOUR_RECEDE` toward the haze. */
export function recededInk(t: number, colorblind: boolean): string {
  return `#${_ink.set(complexityColor(t, colorblind)).lerp(_haze, NEIGHBOUR_RECEDE).getHexString()}`;
}

/**
 * The towers of one neighbour town: its top districts by lines of code, each
 * drawn at the height of its own crown file. A city whose tree carries no
 * districts yields nothing, and the caller draws no hamlet at all.
 */
export function townTowers(city: CityData, colorblind: boolean): NeighbourTower[] {
  const districts = city.tree?.children ?? [];
  return districts
    .slice()
    .sort((a, b) => b.linesOfCode - a.linesOfCode)
    .slice(0, TOWERS_PER_TOWN)
    .map((dir) => {
      const t = crownComplexity(dir);
      return { t, height: heightForComplexity(t), ink: recededInk(t, colorblind) };
    })
    .filter((tower) => tower.t > 0);
}

/**
 * Where hamlet `index` of `count` stands around the reader's city: on the far
 * arc, so the dock never stands in front of a neighbour. Deterministic by
 * construction — a bearing derived from the index, so two runs of the same
 * payload draw the same picture and a frame can be compared against itself.
 */
export function townAnchors(index: number, bounds: number, count = NEIGHBOUR_MAX): NeighbourAnchor {
  const radius = Math.max(bounds, 1) * NEIGHBOUR_RING_FACTOR;
  const step = count > 1 ? NEIGHBOUR_ARC / (count - 1) : 0;
  const bearing = FAR_BEARING - NEIGHBOUR_ARC / 2 + index * step;
  return { x: Math.sin(bearing) * radius, z: Math.cos(bearing) * radius };
}

/**
 * The towers inside one hamlet, in world offsets from its anchor: a row along
 * the ring, spaced so a five-tower town spans `NEIGHBOUR_HAMLET_SPAN`.
 */
export function hamletOffsets(count: number): NeighbourAnchor[] {
  const step = NEIGHBOUR_HAMLET_SPAN / Math.max(1, count);
  return Array.from({ length: count }, (_unused, i) => ({
    x: (i - (count - 1) / 2) * step,
    z: i % 2 === 0 ? 0 : step * 0.45,
  }));
}
