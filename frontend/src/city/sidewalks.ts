/**
 * Sidewalk network — the graph the Ephe's actually walk on.
 *
 * Built from the street lines (district boundaries, plaza ring) plus the
 * plaza lanes between the file buildings. Nodes sit on the curb line of
 * every street, both sides, evenly spaced. Edges connect:
 * - along each curb (consecutive nodes of one side)
 * - across the asphalt every few nodes (crosswalk — also rendered as stripes)
 * - wherever two lines pass close (street corners, lane intersections)
 *
 * Deterministic: the same streets always produce the same network, so the
 * walkers, the crosswalk stripes and the street furniture agree.
 */

import type { DirLayout, StreetLine } from "./layout";

export interface SidewalkNode {
  x: number;
  z: number;
  adj: number[];
}

export interface Crosswalk {
  x: number;
  z: number;
  rotY: number;
}

export interface SidewalkNetwork {
  nodes: SidewalkNode[];
  crosswalks: Crosswalk[];
}

/** Sidewalk center distance from the street centerline (= curb line). */
export const CURB_OFFSET = 2.18;
/** Spacing of sidewalk nodes along a street. */
const NODE_STEP = 3.4;
/** Two nodes from different lines within this radius connect (corners). */
const LINK_RADIUS = 2.9;
/** Every n-th interior node pair on a street gets a crosswalk. */
const CROSSWALK_EVERY = 5;
const MAX_CROSSWALKS = 60;

/** Plaza lanes: clear walking lines BETWEEN the plaza's file buildings. */
export function plazaLanes(
  buildings: Array<{ x: number; z: number; w: number; d: number }>,
): StreetLine[] {
  if (buildings.length < 2) return [];
  const centers = (values: number[]): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(v - g[g.length - 1]!) < 3.2) g.push(v);
      else groups.push([v]);
    }
    return groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
  };
  const cols = centers(buildings.map((b) => b.x));
  const rows = centers(buildings.map((b) => b.z));
  if (cols.length < 2 && rows.length < 2) return [];
  const minZ = Math.min(...buildings.map((b) => b.z)) - 6;
  const maxZ = Math.max(...buildings.map((b) => b.z)) + 6;
  const minX = Math.min(...buildings.map((b) => b.x)) - 6;
  const maxX = Math.max(...buildings.map((b) => b.x)) + 6;
  const lanes: StreetLine[] = [];
  for (let i = 0; i + 1 < cols.length; i++) {
    const x = (cols[i]! + cols[i + 1]!) / 2;
    lanes.push({ x1: x, z1: minZ, x2: x, z2: maxZ });
  }
  for (let i = 0; i + 1 < rows.length; i++) {
    const z = (rows[i]! + rows[i + 1]!) / 2;
    lanes.push({ x1: minX, z1: z, x2: maxX, z2: z });
  }
  return lanes;
}

export function buildSidewalkNetwork(
  streets: StreetLine[],
  lanes: StreetLine[] = [],
): SidewalkNetwork {
  const nodes: SidewalkNode[] = [];
  const crosswalks: Crosswalk[] = [];
  const addNode = (x: number, z: number): number => {
    nodes.push({ x, z, adj: [] });
    return nodes.length - 1;
  };
  const link = (a: number, b: number): void => {
    if (a === b) return;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    if (!na.adj.includes(b)) na.adj.push(b);
    if (!nb.adj.includes(a)) nb.adj.push(a);
  };

  const allLines = [...streets, ...lanes];
  lines: for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li]!;
    const dx = line.x2 - line.x1;
    const dz = line.z2 - line.z1;
    const len = Math.hypot(dx, dz);
    if (len < 3) continue;
    const isStreet = li < streets.length;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const count = Math.max(2, Math.round(len / NODE_STEP) + 1);
    const sideA: number[] = [];
    const sideB: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = line.x1 + dx * t;
      const pz = line.z1 + dz * t;
      sideA.push(addNode(px + nx * CURB_OFFSET, pz + nz * CURB_OFFSET));
      sideB.push(addNode(px - nx * CURB_OFFSET, pz - nz * CURB_OFFSET));
    }
    for (let i = 0; i + 1 < sideA.length; i++) {
      link(sideA[i]!, sideA[i + 1]!);
      link(sideB[i]!, sideB[i + 1]!);
    }
    if (!isStreet) continue;
    for (let i = 2; i + 2 < sideA.length; i += CROSSWALK_EVERY) {
      if (crosswalks.length >= MAX_CROSSWALKS) break lines;
      const t = i / (count - 1);
      link(sideA[i]!, sideB[i]!);
      crosswalks.push({
        x: line.x1 + dx * t,
        z: line.z1 + dz * t,
        rotY: -Math.atan2(dz, dx),
      });
    }
  }

  // Corners and lane intersections: near nodes of different lines connect
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i]!.x - nodes[j]!.x;
      const dz = nodes[i]!.z - nodes[j]!.z;
      if (dx * dx + dz * dz < LINK_RADIUS * LINK_RADIUS) link(i, j);
    }
  }

  return { nodes, crosswalks };
}

/** Index of the graph node nearest to a point (door hops, curb spawns). */
export function nearestNode(net: SidewalkNetwork, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < net.nodes.length; i++) {
    const n = net.nodes[i]!;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Breadth-first path of node indices from `from` to `to` (excl. `from`). */
export function graphPath(net: SidewalkNetwork, from: number, to: number): number[] {
  if (from === to) return [];
  const prev = new Int32Array(net.nodes.length).fill(-1);
  prev[from] = from;
  const queue: number[] = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    for (const nb of net.nodes[cur]!.adj) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path: number[] = [];
        let c = to;
        while (c !== from) {
          path.push(c);
          c = prev[c]!;
        }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return [];
}

/** A plot a building will rise on: x/z plot centre, doorX/doorZ work point. */
export interface BuildSite {
  x: number;
  z: number;
  doorX: number;
  doorZ: number;
}

/**
 * Work points for every rising plot, in the city's build order: the blocks
 * first (layout.blocks order), then the plaza buildings (layout.buildings
 * order). The podium never rises as a plot, so it gets no site. The door
 * points match the home doors CityTree hands to the walkers. Deterministic:
 * the same layout always produces the same sites.
 */
export function planBuildSites(layout: DirLayout): BuildSite[] {
  const sites: BuildSite[] = [];
  for (const b of layout.blocks) {
    sites.push({ x: b.x, z: b.z, doorX: b.x, doorZ: b.z + b.d / 2 + 1.1 });
  }
  for (const b of layout.buildings) {
    sites.push({ x: b.x, z: b.z, doorX: b.x, doorZ: b.z + b.d / 2 + 0.9 });
  }
  return sites;
}
