/**
 * The entry-to-selection import chain.
 *
 * The city already ships directed import edges (`from` imports `to`) and the
 * lighthouse landmarks name real entry points. This module reads both and
 * answers one question: which proven chain leads from an entry point to the
 * selected file? It walks the graph in the import direction only — an entry
 * point that imports a file is evidence; a file that imports the entry point is
 * not the same route.
 *
 * No inference, no renderer, no store. A hop that the payload cannot prove is
 * not drawn. The level that shows the result only draws buildings it actually
 * has, so `visibleFocusPath` trims the chain to the contiguous hops that end at
 * the selection and whose starts and ends both stand on that level. A gap
 * anywhere in the chain ends the visible segment rather than jumping over it
 * with a made-up anchor.
 */

import type { CityData } from "./types";

export interface FocusPathEdge {
  from: string;
  to: string;
}

export interface FocusPathPlan {
  /** The entry point the chain starts at. */
  entry: string;
  /** The selected file the chain ends at. */
  target: string;
  /** Entry first, selection last. */
  nodes: string[];
  /** `edges[i]` is the proven hop from `nodes[i]` to `nodes[i + 1]`. */
  edges: FocusPathEdge[];
}

/**
 * Shortest proven import chain from one of `entries` to `targetId`.
 *
 * Multi-source BFS: every entry starts at distance 0, edges are followed in
 * their shipped direction, and the first arrival at the target is the shortest
 * number of import hops. Ties are deterministic — entries and adjacency lists
 * are ordered by id, so the same city produces the same chain on every reload.
 */
export function planFocusPath(
  entries: readonly string[],
  targetId: string | null,
  fileConnections: CityData["fileConnections"],
): FocusPathPlan | null {
  if (!targetId) return null;

  const sources = [...new Set(entries)].filter((id) => id.length > 0).sort();
  if (sources.length === 0) return null;

  const adjacency = new Map<string, string[]>();
  for (const edge of fileConnections) {
    if (!edge.from || !edge.to || edge.from === edge.to) continue;
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
    else adjacency.set(edge.from, [edge.to]);
  }
  for (const list of adjacency.values()) list.sort();

  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const source of sources) {
    if (parent.has(source)) continue;
    parent.set(source, null);
    queue.push(source);
  }

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    if (node === targetId) break;
    for (const next of adjacency.get(node) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, node);
      queue.push(next);
    }
  }

  if (!parent.has(targetId)) return null;

  const nodes: string[] = [];
  let cursor: string | null = targetId;
  while (cursor !== null) {
    nodes.push(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  nodes.reverse();

  const edges: FocusPathEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i]!, to: nodes[i + 1]! });
  }
  return { entry: nodes[0]!, target: targetId, nodes, edges };
}

/**
 * The part of a proven chain the current level can actually draw.
 *
 * The target must be drawn. Walk backwards from it while the previous hop's
 * start is drawn too; the first undrawn node cuts the segment. A chain with no
 * drawable hop returns null — no line, no guessed district anchor. The returned
 * plan keeps the original target and uses the visible start as its `entry`.
 */
export function visibleFocusPath(
  plan: FocusPathPlan | null,
  drawnIds: ReadonlySet<string>,
): FocusPathPlan | null {
  if (!plan || plan.nodes.length === 0) return null;
  if (!drawnIds.has(plan.target)) return null;

  let start = plan.nodes.length - 1;
  while (start > 0 && drawnIds.has(plan.nodes[start - 1]!)) start--;

  if (start === plan.nodes.length - 1) return null;
  return {
    entry: plan.nodes[start]!,
    target: plan.target,
    nodes: plan.nodes.slice(start),
    edges: plan.edges.slice(start),
  };
}
