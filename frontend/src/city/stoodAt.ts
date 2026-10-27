/**
 * The city at a date in its git history — the decision, kept out of the
 * renderer so the rule can be tested without a canvas.
 *
 * A scan carries one honest time fact per file: `firstCommitAt`, the earliest
 * commit that touched the path (rename chains followed by the churn pass).
 * The only question that answers itself from that is "did this file already
 * stand at date D?". Three traps make the answer a four-state decision:
 *
 *  - a file without a date in a dated payload is NOT "not yet" — the churn
 *    pass simply never named it (shallow history, merge-only path). Drawing
 *    it as absent would invent a nothing.
 *  - a payload with `meta.churn === false` never collected dates at all. The
 *    question cannot be asked, so no file may be drawn as standing or not.
 *  - deletions before the scan are not in this city: the scan reads the
 *    current tree, so a file that stood at D and was deleted before the scan
 *    has no tower to show. The census sentence names that limit; this module
 *    cannot fix it.
 */

import type { CityData, CityFile } from "./types";

/** The file's first commit is at or before D. */
export const STOOD = "stood";
/** The file's first commit is after D. */
export const NOT_YET = "not-yet";
/** The payload dates files in general, but not this one — says nothing about D. */
export const NO_HISTORY = "no-history";
/** The payload cannot answer the question at all (churn off, no date asked). */
export const UNKNOWN_PAYLOAD = "unknown-payload";

export type StoodState = typeof STOOD | typeof NOT_YET | typeof NO_HISTORY | typeof UNKNOWN_PAYLOAD;

/**
 * `meta.churn` as the payload shape delivers it (`CityData["meta"]`) or as the
 * slim object a test hands in; absent means a payload from before the flag —
 * the dates were not collected, so the question has no footing.
 */
export type ChurnMeta = Pick<CityData["meta"], "churn"> | undefined;

export function stoodAt(
  file: CityFile,
  dateMs: number | null | undefined,
  meta: ChurnMeta,
): StoodState {
  if (meta?.churn !== true) return UNKNOWN_PAYLOAD;
  if (dateMs == null || !Number.isFinite(dateMs)) return UNKNOWN_PAYLOAD;
  const first = file.firstCommitAt;
  if (first === undefined || !Number.isFinite(first)) return NO_HISTORY;
  return first <= dateMs ? STOOD : NOT_YET;
}

/** The census behind the slider's sentence: four counts over one file list. */
export interface TimeCensusResult {
  files: number;
  stood: number;
  notYet: number;
  noHistory: number;
  unknown: number;
}

export function timeCensus(
  files: readonly CityFile[],
  dateMs: number,
  meta: ChurnMeta,
): TimeCensusResult {
  const c: TimeCensusResult = {
    files: files.length,
    stood: 0,
    notYet: 0,
    noHistory: 0,
    unknown: 0,
  };
  for (const f of files) {
    const s = stoodAt(f, dateMs, meta);
    if (s === STOOD) c.stood++;
    else if (s === NOT_YET) c.notYet++;
    else if (s === NO_HISTORY) c.noHistory++;
    else c.unknown++;
  }
  return c;
}

/**
 * Walk the files the city actually draws: every district's detail files plus
 * the extras counted but not raised. One pass, no Set needed — the layout
 * gives each file its own slot.
 */
export function cityFiles(city: CityData | null): CityFile[] {
  if (!city) return [];
  const out: CityFile[] = [];
  const walk = (dir: CityData["tree"]): void => {
    out.push(...dir.detailFiles);
    dir.children.forEach(walk);
  };
  walk(city.tree);
  if (city.additionalFiles) out.push(...city.additionalFiles);
  return out;
}

/**
 * The slider's rails: oldest firstCommitAt .. the scan moment. Null when the
 * question cannot be ranged — no scan moment (old payloads do not carry
 * `createdAt`) or churn never ran. A null range disables the time channel;
 * it never guesses a rail from the clock.
 */
export function timeRange(city: CityData | null): { min: number; max: number } | null {
  if (!city || city.meta?.churn !== true) return null;
  const created = city.createdAt ? Date.parse(city.createdAt) : NaN;
  if (!Number.isFinite(created)) return null;
  let min = Infinity;
  for (const f of cityFiles(city)) {
    if (
      f.firstCommitAt !== undefined &&
      Number.isFinite(f.firstCommitAt) &&
      f.firstCommitAt < min
    ) {
      min = f.firstCommitAt;
    }
  }
  if (!Number.isFinite(min) || min > created) return null;
  return { min, max: created };
}
