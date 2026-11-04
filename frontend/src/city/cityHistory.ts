import type { RecentCity } from "../recentCities";
import type { CityData } from "./types";

/**
 * Scan history for the City Time Machine.
 *
 * The local index already says which cities this browser opened. This module
 * narrows it to the folder the reader is standing in and compares two payloads
 * by the numbers both actually carry. It never estimates an expired era.
 */

export interface CityEra extends RecentCity {
  isCurrent: boolean;
}

export interface CityDiff {
  files: number;
  lines: number;
  renderedFiles: number;
  P0: number;
  P1: number;
  P2: number;
}

/** Same folder only, current entry marked, duplicate ids removed, order kept. */
export function buildCityHistory(
  entries: readonly RecentCity[],
  currentId: string | null | undefined,
): CityEra[] {
  if (!currentId) return [];
  const current = entries.find((entry) => entry.id === currentId);
  if (!current) return [];
  const seen = new Set<string>();
  const out: CityEra[] = [];
  for (const entry of entries) {
    if (entry.folder !== current.folder || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({ ...entry, isCurrent: entry.id === currentId });
  }
  return out;
}

/** Current minus era. Positive means the current scan grew. */
export function diffCities(current: CityData, era: CityData): CityDiff {
  return {
    files: current.totalFiles - era.totalFiles,
    lines: current.totalLines - era.totalLines,
    renderedFiles: current.renderedFiles - era.renderedFiles,
    P0: current.findingsBySeverity.P0 - era.findingsBySeverity.P0,
    P1: current.findingsBySeverity.P1 - era.findingsBySeverity.P1,
    P2: current.findingsBySeverity.P2 - era.findingsBySeverity.P2,
  };
}

/** A signed number for the diff table; zero stays "0", never "+0". */
export function signed(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}
