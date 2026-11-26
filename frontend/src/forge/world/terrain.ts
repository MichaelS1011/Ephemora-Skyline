import { FORGE_BUILD_HALF_EXTENT, FORGE_GRID_STEP } from "../contracts";

export const TERRAIN_BLOCK_SIZE = FORGE_GRID_STEP;
export const BUILD_HALF_EXTENT = FORGE_BUILD_HALF_EXTENT;
export const MAX_TERRAIN_INSTANCES = 2500;
export const MAX_TERRAIN_DRAW_CALLS = 20;
export const WATER_SURFACE_Y = 0.08;
export const DEFAULT_TERRAIN_SEED = 1701;

export type TerrainBlockKind =
  "grass" | "earth" | "sand" | "stone" | "trunk" | "leaves" | "water" | "cloud";

export type TerrainBlock = {
  readonly kind: TerrainBlockKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly tint: number;
  readonly surface: boolean;
};

export type TerrainBatch = {
  readonly kind: TerrainBlockKind;
  readonly blocks: readonly TerrainBlock[];
};

export type TerrainLayout = {
  readonly seed: number;
  readonly batches: readonly TerrainBatch[];
  readonly instanceCount: number;
  readonly colorDrawCalls: number;
  readonly shadowDrawCalls: number;
};

type Column = {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly surface: "grass" | "sand" | "stone" | "water";
};

const BATCH_ORDER: readonly TerrainBlockKind[] = [
  "grass",
  "earth",
  "sand",
  "stone",
  "trunk",
  "leaves",
  "water",
  "cloud",
];
const MIN_COORDINATE = -40;
const MAX_COORDINATE = 40;
const WATER_THICKNESS = 0.28;
const PONDS = [
  { x: -18, z: -34, rx: 9, rz: 4 },
  { x: 34, z: 8, rx: 5, rz: 8 },
] as const;
const TREE_ANCHORS = [
  [-34, -18],
  [-30, -6],
  [-36, 6],
  [-32, 18],
  [-34, 30],
  [-22, 34],
  [-10, 38],
  [2, 34],
  [14, 38],
  [28, 32],
  [34, 24],
  [36, 8],
  [36, -8],
  [32, -20],
  [24, -32],
  [12, -38],
  [0, -38],
  [-12, -38],
  [-32, -24],
] as const;
const ROCK_ANCHORS = [
  [-36, -2],
  [-30, 12],
  [-38, 20],
  [-20, 30],
  [10, 30],
  [30, 28],
  [38, 16],
  [38, -2],
  [30, -24],
  [18, -34],
  [2, -40],
  [-20, -38],
  [-36, -28],
] as const;
const CLOUDS = [
  { x: -28, y: 24, z: -48 },
  { x: -6, y: 27, z: -52 },
  { x: 20, y: 23, z: -46 },
  { x: 34, y: 26, z: -30 },
  { x: -36, y: 25, z: -18 },
  { x: 8, y: 29, z: 44 },
] as const;

export function isBuildArea(x: number, z: number): boolean {
  return Math.abs(x) <= BUILD_HALF_EXTENT && Math.abs(z) <= BUILD_HALF_EXTENT;
}

function hash(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const tx = smooth(x - ix);
  const tz = smooth(z - iz);
  const north = hash(ix, iz, seed) * (1 - tx) + hash(ix + 1, iz, seed) * tx;
  const south = hash(ix, iz + 1, seed) * (1 - tx) + hash(ix + 1, iz + 1, seed) * tx;
  return north * (1 - tz) + south * tz;
}

function mound(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  height: number,
): number {
  const distance = Math.hypot((x - cx) / rx, (z - cz) / rz);
  return distance >= 1 ? 0 : Math.round(height * Math.pow(1 - distance, 1.35));
}

function onIsland(x: number, z: number, seed: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const edge = Math.max(ax, az);
  const corner = Math.min(ax, az);
  const ragged = (hash(Math.round(x / 6), Math.round(z / 6), seed + 11) - 0.5) * 2.4;
  return edge <= MAX_COORDINATE && edge + corner * 0.32 <= 47 + ragged;
}

function pondDistance(x: number, z: number, seed: number): number {
  let nearest = Infinity;
  for (const pond of PONDS) {
    const warp = (noise(x / 5, z / 5, seed + 29) - 0.5) * 0.12;
    const distance = Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz) + warp;
    nearest = Math.min(nearest, distance);
  }
  return nearest;
}

function terrainHeight(x: number, z: number, seed: number): number {
  if (isBuildArea(x, z)) return 0;
  const rolling = Math.max(0, Math.round((noise(x / 13, z / 13, seed + 3) - 0.53) * 5));
  return Math.min(
    4,
    Math.max(
      rolling,
      mound(x, z, -32, 2, 11, 13, 3),
      mound(x, z, 28, -20, 10, 11, 3),
      mound(x, z, 16, 34, 9, 8, 2),
    ),
  );
}

function outsideDecorationFootprint(x: number, z: number, radius: number): boolean {
  const reach = (radius + 1) * TERRAIN_BLOCK_SIZE;
  return (
    x - reach > BUILD_HALF_EXTENT ||
    x + reach < -BUILD_HALF_EXTENT ||
    z - reach > BUILD_HALF_EXTENT ||
    z + reach < -BUILD_HALF_EXTENT
  );
}

function smoothTerrainHeights(columns: Map<string, Column>): void {
  let changed = true;
  let passes = 0;
  while (changed && passes < MAX_COORDINATE * 2) {
    changed = false;
    passes += 1;
    for (const column of columns.values()) {
      if (column.surface === "water" || isBuildArea(column.x, column.z)) continue;
      let height = column.height;
      const neighbors = [
        columns.get(`${column.x - TERRAIN_BLOCK_SIZE}:${column.z}`),
        columns.get(`${column.x + TERRAIN_BLOCK_SIZE}:${column.z}`),
        columns.get(`${column.x}:${column.z - TERRAIN_BLOCK_SIZE}`),
        columns.get(`${column.x}:${column.z + TERRAIN_BLOCK_SIZE}`),
      ];
      for (const neighbor of neighbors) {
        if (!neighbor) continue;
        height = Math.min(neighbor.height + 1, Math.max(neighbor.height - 1, height));
      }
      if (height === column.height) continue;
      columns.set(`${column.x}:${column.z}`, { ...column, height });
      changed = true;
    }
  }
}

export function createTerrainLayout(seed = DEFAULT_TERRAIN_SEED): TerrainLayout {
  const columns = new Map<string, Column>();
  const blocks = new Map<TerrainBlockKind, TerrainBlock[]>(BATCH_ORDER.map((kind) => [kind, []]));

  const add = (
    kind: TerrainBlockKind,
    x: number,
    y: number,
    z: number,
    sx = TERRAIN_BLOCK_SIZE,
    sy = TERRAIN_BLOCK_SIZE,
    sz = TERRAIN_BLOCK_SIZE,
    surface = false,
  ) => {
    const tint = 0.87 + hash(Math.round(x * 2), Math.round(z * 2 + y), seed + 47) * 0.13;
    blocks.get(kind)!.push({ kind, x, y, z, sx, sy, sz, tint, surface });
  };

  for (let x = MIN_COORDINATE; x <= MAX_COORDINATE; x += TERRAIN_BLOCK_SIZE) {
    for (let z = MIN_COORDINATE; z <= MAX_COORDINATE; z += TERRAIN_BLOCK_SIZE) {
      if (!onIsland(x, z, seed)) continue;
      const height = terrainHeight(x, z, seed);
      const waterDistance = pondDistance(x, z, seed);
      let surface: Column["surface"] = height >= 3 ? "stone" : "grass";
      if (!isBuildArea(x, z)) {
        if (waterDistance < 0.88) surface = "water";
        else if (waterDistance < 1.26) surface = "sand";
      }
      columns.set(`${x}:${z}`, { x, z, height: surface === "water" ? 0 : height, surface });
    }
  }

  // A cardinal shore pass closes narrow, noise-warped inlets that a distance
  // threshold alone can leave as a one-block water peninsula.
  for (const column of [...columns.values()]) {
    if (isBuildArea(column.x, column.z) || column.surface === "water") continue;
    const touchesWater =
      columns.get(`${column.x - TERRAIN_BLOCK_SIZE}:${column.z}`)?.surface === "water" ||
      columns.get(`${column.x + TERRAIN_BLOCK_SIZE}:${column.z}`)?.surface === "water" ||
      columns.get(`${column.x}:${column.z - TERRAIN_BLOCK_SIZE}`)?.surface === "water" ||
      columns.get(`${column.x}:${column.z + TERRAIN_BLOCK_SIZE}`)?.surface === "water";
    if (touchesWater) columns.set(`${column.x}:${column.z}`, { ...column, surface: "sand" });
  }

  smoothTerrainHeights(columns);

  const columnAt = (x: number, z: number): Column | undefined => columns.get(`${x}:${z}`);
  const landHeightAt = (x: number, z: number): number => {
    const column = columnAt(x, z);
    return column && column.surface !== "water" ? column.height : -1;
  };

  for (const column of columns.values()) {
    const { x, z, height, surface } = column;
    if (surface === "water") {
      add("water", x, WATER_SURFACE_Y - WATER_THICKNESS / 2, z, 2, WATER_THICKNESS, 2, true);
      continue;
    }
    add(surface, x, height * TERRAIN_BLOCK_SIZE - TERRAIN_BLOCK_SIZE / 2, z, 2, 2, 2, true);
    for (let layer = 0; layer < height; layer += 1) {
      const exposed =
        landHeightAt(x - TERRAIN_BLOCK_SIZE, z) <= layer ||
        landHeightAt(x + TERRAIN_BLOCK_SIZE, z) <= layer ||
        landHeightAt(x, z - TERRAIN_BLOCK_SIZE) <= layer ||
        landHeightAt(x, z + TERRAIN_BLOCK_SIZE) <= layer;
      if (!exposed) continue;
      const kind = surface === "stone" || (height >= 2 && layer === 0) ? "stone" : "earth";
      add(kind, x, layer * TERRAIN_BLOCK_SIZE - TERRAIN_BLOCK_SIZE / 2, z);
    }
  }

  for (const [x, z] of TREE_ANCHORS) {
    const column = columnAt(x, z);
    if (!column || column.surface !== "grass" || column.height > 2) continue;
    if (!outsideDecorationFootprint(x, z, 2)) continue;
    const base = column.height * TERRAIN_BLOCK_SIZE;
    const trunkBlocks = hash(x, z, seed + 71) > 0.55 ? 4 : 3;
    for (let level = 0; level < trunkBlocks; level += 1) {
      add("trunk", x, base + level * TERRAIN_BLOCK_SIZE + TERRAIN_BLOCK_SIZE / 2, z);
    }
    const crown = base + trunkBlocks * TERRAIN_BLOCK_SIZE;
    for (const [dy, radius] of [
      [-1, 1],
      [1, 2],
      [3, 1],
    ] as const) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.abs(dx) + Math.abs(dz) > radius || (dy === -1 && dx === 0 && dz === 0)) continue;
          add("leaves", x + dx * TERRAIN_BLOCK_SIZE, crown + dy, z + dz * TERRAIN_BLOCK_SIZE);
        }
      }
    }
  }

  for (const [x, z] of ROCK_ANCHORS) {
    if (!outsideDecorationFootprint(x, z, 1)) continue;
    const count = 2 + Math.floor(hash(x, z, seed + 83) * 3);
    for (const [dx, dz] of (
      [
        [0, 0],
        [2, 0],
        [0, 2],
        [-2, 2],
      ] as const
    ).slice(0, count)) {
      const column = columnAt(x + dx, z + dz);
      if (!column || column.surface === "water" || column.surface === "sand") continue;
      add("stone", column.x, column.height * TERRAIN_BLOCK_SIZE + 1, column.z);
    }
  }

  for (const cloud of CLOUDS) {
    const y = cloud.y;
    add("cloud", cloud.x, y, cloud.z, 4, 1.6, 4);
    add("cloud", cloud.x - 3, y, cloud.z - 1, 2, 1.6, 2);
    add("cloud", cloud.x - 3, y, cloud.z + 1, 2, 1.6, 2);
    add("cloud", cloud.x + 3, y, cloud.z - 1, 2, 1.6, 2);
    add("cloud", cloud.x + 3, y, cloud.z + 1, 2, 1.6, 2);
    add("cloud", cloud.x - 1, y, cloud.z - 3, 2, 1.6, 2);
    add("cloud", cloud.x + 1, y, cloud.z + 3, 2, 1.6, 2);
    add("cloud", cloud.x, y + 1.6, cloud.z, 2, 1.6, 2);
  }

  const batches = BATCH_ORDER.map((kind) => ({ kind, blocks: blocks.get(kind)! })).filter(
    (batch) => batch.blocks.length > 0,
  );
  return {
    seed,
    batches,
    instanceCount: batches.reduce((sum, batch) => sum + batch.blocks.length, 0),
    colorDrawCalls: batches.length,
    shadowDrawCalls: batches.filter((batch) => batch.kind !== "water" && batch.kind !== "cloud")
      .length,
  };
}

export const DEFAULT_TERRAIN_LAYOUT = createTerrainLayout();
