import type {} from "@react-three/fiber";
import * as THREE from "three";
import { DEFAULT_TERRAIN_LAYOUT, type TerrainBatch, type TerrainBlockKind } from "./terrain";

const PALETTE = {
  sky: "#9bd9e8",
  fog: "#b7e3e8",
  grassTop: "#78ad4f",
  grassFringe: "#81b653",
  earth: "#87633f",
  earthDeep: "#6f5038",
  sand: "#e4ce92",
  sandShade: "#cdb77e",
  stone: "#84918c",
  stoneDeep: "#6d7975",
  trunk: "#795638",
  trunkTop: "#a17b4c",
  leaves: "#4f913d",
  leavesTop: "#65a949",
  water: "#3d9fc1",
  waterSide: "#2f7f9f",
  cloud: "#f4f8f5",
  cloudSide: "#d7e7e9",
} as const;

type RenderBatch = {
  readonly kind: TerrainBlockKind;
  readonly blocks: TerrainBatch["blocks"];
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly initialize: (mesh: THREE.InstancedMesh | null) => void;
};

function blockGeometry(kind: TerrainBlockKind): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 4, 1);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const ny = normals.getY(index);
    const localY = positions.getY(index);
    const localX = positions.getX(index);
    const localZ = positions.getZ(index);
    let hex: string = PALETTE.stone;

    if (kind === "grass") {
      hex =
        ny > 0.5
          ? PALETTE.grassTop
          : localY >= 0.25
            ? PALETTE.grassFringe
            : localY < -0.25
              ? PALETTE.earthDeep
              : PALETTE.earth;
    } else if (kind === "earth") {
      hex = localY > 0.1 ? PALETTE.earth : PALETTE.earthDeep;
    } else if (kind === "sand") {
      hex = ny > 0.5 ? PALETTE.sand : PALETTE.sandShade;
    } else if (kind === "stone") {
      hex = ny > 0.5 ? PALETTE.stone : localY < -0.1 ? PALETTE.stoneDeep : PALETTE.stone;
    } else if (kind === "trunk") {
      hex = ny > 0.5 ? PALETTE.trunkTop : PALETTE.trunk;
    } else if (kind === "leaves") {
      hex = ny > 0.5 ? PALETTE.leavesTop : PALETTE.leaves;
    } else if (kind === "water") {
      hex = ny > 0.5 ? PALETTE.water : PALETTE.waterSide;
    } else if (kind === "cloud") {
      hex = ny > 0.5 ? PALETTE.cloud : PALETTE.cloudSide;
    }

    color.set(hex);
    if ((kind === "stone" || kind === "trunk") && ny < 0.5) {
      const grain = 0.94 + Math.abs(Math.sin((localX + localZ) * 17 + localY * 9)) * 0.06;
      color.multiplyScalar(grain);
    }
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function blockMaterial(kind: TerrainBlockKind): THREE.Material {
  if (kind === "water") {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.24,
      metalness: 0,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
  }
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: kind === "cloud" ? 1 : 0.94,
    metalness: 0,
    flatShading: true,
  });
}

function renderBatch(batch: TerrainBatch): RenderBatch {
  const geometry = blockGeometry(batch.kind);
  const material = blockMaterial(batch.kind);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();

  return {
    ...batch,
    geometry,
    material,
    castShadow: batch.kind !== "water" && batch.kind !== "cloud",
    receiveShadow: batch.kind !== "cloud",
    initialize: (mesh) => {
      if (!mesh) return;
      batch.blocks.forEach((block, index) => {
        transform.position.set(block.x, block.y, block.z);
        transform.scale.set(block.sx, block.sy, block.sz);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        tint.setRGB(block.tint, block.tint, block.tint);
        mesh.setColorAt(index, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
  };
}

const TERRAIN_LAYOUT = DEFAULT_TERRAIN_LAYOUT;
const RENDER_BATCHES = TERRAIN_LAYOUT.batches.map(renderBatch);
const ignoreRaycast = () => null;

/** Environment-only geometry: no DOM, input, store, animation loop or remote assets. */
export function VoxelTerrain() {
  return (
    <>
      <color attach="background" args={[PALETTE.sky]} />
      <fog attach="fog" args={[PALETTE.fog, 46, 96]} />
      <group name="forge-terrain" dispose={null}>
        {RENDER_BATCHES.map((batch) => (
          <instancedMesh
            key={batch.kind}
            name={`forge-terrain-${batch.kind}`}
            args={[batch.geometry, batch.material, batch.blocks.length]}
            ref={batch.initialize}
            castShadow={batch.castShadow}
            receiveShadow={batch.receiveShadow}
            raycast={ignoreRaycast}
            dispose={null}
            userData={{ terrainKind: batch.kind, terrainInstances: batch.blocks.length }}
          />
        ))}
      </group>
    </>
  );
}
