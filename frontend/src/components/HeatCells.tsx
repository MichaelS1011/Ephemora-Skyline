"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import type { CityData } from "../city/types";
import { useStore, type HeatChannel } from "../stores/useStore";
import { useLodFar } from "../hooks/useLodFar";
import { complexityColor, churnColor, SEVERITY_COLOR, THREAT_COLOR } from "../city/palette";
import { syntheticComplexity } from "../city/mapping";

/**
 * Far-zoom LOD: the whole city collapses into ONE instanced mesh of flat
 * heat cells — a single draw call replacing hundreds of building groups.
 * The color channel is switchable (threat / complexity / churn).
 */

const CELL_HEIGHT = 0.55;

function fileHeatColor(
  channel: HeatChannel,
  file: {
    threatLevel: string;
    findings: Array<{ severity: string }>;
    linesOfCode: number;
    cyclomaticComplexity: number;
    importCount?: number;
    churnScore?: number;
  },
): THREE.Color {
  if (channel === "threat") {
    const worst = file.findings.reduce(
      (max, f) => Math.max(max, f.severity === "P0" ? 3 : f.severity === "P1" ? 2 : 1),
      0,
    );
    if (worst === 0) return new THREE.Color(THREAT_COLOR.safe);
    return new THREE.Color(
      worst === 3 ? SEVERITY_COLOR.P0 : worst === 2 ? SEVERITY_COLOR.P1 : SEVERITY_COLOR.P2,
    );
  }
  if (channel === "complexity") {
    return new THREE.Color(
      complexityColor(syntheticComplexity({ ...file, threatLevel: "safe", findings: [] } as never)),
    );
  }
  // churn — absent data reads as a calm, neutral dark cell
  if (file.churnScore === undefined) return new THREE.Color("#243247");
  return new THREE.Color(churnColor(file.churnScore));
}

export function HeatCells({ layout }: { layout: DirLayout }) {
  const lodFar = useLodFar(layout.bounds);
  const heatChannel = useStore((s) => s.heatChannel);
  const threatFilter = useStore((s) => s.threatFilter);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const cellCount = layout.buildings.length + layout.blocks.length;

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    let i = 0;
    for (const b of layout.buildings) {
      dummy.position.set(b.x, CELL_HEIGHT / 2, b.z);
      dummy.scale.set(b.w * 1.55, 1, b.d * 1.55);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, fileHeatColor(heatChannel, b.file));
      i++;
    }
    for (const blk of layout.blocks) {
      // Blocks aggregate their subtree: worst threat / avg complexity / max churn
      const subtree = allSubtreeFiles(blk.dir);
      const color =
        heatChannel === "threat"
          ? (subtree.findingsBySeverity.P0 ?? 0) > 0
            ? SEVERITY_COLOR.P0
            : (subtree.findingsBySeverity.P1 ?? 0) > 0
              ? SEVERITY_COLOR.P1
              : (subtree.findingsBySeverity.P2 ?? 0) > 0
                ? SEVERITY_COLOR.P2
                : THREAT_COLOR.safe
          : heatChannel === "complexity"
            ? complexityColor(subtree.avgComplexity)
            : churnColor(subtree.maxChurn ?? 0);
      dummy.position.set(blk.x, CELL_HEIGHT / 2, blk.z);
      dummy.scale.set(blk.w * 1.35, 1, blk.d * 1.35);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(color));
      i++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout, heatChannel, cellCount, dummy]);

  // threatFilter dims safe cells by shifting them toward the background tone
  const dimNonMatching = threatFilter !== "all";

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(cellCount, 1)]}
      frustumCulled={false}
      visible={lodFar && cellCount > 0}
    >
      <boxGeometry args={[1, CELL_HEIGHT, 1]} />
      {/* Unlit: heat cells are a data display, not architecture */}
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={dimNonMatching ? 0.8 : 1}
        fog={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function allSubtreeFiles(dir: CityData["tree"]): {
  findingsBySeverity: Record<string, number>;
  avgComplexity: number;
  maxChurn: number | null;
} {
  let complexitySum = 0;
  let complexityCount = 0;
  let maxChurn: number | null = null;
  const findingsBySeverity: Record<string, number> = { P0: 0, P1: 0, P2: 0 };
  const walk = (d: CityData["tree"]): void => {
    for (const f of d.detailFiles) {
      complexitySum += f.cyclomaticComplexity;
      complexityCount++;
      if (f.churnScore !== undefined) maxChurn = Math.max(maxChurn ?? 0, f.churnScore);
    }
    for (const sev of ["P0", "P1", "P2"]) {
      findingsBySeverity[sev] = (findingsBySeverity[sev] ?? 0) + d.findingsBySeverity[sev as "P0"];
    }
    d.children.forEach(walk);
  };
  walk(dir);
  return {
    findingsBySeverity,
    avgComplexity: complexityCount > 0 ? complexitySum / complexityCount / 25 : 0,
    maxChurn,
  };
}
