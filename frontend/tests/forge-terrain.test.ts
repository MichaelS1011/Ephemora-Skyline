import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { VoxelTerrain } from "../src/forge/world/VoxelTerrain";
import {
  BUILD_HALF_EXTENT,
  MAX_TERRAIN_DRAW_CALLS,
  MAX_TERRAIN_INSTANCES,
  TERRAIN_BLOCK_SIZE,
  WATER_SURFACE_Y,
  createTerrainLayout,
  isBuildArea,
  type TerrainBlock,
} from "../src/forge/world/terrain";

function allBlocks(layout: ReturnType<typeof createTerrainLayout>): TerrainBlock[] {
  return layout.batches.flatMap((batch) => batch.blocks);
}

function intersectsBuildArea(block: TerrainBlock): boolean {
  return (
    block.x + block.sx / 2 > -BUILD_HALF_EXTENT &&
    block.x - block.sx / 2 < BUILD_HALF_EXTENT &&
    block.z + block.sz / 2 > -BUILD_HALF_EXTENT &&
    block.z - block.sz / 2 < BUILD_HALF_EXTENT
  );
}

function elements(node: ReactNode): ReactElement<{ children?: ReactNode; raycast?: unknown }>[] {
  const found: ReactElement<{ children?: ReactNode; raycast?: unknown }>[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode; raycast?: unknown }>(child)) return;
    found.push(child);
    found.push(...elements(child.props.children));
  });
  return found;
}

describe("FORGE deterministic voxel terrain", () => {
  it("rebuilds the same landscape byte-for-byte from a seed", () => {
    const first = createTerrainLayout(1701);
    const second = createTerrainLayout(1701);
    const other = createTerrainLayout(1702);

    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
    expect(first.seed).toBe(1701);
  });

  it("keeps all 729 central surface blocks flat at y=0 and free of obstacles", () => {
    const blocks = allBlocks(createTerrainLayout());
    const central = blocks.filter((block) => block.kind !== "cloud" && intersectsBuildArea(block));
    const expectedCells = 27 * 27;

    expect(central).toHaveLength(expectedCells);
    expect(central.every((block) => block.kind === "grass")).toBe(true);
    expect(central.every((block) => block.y + block.sy / 2 === 0)).toBe(true);
    expect(central.every((block) => isBuildArea(block.x, block.z))).toBe(true);
    const centralCells = new Set(central.map((block) => `${block.x}:${block.z}`));
    for (let x = -BUILD_HALF_EXTENT; x <= BUILD_HALF_EXTENT; x += TERRAIN_BLOCK_SIZE) {
      for (let z = -BUILD_HALF_EXTENT; z <= BUILD_HALF_EXTENT; z += TERRAIN_BLOCK_SIZE) {
        expect(centralCells.has(`${x}:${z}`), `missing central ground at ${x}:${z}`).toBe(true);
      }
    }
    expect(
      central.every(
        (block) =>
          Math.abs(block.x) <= BUILD_HALF_EXTENT &&
          Math.abs(block.z) <= BUILD_HALF_EXTENT &&
          block.sx === TERRAIN_BLOCK_SIZE &&
          block.sz === TERRAIN_BLOCK_SIZE,
      ),
    ).toBe(true);
    expect(
      blocks.filter(
        (block) =>
          block.kind !== "cloud" && !intersectsBuildArea(block) && block.y + block.sy / 2 > 0,
      ).length,
    ).toBeGreaterThan(100);
  });

  it("places water outside the build area with a sandy shore and exposes stone cliffs", () => {
    const blocks = allBlocks(createTerrainLayout());
    const water = blocks.filter((block) => block.kind === "water");
    const shore = new Set(
      blocks.filter((block) => block.kind === "sand").map((block) => `${block.x}:${block.z}`),
    );
    const waterCells = new Set(water.map((block) => `${block.x}:${block.z}`));
    const neighbors = [
      [TERRAIN_BLOCK_SIZE, 0],
      [-TERRAIN_BLOCK_SIZE, 0],
      [0, TERRAIN_BLOCK_SIZE],
      [0, -TERRAIN_BLOCK_SIZE],
    ] as const;
    const shoreline = water.filter((block) =>
      neighbors.some(([dx, dz]) => !waterCells.has(`${block.x + dx}:${block.z + dz}`)),
    );

    expect(water.length).toBeGreaterThan(20);
    expect(water.every((block) => !intersectsBuildArea(block))).toBe(true);
    expect(water.every((block) => block.y + block.sy / 2 === WATER_SURFACE_Y)).toBe(true);
    expect(shoreline.length).toBeGreaterThan(20);
    expect(
      shoreline.every((block) =>
        neighbors.some(([dx, dz]) => shore.has(`${block.x + dx}:${block.z + dz}`)),
      ),
    ).toBe(true);
    expect(blocks.some((block) => block.kind === "sand")).toBe(true);
    expect(blocks.some((block) => block.kind === "stone" && block.y > 0)).toBe(true);
    expect(
      blocks.some(
        (stone) =>
          stone.kind === "stone" &&
          blocks.some(
            (grass) =>
              grass.kind === "grass" &&
              grass.x === stone.x &&
              grass.z === stone.z &&
              grass.y > stone.y + TERRAIN_BLOCK_SIZE,
          ),
      ),
    ).toBe(true);
    expect(blocks.some((block) => block.kind === "trunk")).toBe(true);
    expect(blocks.some((block) => block.kind === "leaves")).toBe(true);
    expect(blocks.some((block) => block.kind === "cloud" && block.y > 18)).toBe(true);
  });

  it("stays inside the instance and color-plus-shadow draw budgets", () => {
    for (const seed of [0, 1, 1701, 987654]) {
      const layout = createTerrainLayout(seed);
      const counted = layout.batches.reduce((sum, batch) => sum + batch.blocks.length, 0);

      expect(counted).toBe(layout.instanceCount);
      expect(counted).toBeLessThanOrEqual(MAX_TERRAIN_INSTANCES);
      expect(layout.batches.every((batch) => batch.blocks.length <= MAX_TERRAIN_INSTANCES)).toBe(
        true,
      );
      expect(layout.colorDrawCalls).toBe(layout.batches.length);
      expect(layout.colorDrawCalls + layout.shadowDrawCalls).toBeLessThanOrEqual(
        MAX_TERRAIN_DRAW_CALLS,
      );
    }
  });

  it("keeps neighboring terrain surfaces within one voxel step", () => {
    const surfaces = new Map<string, number>();
    for (const block of allBlocks(createTerrainLayout())) {
      if (!block.surface) continue;
      const key = `${block.x}:${block.z}`;
      surfaces.set(key, Math.max(surfaces.get(key) ?? -Infinity, block.y + block.sy / 2));
    }

    let largestStep = 0;
    let largestPair: readonly [string, number, string, number] | undefined;
    for (const [key, height] of surfaces) {
      const [x, z] = key.split(":").map(Number) as [number, number];
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const) {
        const neighbor = surfaces.get(`${x + dx}:${z + dz}`);
        if (neighbor === undefined) continue;
        const step = Math.abs(neighbor - height);
        if (step > largestStep) largestPair = [key, height, `${x + dx}:${z + dz}`, neighbor];
        largestStep = Math.max(largestStep, step);
      }
    }

    expect(largestStep, JSON.stringify(largestPair)).toBeLessThanOrEqual(TERRAIN_BLOCK_SIZE);
  });

  it("is mounted exactly once in the world instead of the legacy plane and grid", () => {
    const source = readFileSync(
      new URL("../src/forge/world/VoxelWorld.tsx", import.meta.url),
      "utf8",
    );

    expect(source.match(/<VoxelTerrain\s*\/>/g)).toHaveLength(1);
    expect(source).not.toMatch(/<planeGeometry|<gridHelper|#0b1016/);
  });

  it("exports a DOM-free R3F component with one instanced mesh per material batch", () => {
    const layout = createTerrainLayout();
    const tree = elements(VoxelTerrain());
    const meshes = tree.filter((element) => element.type === "instancedMesh");

    expect(meshes).toHaveLength(layout.colorDrawCalls);
    expect(tree.filter((element) => element.type === "mesh")).toHaveLength(0);
    expect(
      tree.some((element) =>
        ["div", "span", "p", "button", "canvas", "section", "form"].includes(String(element.type)),
      ),
    ).toBe(false);
    expect(meshes.every((element) => element.props.raycast !== undefined)).toBe(true);

    const source = readFileSync(
      new URL("../src/forge/world/VoxelTerrain.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*store[^"']*["']/);
    expect(source).not.toMatch(/useForgeStore|useStore|document\.|window\./);
    expect(source).not.toMatch(/TextureLoader|useLoader|https?:\/\//);
  });
});
