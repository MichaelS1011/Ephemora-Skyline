/**
 * Ephe identity (EPHE-AI EA-01) — the address a citizen of the city lives at.
 *
 * The crowd is rebuilt whenever the reader changes level: `homes` are the plots
 * of the current plan and the population is derived from how many there are
 * (`crowdFor`). So the array index a click returns today is not an identity —
 * it is a seat number that means something only in the level it was read from.
 * Everything that wants to remember a figure (a name, a role, a bound model, a
 * mission) has to hang on something that survives that.
 *
 * The stable part is the plot: a building site is a file, and a file's id is
 * minted from its path (`fileIdForPath` in `backend/src/utils/cityMapper.ts`),
 * so the same folder re-scanned gives the same id, and two different projects
 * give different ones. The seat says which of a plot's several residents it is.
 *
 * Nothing here is stored or rendered — this module only states the rule, so the
 * renderer, the card and a later persistence layer all read the same one.
 */

export interface EpheIdentity {
  /**
   * The plot this figure is a citizen of, as the payload names it. `null` when
   * the level drew a crowd with no plots under it — the open-world preview,
   * where there is a street but no door to belong to.
   */
  plot: string | null;
  /** Which resident of that plot this is: 0 for the first, 1 for the next. */
  seat: number;
}

/**
 * The one string a figure is addressed by. Deliberately readable: it ends up in
 * a debug readout and, later, in a stored record, and `7f3a2c…#1` says nothing
 * to a person while `plot:f-7f3a2c1b9d04#1` says which door is meant.
 */
export function epheKey(id: EpheIdentity): string {
  return id.plot === null ? `street:${id.seat}` : `plot:${id.plot}#${id.seat}`;
}

/**
 * The identity of the `i`-th figure of a crowd drawn for `homes` plots — the
 * same arithmetic `makeEphe` uses to pick a home, stated once so the renderer
 * cannot drift from the rule. Several figures share a plot when the crowd is
 * bigger than the plots, so the seat counts which one of them this is.
 */
export function epheIdentityOf(i: number, homes: readonly (string | null)[]): EpheIdentity {
  const plots = homes.length;
  if (plots === 0) return { plot: null, seat: i };
  const plot = homes[i % plots] ?? null;
  // A plot the plan could not name is no address either: the figure stays a
  // seat number rather than claiming a door it does not belong to.
  return plot === null ? { plot: null, seat: i } : { plot, seat: Math.floor(i / plots) };
}

/**
 * Read a key back. The format is stated once, in `epheKey`, so the one place
 * that turns it back into an address lives beside it — a card that parsed the
 * string on its own would drift the moment the format grew a third case.
 */
export function parseEpheKey(key: string): EpheIdentity | null {
  const plot = /^plot:(.+)#(\d+)$/.exec(key);
  if (plot) return { plot: plot[1]!, seat: Number(plot[2]) };
  const street = /^street:(\d+)$/.exec(key);
  return street ? { plot: null, seat: Number(street[1]) } : null;
}

/**
 * Is this citizen on screen? A figure belongs to a plot, and a level that draws
 * its district as a block draws no plot — so the honest answer is sometimes no.
 * Callers say so instead of showing the name over an unrelated body.
 */
export function epheOnLevel(id: EpheIdentity, levelPlots: ReadonlySet<string>): boolean {
  return id.plot !== null && levelPlots.has(id.plot);
}
