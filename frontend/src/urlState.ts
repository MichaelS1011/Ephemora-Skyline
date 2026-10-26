import type { CityData, CityFile } from "./city/types";
import { allFiles, findFileById } from "./city/layout";

/**
 * The visit in the address.
 *
 * A city lives in the backend's RAM; what a visit IS — the district drilled
 * into, the file selected, where the camera stands — was rewritten by every
 * reload. Those three are the visit, so they live in the URL: reloadable,
 * shareable, no backend restart and no server-side session.
 *
 * The honesty rule of the product applies to the address too: every value
 * written here is something the app measured (a directory chain from the
 * payload, a file path from the payload, a live camera pose). Nothing is
 * invented, and a parameter that the arriving payload cannot resolve is
 * dropped rather than guessed at.
 */

/** The camera as the pilot left it: where it stands and where it looks. */
export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Yaw around Y — the heading the free-fly controller keeps. */
  yaw: number;
  /** Pitch around X — negative looks down. */
  pitch: number;
}

export interface VisitState {
  /** The `city=<analysis id>` the address named. */
  cityId: string | null;
  district: string[];
  /** The file PATH, not the scan's id: a path reads in a shared link. */
  filePath: string | null;
  pose: CameraPose | null;
  /**
   * §06.01 — a named view (`übersicht`, `hero`, `straße`). Read as a string and
   * checked by `cameraPresets.isAnsicht`, because the preset module owns what a
   * name means; the address only carries it.
   */
  ansicht: string | null;
}

const CITY = "city";
const DISTRICT = "district";
const FILE = "file";
const POSE = "cam";
const ANSICHT = "ansicht";

/** 3 decimals ≈ 1 mm in world units, and it keeps the address short. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodePose(p: CameraPose): string {
  return [p.x, p.y, p.z, p.yaw, p.pitch].map(r3).join(",");
}

export function decodePose(value: string | null): CameraPose | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 5) return null;
  const [x, y, z, yaw, pitch] = parts;
  if ([x, y, z, yaw, pitch].some((n) => !Number.isFinite(n))) return null;
  return { x: x!, y: y!, z: z!, yaw: yaw!, pitch: pitch! };
}

/** Parse an address into a visit. Pure: takes the search string, says what it names. */
export function readVisitState(search: string): VisitState {
  const q = new URLSearchParams(search);
  const district = q.get(DISTRICT);
  return {
    cityId: q.get(CITY),
    district: district ? district.split("/").filter(Boolean) : [],
    filePath: q.get(FILE),
    pose: decodePose(q.get(POSE)),
    ansicht: q.get(ANSICHT),
  };
}

export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

/** The visit the address names right now. */
export function currentVisit(): VisitState {
  return readVisitState(currentSearch());
}

function patch(params: Record<string, string | null>, push: boolean): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === now) return;
  if (push) window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

/**
 * Name the city on screen.
 *
 * The nav parameters belong to one city, so they are cleared when the address
 * moves on to a different one. When the id is UNCHANGED — a reload, the same
 * permalink re-resolved — they stay: that is the visit the user is coming back
 * to, and it is what the address is for.
 */
export function writeCityParam(analysisId: string | null): void {
  if (typeof window === "undefined") return;
  const sameCity = new URLSearchParams(window.location.search).get(CITY) === analysisId;
  patch(
    sameCity
      ? { [CITY]: analysisId }
      : { [CITY]: analysisId, [DISTRICT]: null, [FILE]: null, [POSE]: null },
    false,
  );
}

/**
 * Write district + selected file.
 *
 * `push` is used only where the point is that the address the user was working
 * in survives as a history entry to come back from. Everything else replaces in
 * place: a pilot flying across the city would otherwise leave one history entry
 * per district behind.
 */
export function writeNavParams(district: string[], filePath: string | null, push = false): void {
  patch({ [DISTRICT]: district.join("/") || null, [FILE]: filePath }, push);
}

/** The camera pose alone — written when the pilot stops, not on every frame. */
export function writePoseParam(pose: CameraPose | null): void {
  patch({ [POSE]: pose ? encodePose(pose) : null }, false);
}

/** Clear the whole visit from the address. */
export function clearVisitParams(push: boolean): void {
  patch({ [CITY]: null, [DISTRICT]: null, [FILE]: null, [POSE]: null }, push);
}

/**
 * The file the address names, in the payload that just arrived.
 *
 * A shared link opened against a re-scan, or a district renamed since the link
 * was written, resolves to nothing here — and then it is dropped. Saying
 * "the city is at its root" is the truth; pretending to select a file the scan
 * does not carry would be a lie about the visit.
 */
export function resolveVisit(
  city: CityData,
  visit: VisitState,
): { chain: string[]; file: CityFile | null } {
  if (!city?.tree) return { chain: [], file: null };
  const byPath = visit.filePath
    ? (allFiles(city).find((hit) => hit.file.path === visit.filePath)?.file ?? null)
    : null;
  if (byPath) {
    const chain = findFileById(city, byPath.id)?.chain ?? [];
    return { chain, file: byPath };
  }
  const chain = visit.district;
  return { chain: districtExists(city, chain) ? chain : [], file: null };
}

/** Does this directory chain exist in the payload, root down? */
export function districtExists(city: CityData, chain: string[]): boolean {
  let node = city.tree;
  for (const name of chain) {
    const next = node?.children?.find((c) => c.name === name);
    if (!next) return false;
    node = next;
  }
  return true;
}

/** The path a selected file id answers to — what belongs in the address. */
export function pathOfSelectedFile(city: CityData, fileId: string | null): string | null {
  if (!fileId || !city?.tree) return null;
  return findFileById(city, fileId)?.file.path ?? null;
}
