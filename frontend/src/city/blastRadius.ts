/**
 * Blast radius: which files could feel a change to the selected one.
 *
 * The city already ships the only evidence this needs — a resolved, directed
 * import edge per pair, `from` importing `to`. This module reads that graph and
 * nothing else: no inference, no runtime claim, no second data source. It is a
 * pure function so the direction rule (the one thing that would be worse than
 * useless if it were wrong) is testable without a GPU, a browser or a scan.
 *
 * Direction, stated once: edge `A → B` means A imports B. Change B and A is the
 * file that has to be re-read. Change A and B is not affected by that fact
 * alone — a file does not break because something it reads has changed on disk.
 * So the answer to "what is affected by the selection" is always the set of
 * files on the OTHER END of an incoming edge, never the selection's own imports.
 */

/** One resolved import edge, as the city ships it (`CityData.fileConnections`). */
export interface BlastEdge {
  from: string;
  to: string;
  weight: number;
}

/** What a file is called and where it lives — enough to name it in a list. */
export interface BlastNode {
  id: string;
  name: string;
  path: string;
}

export interface BlastFile {
  id: string;
  name: string;
  path: string;
  /** Named imports behind this one file's edge — never counted as files. */
  weight: number;
  /** True when this file stands as its own building in the view. */
  drawn: boolean;
}

export interface BlastRadius {
  /** The selection the answer was computed for. */
  selected: string | null;
  /** Directly importing files, deduplicated by file, sorted by path. */
  files: BlastFile[];
  /** Those the city draws as a building right now. */
  drawn: BlastFile[];
  /** Those it does not — a draw limit, never an absent dependency. */
  summarised: BlastFile[];
}

const EMPTY: BlastRadius = { selected: null, files: [], drawn: [], summarised: [] };

/**
 * The one level the first version answers: files that import the selection.
 *
 * `drawnIds` is the set of file ids the layout renders as individual buildings
 * at this camera. A file outside it stays in the list — the city's semantic
 * zoom is a display cap, and silently dropping its members would turn "we are
 * not drawing this" into "nothing depends on that".
 */
export function planBlastRadius(
  edges: readonly BlastEdge[],
  nodes: ReadonlyMap<string, BlastNode>,
  drawnIds: ReadonlySet<string>,
  selectedId: string | null,
): BlastRadius {
  if (!selectedId) return EMPTY;

  const byId = new Map<string, BlastFile>();
  for (const edge of edges) {
    // Incoming only, and never the selection itself: an edge that starts and
    // ends at the selection says nothing about who else reads it.
    if (edge.to !== selectedId || edge.from === selectedId) continue;
    const node = nodes.get(edge.from);
    if (!node) continue; // an edge to a file the city does not know is no evidence
    const seen = byId.get(node.id);
    if (seen) {
      // Two edges between the same pair would double-count a FILE; the weight
      // carries that instead, so the count stays "files", not "statements".
      seen.weight += edge.weight;
      continue;
    }
    byId.set(node.id, {
      id: node.id,
      name: node.name,
      path: node.path,
      weight: edge.weight,
      drawn: drawnIds.has(node.id),
    });
  }

  const files = [...byId.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
  );
  return {
    selected: selectedId,
    files,
    drawn: files.filter((f) => f.drawn),
    summarised: files.filter((f) => !f.drawn),
  };
}

/**
 * How much of the answer the reader can currently see.
 *
 * A separate number on purpose: the panel has to be able to say "3 of 7" as
 * one fact rather than let a list of seven imply seven buildings on screen.
 */
export function blastVisibility(blast: BlastRadius): { total: number; drawn: number } {
  return { total: blast.files.length, drawn: blast.drawn.length };
}
