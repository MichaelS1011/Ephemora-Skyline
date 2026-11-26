import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { ForgeGraph } from "../src/forge/contracts";
import { templateGraph } from "../src/forge/templates";
import { DEFAULT_TERRAIN_LAYOUT } from "../src/forge/world/terrain";
import { applyThirdPersonCamera } from "../src/forge/world/playerCamera";
import {
  BLOCK_HEIGHT,
  BLOCK_SIZE,
  BUILD_REACH,
  GRID_STEP,
  LEVEL_STEP,
  PLAYER_EYE_HEIGHT,
  collides,
  raycastGrid,
  sweepVertical,
  targetFromHit,
} from "../src/forge/world/targeting";

const graph: ForgeGraph = {
  nodes: [{ id: "block", catalogId: "forge-text", cell: [0, 0, 0], label: "Text", color: "#fff" }],
  edges: [],
};

const direction = (x: number, y: number, z: number) => {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
};

describe("FORGE deterministic targeting", () => {
  it("places beside the struck block instead of rounding back into its occupied cell", () => {
    const right = raycastGrid(graph, { x: 3, y: 0.55, z: 0 }, direction(-1, 0, 0))!;
    const left = raycastGrid(graph, { x: -3, y: 0.55, z: 0 }, direction(1, 0, 0))!;
    const front = raycastGrid(graph, { x: 0, y: 0.55, z: 3 }, direction(0, 0, -1))!;

    expect(targetFromHit(graph, right)).toMatchObject({ cell: [GRID_STEP, 0, 0], occupied: false });
    expect(targetFromHit(graph, left)).toMatchObject({ cell: [-GRID_STEP, 0, 0], occupied: false });
    expect(targetFromHit(graph, front)).toMatchObject({ cell: [0, GRID_STEP, 0], occupied: false });

    const offset: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [4, 6, 1] }],
      edges: [],
    };
    const offsetHit = raycastGrid(
      offset,
      { x: 7, y: LEVEL_STEP + 0.55, z: 6 },
      direction(-1, 0, 0),
    )!;
    expect(targetFromHit(offset, offsetHit)).toMatchObject({ cell: [6, 6, 1], occupied: false });
  });

  it("stacks on the top face and targets the level below from a bottom face", () => {
    const top = raycastGrid(graph, { x: 0, y: 3, z: 0 }, direction(0, -1, 0))!;
    expect(targetFromHit(graph, top)).toMatchObject({ cell: [0, 0, 1], occupied: false });

    const raised: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [0, 0, 1] }],
      edges: [],
    };
    const bottom = raycastGrid(raised, { x: 0, y: LEVEL_STEP - 1, z: 0 }, direction(0, 1, 0))!;
    expect(targetFromHit(raised, bottom)).toMatchObject({ cell: [0, 0, 0], occupied: false });
  });

  it("uses the ground grid, enforces reach and keeps world bounds", () => {
    const ground = raycastGrid(
      { nodes: [], edges: [] },
      { x: 1.2, y: 2, z: -1.2 },
      direction(0, -1, 0),
    )!;
    expect(targetFromHit({ nodes: [], edges: [] }, ground)).toMatchObject({
      cell: [2, -2, 0],
      inBounds: true,
      occupied: false,
    });
    expect(
      raycastGrid(
        { nodes: [], edges: [] },
        { x: 0, y: BUILD_REACH + 2, z: 0 },
        direction(0, -1, 0),
      ),
    ).toBeNull();

    const edge: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [26, 0, 0] }],
      edges: [],
    };
    const outside = raycastGrid(edge, { x: 29, y: 0.55, z: 0 }, direction(-1, 0, 0))!;
    expect(targetFromHit(edge, outside)).toMatchObject({ cell: [28, 0, 0], inBounds: false });
  });

  it("gives a loaded template an immediately reachable first placement target", () => {
    const website = templateGraph("website-onepager");
    const hit = raycastGrid(website, { x: 0, y: 2.4, z: 5.5 }, direction(0, -2.4, -5.5));
    expect(hit?.blockId).toBe("site-nav");
    expect(hit!.distance).toBeLessThan(BUILD_REACH);
    expect(targetFromHit(website, hit!)).toMatchObject({
      cell: [0, GRID_STEP, 0],
      occupied: false,
    });
  });

  it("detects collision at the block body but not at an adjacent grid cell", () => {
    expect(collides(graph, { x: 0, y: PLAYER_EYE_HEIGHT, z: 0 })).toBe(true);
    expect(collides(graph, { x: GRID_STEP, y: PLAYER_EYE_HEIGHT, z: 0 })).toBe(false);
    expect(collides(graph, { x: 0, y: BLOCK_HEIGHT + PLAYER_EYE_HEIGHT + 0.01, z: 0 })).toBe(false);
  });

  it("uses LEVEL_STEP for elevated blocks and includes the player's head", () => {
    const raised: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [0, 0, 1] }],
      edges: [],
    };

    expect(collides(raised, { x: 0.9, y: PLAYER_EYE_HEIGHT, z: 0 })).toBe(true);
    expect(collides(raised, { x: 0.9, y: LEVEL_STEP + PLAYER_EYE_HEIGHT, z: 0 })).toBe(true);
    expect(
      collides(raised, { x: 0.9, y: LEVEL_STEP + BLOCK_HEIGHT + PLAYER_EYE_HEIGHT + 0.01, z: 0 }),
    ).toBe(false);
  });

  it("sweeps vertical movement against the nearest block face", () => {
    const ceiling: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [0, 0, 2] }],
      edges: [],
    };
    const floor: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [0, 0, 0] }],
      edges: [],
    };

    expect(sweepVertical(ceiling, { x: 0, y: PLAYER_EYE_HEIGHT, z: 0 }, 1)).toBeCloseTo(
      LEVEL_STEP * 2 - 0.32,
      5,
    );
    expect(sweepVertical(floor, { x: 0, y: 3, z: 0 }, -2)).toBeCloseTo(
      BLOCK_HEIGHT + PLAYER_EYE_HEIGHT,
      5,
    );
  });

  it("uses the actual terrain surface instead of a global ground plane", () => {
    const hit = raycastGrid(
      { nodes: [], edges: [] },
      { x: 30, y: 10, z: -20 },
      direction(0, -1, 0),
      20,
    )!;
    expect(hit.blockId).toBeUndefined();
    expect(hit.point.y).toBeGreaterThan(0);
  });
});

describe("FORGE Third Person occlusion", () => {
  it("shortens the camera boom before a nearby block", () => {
    const camera = new PerspectiveCamera();
    const player = new Vector3(0, PLAYER_EYE_HEIGHT, -1.08);
    const raised: ForgeGraph = {
      nodes: [{ ...graph.nodes[0]!, cell: [0, 0, 1] }],
      edges: [],
    };

    applyThirdPersonCamera(camera, player, 0, 0, raised);

    expect(camera.position.distanceTo(player)).toBeLessThan(0.65);
    expect(camera.position.z).toBeLessThan(-BLOCK_SIZE / 2);
  });

  it("keeps the camera out of solid terrain", () => {
    const camera = new PerspectiveCamera();
    applyThirdPersonCamera(
      camera,
      new Vector3(25.7, PLAYER_EYE_HEIGHT, -20),
      Math.PI / 2,
      0,
      graph,
    );
    const insideTerrain = DEFAULT_TERRAIN_LAYOUT.batches.some((batch) =>
      ["water", "cloud"].includes(batch.kind)
        ? false
        : batch.blocks.some(
            (block) =>
              Math.abs(camera.position.x - block.x) < block.sx / 2 &&
              Math.abs(camera.position.y - block.y) < block.sy / 2 &&
              Math.abs(camera.position.z - block.z) < block.sz / 2,
          ),
    );

    expect(insideTerrain).toBe(false);
  });
});
