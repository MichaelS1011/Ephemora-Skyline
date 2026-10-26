/**
 * Which import arcs a selection draws, and what each one says.
 *
 * The renderer takes its geometry from here and nothing else, so every rule
 * the brief cares about lives in a pure function that can be tested without a
 * GPU: an arc only for a real resolved edge, never one to a building that is
 * not drawn in this district, and exactly one arc carrying the label.
 */

/** Where an arc may anchor: a rendered building's roof point, plus what to call it. */
export interface ArcAnchor {
  x: number;
  y: number;
  z: number;
  name: string;
  path: string;
}

export interface ImportArc {
  /** The importing file. The arrow in the label always points away from it. */
  from: string;
  /** The imported file. */
  to: string;
  /** Named imports behind the edge — the number the label quotes. */
  weight: number;
  /** Direction seen FROM THE SELECTED BUILDING, not from the edge. */
  direction: "out" | "in";
  /** The single arc the label rides on. */
  emphasized: boolean;
  /** The importer's roof — the arrow's tail. */
  start: ArcAnchor;
  /** The imported's roof — the arrow's head. */
  end: ArcAnchor;
  apex: { x: number; y: number; z: number };
}

/** What the city ships per edge; the backend already weight-sorts this list. */
export interface ImportEdge {
  from: string;
  to: string;
  weight: number;
}

export const FILE_ARCS_MAX = 70;

function apexOf(a: ArcAnchor, b: ArcAnchor): { x: number; y: number; z: number } {
  const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 + Math.min(dist * 0.24 + 3.5, 42),
    z: (a.z + b.z) / 2,
  };
}

/**
 * Ties break on the file paths, not on the payload order, so the labelled arc
 * is the same arc on every reload of the same city.
 */
const rankKey = (arc: ImportArc): string => `${arc.start.path}\u0000${arc.end.path}`;

export function planImportArcs(
  edges: readonly ImportEdge[],
  anchors: ReadonlyMap<string, ArcAnchor>,
  selectedFileId: string | null,
  max: number = FILE_ARCS_MAX,
): ImportArc[] {
  if (!selectedFileId) return [];
  const arcs: ImportArc[] = [];
  for (const edge of edges) {
    if (arcs.length >= max) break;
    if (edge.from !== selectedFileId && edge.to !== selectedFileId) continue;
    const start = anchors.get(edge.from);
    const end = anchors.get(edge.to);
    // An edge to a file that is not drawn here gets no arc. Guessing an
    // anchor would point a real relationship at somebody else's building.
    if (!start || !end) continue;
    // Two files sharing a plot — e.g. a podium pair — have no line to draw.
    if (start.x === end.x && start.z === end.z) continue;
    arcs.push({
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
      direction: edge.from === selectedFileId ? "out" : "in",
      emphasized: false,
      start,
      end,
      apex: apexOf(start, end),
    });
  }
  let best: ImportArc | null = null;
  for (const arc of arcs) {
    if (
      !best ||
      arc.weight > best.weight ||
      (arc.weight === best.weight && rankKey(arc) < rankKey(best))
    )
      best = arc;
  }
  if (best) best.emphasized = true;
  return arcs;
}
