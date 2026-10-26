/**
 * epheDuty — work presence (EPHE task #2).
 *
 * The village rule: a resident lives where the work is. A plot with findings
 * that still need a verdict gets residents; a plot whose findings all carry a
 * verdict runs empty. No new visual channel is introduced for this — height,
 * facade, roof, alarm windows, kerb and the landmark beam already carry their
 * own weight (`Building.tsx`) — the seats simply follow the queue, and the
 * crowd's existing doorway traffic (enter/exit at `homes[e.home]`) makes the
 * presence visible at the plot itself.
 *
 * What this module deliberately is not:
 * - no dice, no clock, no biography. The same city and the same verdicts give
 *   the same seats, so the same scan looks the same (the crowd's own pauses
 *   come from `Math.random()` elsewhere; that noise is what this separation
 *   exists to exclude, not to inherit).
 * - no store write and no new store read: the open-work counts come through
 *   the queue's own exported functions (`triageList`, `openTriageCount`), the
 *   same two the triage dock uses.
 * - no mesh, no colour, no frame-path cost: seats are an index array computed
 *   at render time and read by code that already ran.
 *
 * Seat rule, stated once so the renderer cannot drift from it:
 * 1. while any plot has open work, every seat falls on an open plot first
 *    (one seat per plot, most open findings first, plot index breaking ties),
 *    then the repeat seats one per extra open finding in the same order, then
 *    the plots that hold no findings at all — a city with nothing to point at
 *    keeps its everyday life, a decided plot never takes a seat while open
 *    work is left to seat;
 * 2. when no plot has open work, the crowd lives exactly where it lived
 *   before: seat `i` on plot `i % plots`. Presence carries no signal then, and
 *   withdrawing it from a whole decided city would only kill the city.
 */

import { openTriageCount, triageList, type TriageEntry } from "../stores/useStore";
// Der Address-Ausdruck selbst lebt in ./epheIdentity; hier wird nur sein Typ gelesen, damit
// die Sitz-Identitaet dieselbe Form hat wie die des rohen Index.
import type { EpheIdentity } from "./epheIdentity";
import type { CityData, ReviewStatus } from "./types";

/** What one plot owes the queue. */
export interface PlotWork {
  /** Every finding the file on this plot carries, decided or not. */
  total: number;
  /** The findings of it that still need a verdict. */
  open: number;
}

/**
 * Open findings per plot, read off the plot's own file id.
 *
 * The whole queue is used (`triageList(city, "all", null)`) rather than the
 * filtered one the dock shows: a rule filter is a reading aid, not a change of
 * where the work lies, and the crowd must not reshuffle because a panel
 * scrolled a severity tab.
 */
export function plotOpenFindings(
  unitIds: readonly (string | null)[],
  city: CityData | null,
  reviews: Record<string, ReviewStatus>,
): PlotWork[] {
  const byFile = new Map<string, TriageEntry[]>();
  if (city) {
    for (const entry of triageList(city, "all", null)) {
      const list = byFile.get(entry.file.id);
      if (list) list.push(entry);
      else byFile.set(entry.file.id, [entry]);
    }
  }
  return unitIds.map((unitId) => {
    const entries = unitId === null ? undefined : byFile.get(unitId);
    if (!entries) return { total: 0, open: 0 };
    return { total: entries.length, open: openTriageCount(entries, reviews) };
  });
}

/**
 * The plot index of the `i`-th seat, deterministic by construction.
 *
 * A crowd smaller than the open work covers the open plots worst-first and no
 * further — the uncovered remainder is what `presenceCoverage` reports, not
 * something an extra instance is invented for.
 */
export function presenceSeats(plots: readonly PlotWork[], crowd: number): number[] {
  const n = plots.length;
  if (n === 0) return [];
  const openOrder: number[] = [];
  for (let i = 0; i < n; i++) if (plots[i]!.open > 0) openOrder.push(i);
  if (openOrder.length === 0) {
    // Nothing to point at: the everyday round-robin the crowd has always used.
    return Array.from({ length: crowd }, (_, i) => i % n);
  }
  openOrder.sort((a, b) => plots[b]!.open - plots[a]!.open || a - b);
  const pool: number[] = [];
  // one seat per open plot, most open findings first …
  for (const p of openOrder) pool.push(p);
  // … then one repeat seat per further open finding on that plot …
  for (const p of openOrder) for (let k = 1; k < plots[p]!.open; k++) pool.push(p);
  // … then the plots that carry no findings at all. Plots whose findings are
  // all decided are not in the pool: they run empty while work is seated.
  for (let i = 0; i < n; i++) if (plots[i]!.open === 0 && plots[i]!.total === 0) pool.push(i);
  return Array.from({ length: crowd }, (_, i) => pool[i % pool.length]!);
}

/** How the seats sit against the work — the acceptance measure, not a mood. */
export interface PresenceCoverage {
  /** Share of all seats standing on a plot with open work. 0 for no seats. */
  residentShare: number;
  /** Open plots with no seat at all. */
  unstaffedOpenPlots: number;
  /** Open plots reached by at least one seat, over all open plots. 1 when the
   *  city has no open work — full attention to nothing is trivially full. */
  coverage: number;
}

export function presenceCoverage(
  seats: readonly number[],
  plots: readonly PlotWork[],
): PresenceCoverage {
  const staffed = new Set<number>();
  let onOpen = 0;
  for (const s of seats) {
    if (plots[s] && plots[s]!.open > 0) {
      onOpen++;
      staffed.add(s);
    }
  }
  let openTotal = 0;
  for (const p of plots) if (p.open > 0) openTotal++;
  return {
    residentShare: seats.length === 0 ? 0 : onOpen / seats.length,
    unstaffedOpenPlots: openTotal - staffed.size,
    coverage: openTotal === 0 ? 1 : staffed.size / openTotal,
  };
}

/**
 * The plot a seat is assigned to: the duty seat where one exists, the everyday
 * round-robin (`i % plots`) where the seats array is empty — which is what the
 * crowd was built on before this module existed.
 */
export function seatHome(i: number, seats: readonly number[], plots: number): number {
  if (plots === 0) return -1;
  if (seats.length === 0) return i % plots;
  return seats[i % seats.length] ?? i % plots;
}

/**
 * The identity of the `i`-th figure when the crowd lives by `seats`.
 *
 * Same address rule as `epheIdentityOf` — plot plus which citizen of it this
 * is — only the plot now comes from the seat rather than from the raw index.
 * With uniform seats (no open work, or no queue at all) the two agree seat for
 * seat, because the k-th repeat of a round-robin plot is `floor(i / plots)`.
 */
export function ephePresenceIdentity(
  i: number,
  unitIds: readonly (string | null)[],
  seats: readonly number[],
): EpheIdentity {
  const plots = unitIds.length;
  if (plots === 0) return { plot: null, seat: i };
  const home = seatHome(i, seats, plots);
  const plot = unitIds[home] ?? null;
  // A plot the plan could not name is no address either — the same rule
  // `epheIdentityOf` states for an unnamed door.
  if (plot === null) return { plot: null, seat: i };
  let seat = 0;
  for (let j = 0; j < i; j++) if (seatHome(j, seats, plots) === home) seat++;
  return { plot, seat };
}
