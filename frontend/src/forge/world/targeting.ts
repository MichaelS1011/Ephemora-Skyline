import { FORGE_GRID_STEP, isForgeCell, type ForgeGraph } from "../contracts";
import { DEFAULT_TERRAIN_LAYOUT } from "./terrain";

export const GRID_STEP = FORGE_GRID_STEP;
export const BLOCK_SIZE = 1.55;
export const BLOCK_HEIGHT = 1.1;
export const LEVEL_STEP = BLOCK_HEIGHT + 0.12;
export const BUILD_REACH = 6;
export const PLAYER_EYE_HEIGHT = 1.7;
export const PLAYER_HEIGHT = 2.02;
export const PLAYER_RADIUS = 0.3;

export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };
export type GridCell = readonly [number, number, number];

export type SurfaceHit = {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly blockId?: string;
  readonly level: number;
  readonly distance: number;
};

export type BuildTarget = {
  readonly cell: GridCell;
  readonly occupied: boolean;
  readonly inBounds: boolean;
  readonly blockId?: string;
};

type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

type BoxHit = Pick<SurfaceHit, "point" | "normal" | "distance">;

const TERRAIN_COLLIDERS: readonly Box[] = DEFAULT_TERRAIN_LAYOUT.batches.flatMap((batch) =>
  batch.kind === "water" || batch.kind === "cloud"
    ? []
    : batch.blocks.map((block) => ({
        minX: block.x - block.sx / 2,
        maxX: block.x + block.sx / 2,
        minY: block.y - block.sy / 2,
        maxY: block.y + block.sy / 2,
        minZ: block.z - block.sz / 2,
        maxZ: block.z + block.sz / 2,
      })),
);

function axisHit(
  origin: number,
  direction: number,
  min: number,
  max: number,
): { near: number; far: number; normal: number } | null {
  if (Math.abs(direction) < 0.000001) {
    return origin >= min && origin <= max ? { near: -Infinity, far: Infinity, normal: 0 } : null;
  }
  let near = (min - origin) / direction;
  let far = (max - origin) / direction;
  let normal = -1;
  if (near > far) {
    [near, far] = [far, near];
    normal = 1;
  }
  return { near, far, normal };
}

function raycastBox(origin: Vec3, direction: Vec3, box: Box, reach: number): BoxHit | null {
  const x = axisHit(origin.x, direction.x, box.minX, box.maxX);
  const y = axisHit(origin.y, direction.y, box.minY, box.maxY);
  const z = axisHit(origin.z, direction.z, box.minZ, box.maxZ);
  if (!x || !y || !z) return null;
  const near = Math.max(0, x.near, y.near, z.near);
  const far = Math.min(reach, x.far, y.far, z.far);
  if (near > far) return null;
  const normalAxis = near === x.near ? "x" : near === y.near ? "y" : "z";
  const sign = normalAxis === "x" ? x.normal : normalAxis === "y" ? y.normal : z.normal;
  return {
    point: {
      x: origin.x + direction.x * near,
      y: origin.y + direction.y * near,
      z: origin.z + direction.z * near,
    },
    normal: {
      x: normalAxis === "x" ? sign : 0,
      y: normalAxis === "y" ? sign : 0,
      z: normalAxis === "z" ? sign : 0,
    },
    distance: near,
  };
}

export function raycastGrid(
  graph: ForgeGraph,
  origin: Vec3,
  direction: Vec3,
  reach = BUILD_REACH,
): SurfaceHit | null {
  let nearest: SurfaceHit | null = null;
  const consider = (box: Box, blockId?: string, level = 0) => {
    const hit = raycastBox(origin, direction, box, reach);
    if (!hit || (nearest && hit.distance >= nearest.distance)) return;
    nearest = { ...hit, blockId, level };
  };

  for (const node of graph.nodes) {
    const half = BLOCK_SIZE / 2;
    const base = (node.cell[2] ?? 0) * LEVEL_STEP;
    consider(
      {
        minX: node.cell[0] - half,
        maxX: node.cell[0] + half,
        minY: base,
        maxY: base + BLOCK_HEIGHT,
        minZ: node.cell[1] - half,
        maxZ: node.cell[1] + half,
      },
      node.id,
      node.cell[2] ?? 0,
    );
  }
  for (const box of TERRAIN_COLLIDERS) consider(box);
  return nearest;
}

export function targetFromHit(graph: ForgeGraph, hit: SurfaceHit): BuildTarget {
  const block = hit.blockId ? graph.nodes.find((node) => node.id === hit.blockId) : undefined;
  const level = block
    ? hit.normal.y > 0.5
      ? hit.level + 1
      : hit.normal.y < -0.5
        ? hit.level - 1
        : hit.level
    : 0;
  const cell: GridCell = block
    ? [
        block.cell[0] + (hit.normal.x > 0.5 ? GRID_STEP : hit.normal.x < -0.5 ? -GRID_STEP : 0),
        block.cell[1] + (hit.normal.z > 0.5 ? GRID_STEP : hit.normal.z < -0.5 ? -GRID_STEP : 0),
        Math.max(0, level),
      ]
    : [
        Math.round((hit.point.x + hit.normal.x * 0.02) / GRID_STEP) * GRID_STEP,
        Math.round((hit.point.z + hit.normal.z * 0.02) / GRID_STEP) * GRID_STEP,
        0,
      ];
  return {
    cell,
    blockId: hit.blockId,
    inBounds: isForgeCell(cell),
    occupied: graph.nodes.some(
      (node) =>
        node.cell[0] === cell[0] && node.cell[1] === cell[1] && (node.cell[2] ?? 0) === cell[2],
    ),
  };
}

export function collides(graph: ForgeGraph, position: Vec3, radius = PLAYER_RADIUS): boolean {
  const feet = position.y - PLAYER_EYE_HEIGHT;
  const head = position.y + PLAYER_HEIGHT - PLAYER_EYE_HEIGHT;
  return graph.nodes.some((node) => {
    const base = (node.cell[2] ?? 0) * LEVEL_STEP;
    if (head <= base || feet >= base + BLOCK_HEIGHT) return false;
    return (
      Math.abs(position.x - node.cell[0]) < BLOCK_SIZE / 2 + radius &&
      Math.abs(position.z - node.cell[1]) < BLOCK_SIZE / 2 + radius
    );
  });
}

export function sweepVertical(
  graph: ForgeGraph,
  position: Vec3,
  delta: number,
  radius = PLAYER_RADIUS,
): number {
  if (delta === 0 || collides(graph, position, radius)) return position.y;
  const target = position.y + delta;
  let limited = target;
  const headOffset = PLAYER_HEIGHT - PLAYER_EYE_HEIGHT;

  for (const node of graph.nodes) {
    if (
      Math.abs(position.x - node.cell[0]) >= BLOCK_SIZE / 2 + radius ||
      Math.abs(position.z - node.cell[1]) >= BLOCK_SIZE / 2 + radius
    )
      continue;
    const base = (node.cell[2] ?? 0) * LEVEL_STEP;
    const top = base + BLOCK_HEIGHT;
    if (delta > 0 && position.y + headOffset <= base && target + headOffset > base) {
      limited = Math.min(limited, base - headOffset);
    } else if (
      delta < 0 &&
      position.y - PLAYER_EYE_HEIGHT >= top &&
      target - PLAYER_EYE_HEIGHT < top
    ) {
      limited = Math.max(limited, top + PLAYER_EYE_HEIGHT);
    }
  }
  return limited;
}
