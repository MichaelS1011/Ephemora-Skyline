"use client";

import * as THREE from "three";
import type { SandboxScenario } from "../city/refactorSandbox";
import { ENV } from "../city/palette";
import { useSandboxStore } from "../stores/useSandboxStore";

/**
 * GhostTower — the 3D half of the Refactor Sandbox.
 *
 * It is read-only by construction: the scenario comes from `useSandboxStore`,
 * the placement from CityTree's existing building layout, and nothing here
 * writes to the city. A split or extract draws a translucent tower at the
 * scenario height; a test draws a coverage-GOAL shield at the building's own
 * height, because the model explicitly claims no height change.
 *
 * Geometry and materials are module-level singletons. The only work on a
 * render is a handful of multiplications, so orbiting the camera allocates
 * nothing.
 */

export interface GhostTowerPlacement {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  /** The selected file; a stale scenario from another file must not draw. */
  readonly fileId: string;
}

export interface GhostTowerPlan {
  readonly kind: "tower" | "shield";
  readonly height: number;
  readonly width: number;
  readonly depth: number;
  readonly centreY: number;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);

const TOWER_MATERIAL = new THREE.MeshBasicMaterial({
  color: ENV.connection,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const TOWER_EDGE_MATERIAL = new THREE.LineBasicMaterial({
  color: ENV.connection,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
});

const SHIELD_MATERIAL = new THREE.MeshBasicMaterial({
  color: ENV.plotEdge,
  transparent: true,
  opacity: 0.13,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const SHIELD_EDGE_MATERIAL = new THREE.LineBasicMaterial({
  color: ENV.curb,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
});

/**
 * The numbers behind the ghost, kept pure so the shape contract is testable
 * without a WebGL renderer.
 *
 * `test` reuses `original.height` and only adds a thin protective margin: the
 * shield states a coverage target, not a new tower height. Every other action
 * uses the scenario's own height on the city's existing rail.
 */
export function ghostTowerPlan(
  scenario: SandboxScenario | null,
  placement: GhostTowerPlacement,
): GhostTowerPlan | null {
  if (!scenario || scenario.fileId !== placement.fileId) return null;

  const width = Math.max(0.6, placement.w + 0.36);
  const depth = Math.max(0.6, placement.d + 0.36);

  if (scenario.action === "test") {
    const height = Math.max(0.8, scenario.original.height) + 0.5;
    return {
      kind: "shield",
      height,
      width: width + 0.34,
      depth: depth + 0.34,
      centreY: height / 2,
    };
  }

  const height = Math.max(0.8, scenario.scenario.height);
  return { kind: "tower", height, width, depth, centreY: height / 2 };
}

export function GhostTower({ x, z, w, d, fileId }: GhostTowerPlacement) {
  const scenario = useSandboxStore((s) => s.scenario);
  const plan = ghostTowerPlan(scenario, { x, z, w, d, fileId });
  if (!plan) return null;

  const scale: [number, number, number] = [plan.width, plan.height, plan.depth];
  const shield = plan.kind === "shield";

  return (
    <group position={[x, 0, z]} name="refactor-ghost">
      <mesh
        geometry={UNIT_BOX}
        material={shield ? SHIELD_MATERIAL : TOWER_MATERIAL}
        position={[0, plan.centreY, 0]}
        scale={scale}
        renderOrder={6}
      />
      <lineSegments
        geometry={UNIT_EDGES}
        material={shield ? SHIELD_EDGE_MATERIAL : TOWER_EDGE_MATERIAL}
        position={[0, plan.centreY, 0]}
        scale={scale}
        renderOrder={7}
      />
    </group>
  );
}
