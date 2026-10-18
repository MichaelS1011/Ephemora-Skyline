import type { Severity } from "./types";

/**
 * The one answer to "how many findings".
 *
 * Three surfaces asked this question their own way: the header summed over the
 * record's own keys, the dock and the scan banner added `P0 + P1 + P2` by hand.
 * Those agree while `Severity` has exactly three members and part company the
 * day a fourth joins it — the header would grow, the dock would not, and the
 * city would state two totals about one scan. The minimap bug this week was the
 * same shape: one fact, two owners.
 *
 * Summing over the keys is the deliberate choice: a new severity is counted
 * before anyone remembers to write the line that counts it.
 */
export function severityTotal(by: Record<Severity, number>): number {
  return Object.values(by).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
}

/** The same record read for one class — the header's chips and the filters. */
export function severityCount(by: Record<Severity, number>, id: Severity): number {
  return by[id] ?? 0;
}
