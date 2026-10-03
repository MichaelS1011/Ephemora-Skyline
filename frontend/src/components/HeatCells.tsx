"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import type { CityData } from "../city/types";
import { useStore, type HeatChannel } from "../stores/useStore";
import { useLodFar } from "../hooks/useLodFar";
import {
  complexityColor,
  churnColor,
  severityColor,
  liftHexForDusk,
  THREAT_COLOR,
  UNCHECKED_COLOR,
} from "../city/palette";
import { isUncheckedClean } from "../city/provenance";
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
    unverifiedBy?: string[];
  },
  colorblind: boolean,
): THREE.Color {
  // Every far-view tile is lifted off the dusk ground (see liftHexForDusk).
  const tile = (hex: string): THREE.Color => new THREE.Color(liftHexForDusk(hex));
  if (channel === "threat") {
    const worst = file.findings.reduce(
      (max, f) => Math.max(max, f.severity === "P0" ? 3 : f.severity === "P1" ? 2 : 1),
      0,
    );
    if (worst === 0) return tile(isUncheckedClean(file) ? UNCHECKED_COLOR : THREAT_COLOR.safe);
    return tile(
      worst === 3
        ? severityColor("P0", colorblind)
        : worst === 2
          ? severityColor("P1", colorblind)
          : severityColor("P2", colorblind),
    );
  }
  if (channel === "complexity") {
    return tile(
      complexityColor(
        syntheticComplexity({ ...file, threatLevel: "safe", findings: [] } as never),
        colorblind,
      ),
    );
  }
  // churn — absent data reads as a calm, neutral dark cell
  if (file.churnScore === undefined) return tile("#243247");
  return tile(churnColor(file.churnScore, colorblind));
}

export function HeatCells({ layout }: { layout: DirLayout }) {
  const lodFar = useLodFar(layout.bounds);
  const heatChannel = useStore((s) => s.heatChannel);
  const threatFilter = useStore((s) => s.threatFilter);
  const colorblind = useStore((s) => s.prefs.colorblind);
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
      mesh.setColorAt(i, fileHeatColor(heatChannel, b.file, colorblind));
      i++;
    }
    for (const blk of layout.blocks) {
      // Blocks aggregate their subtree: worst threat / avg complexity / max churn
      const subtree = allSubtreeFiles(blk.dir);
      const color =
        heatChannel === "threat"
          ? (subtree.findingsBySeverity.P0 ?? 0) > 0
            ? severityColor("P0", colorblind)
            : (subtree.findingsBySeverity.P1 ?? 0) > 0
              ? severityColor("P1", colorblind)
              : (subtree.findingsBySeverity.P2 ?? 0) > 0
                ? severityColor("P2", colorblind)
                : blk.dir.unverifiedFiles === blk.dir.fileCount &&
                    (blk.dir.unverifiedFiles ?? 0) > 0
                  ? UNCHECKED_COLOR
                  : THREAT_COLOR.safe
          : heatChannel === "complexity"
            ? complexityColor(subtree.avgComplexity, colorblind)
            : churnColor(subtree.maxChurn ?? 0, colorblind);
      dummy.position.set(blk.x, CELL_HEIGHT / 2, blk.z);
      dummy.scale.set(blk.w * 1.35, 1, blk.d * 1.35);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(liftHexForDusk(color)));
      i++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout, heatChannel, colorblind, cellCount, dummy]);

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

/**
 * The values a far-zoom district cell is painted with.
 *
 * `avgComplexity` is the mean of `syntheticComplexity` — the exact quantity
 * that sets a building's height and a zoomed-in cell's colour — so the same
 * code cannot read hot at one zoom and tame at another. It used to be a
 * private `mean(cyclomatic) / 25`: a different measure again, on a rail from
 * before the counter learned to see `&&`, `||`, ternaries and bare `else`.
 * Measured over this project's 93 first-party files, the mean cyclomatic of a
 * district is 33.1 at the median — so `/25` pinned half the city at the last
 * colour of the ramp, and the channel discriminated between nothing.
 */
export function allSubtreeFiles(dir: CityData["tree"]): {
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
      complexitySum += syntheticComplexity(f);
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
    avgComplexity: complexityCount > 0 ? complexitySum / complexityCount : 0,
    maxChurn,
  };
}
