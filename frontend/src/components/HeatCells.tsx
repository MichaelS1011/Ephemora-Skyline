"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { surfaceMatrix } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";
import type { DirLayout } from "../city/layout";
import type { CityData } from "../city/types";
import { useStore, type HeatChannel } from "../stores/useStore";
import { useLodFar } from "../hooks/useLodFar";
import {
  complexityColor,
  churnColor,
  severityColor,
  threatColor,
  UNCHECKED_COLOR,
} from "../city/palette";
import { isUncheckedClean } from "../city/provenance";
import { blockThreatState, syntheticComplexity, findingBarHeightForCount } from "../city/mapping";

/**
 * Far-zoom LOD: the whole city collapses into ONE instanced mesh of flat
 * heat cells — a single draw call replacing hundreds of building groups.
 * The color channel is switchable (threat / complexity / churn).
 */

const CELL_HEIGHT = 0.55;

/**
 * How much wider a far-zoom cell is drawn than the plot it stands on.
 *
 * A cell is a legible tile, not a footprint: at 200+ units out a file's own
 * plot is a few pixels, so the tile is grown to stay clickable-looking. The
 * overhang is a fact about the GROUND, because the tile is what covers it —
 * `render/ground` aims its untouched band by these numbers, through
 * `groundFrameRadius`, and `tests/lookDev.test.ts` asserts the promise with
 * them. A cell drawn wider than this constant admits would silently put heat
 * tiles on graded ground.
 */
export const CELL_SPREAD = { building: 1.55, block: 1.35 } as const;

/**
 * How high a far-zoom cell stands.
 *
 * The grid used to be one flat plate for every file: at 200+ units out the
 * whole city was the same 0.55 units tall, so the only thing separating a P0
 * district from a clean one was the tile's hue — and the silhouette of the
 * Totalen, the view a reader uses to find where to look, carried no information
 * at all. Height now carries the SAME quantity as the colour, per channel:
 *
 * - threat: the finding bar law from `city/mapping` — one cell rises as many
 *   units as its file has findings, worst-severity files are simply the tallest
 *   ones in the field. A clean and an unverified file stay flat, so "nothing
 *   here" never outshouts "everything here".
 * - complexity / churn: the very number that sets the hue, scaled onto the same
 *   band, so a hot tile is also a tall tile and the ramp survives a grey print.
 *
 * Monotone in every channel: the height never contradicts the colour.
 */
export const CELL_RISE = {
  /** the flat plate every calm tile keeps */
  BASE: CELL_HEIGHT,
  /** units of additional height per unit of the channel's 0..1 value */
  VALUE_UNITS: 3.2,
} as const;

export function heatCellRise(
  channel: HeatChannel,
  input: { findingCount: number; value: number },
): number {
  if (channel === "threat")
    return Math.max(CELL_RISE.BASE, findingBarHeightForCount(input.findingCount));
  const v = Math.max(0, Math.min(1, input.value));
  return CELL_RISE.BASE + v * CELL_RISE.VALUE_UNITS;
}

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
  // Keep the dark semantic tiles distinct from the daylight ground.
  const tile = (hex: string): THREE.Color => new THREE.Color(hex);
  if (channel === "threat") {
    const worst = file.findings.reduce(
      (max, f) => Math.max(max, f.severity === "P0" ? 3 : f.severity === "P1" ? 2 : 1),
      0,
    );
    if (worst === 0)
      return tile(isUncheckedClean(file) ? UNCHECKED_COLOR : threatColor("safe", colorblind));
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
  const surface = useWorldSurface();
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
      const rise = heatCellRise(heatChannel, {
        findingCount: b.file.findings.length,
        value:
          heatChannel === "complexity" ? syntheticComplexity(b.file) : (b.file.churnScore ?? 0),
      });
      dummy.position.set(b.x, rise / 2, b.z);
      dummy.scale.set(b.w * CELL_SPREAD.building, rise / CELL_HEIGHT, b.d * CELL_SPREAD.building);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.setColorAt(i, fileHeatColor(heatChannel, b.file, colorblind));
      i++;
    }
    for (const blk of layout.blocks) {
      // Blocks aggregate their subtree: worst threat / avg complexity / max churn
      const subtree = allSubtreeFiles(blk.dir);
      const state = blockThreatState(blk.dir);
      const color =
        heatChannel === "threat"
          ? state === "P0"
            ? severityColor("P0", colorblind)
            : state === "P1"
              ? severityColor("P1", colorblind)
              : state === "P2"
                ? severityColor("P2", colorblind)
                : state === "unchecked"
                  ? UNCHECKED_COLOR
                  : threatColor("safe", colorblind)
          : heatChannel === "complexity"
            ? complexityColor(subtree.avgComplexity, colorblind)
            : churnColor(subtree.maxChurn ?? 0, colorblind);
      const subtreeTotal =
        (blk.dir.findingsBySeverity.P0 ?? 0) +
        (blk.dir.findingsBySeverity.P1 ?? 0) +
        (blk.dir.findingsBySeverity.P2 ?? 0);
      // The payload's subtree tally, not just the findings of drawn files —
      // a folded finding still lifts the tile it lives under.
      const blockRise = heatCellRise(heatChannel, {
        findingCount: subtreeTotal,
        value:
          heatChannel === "complexity"
            ? Math.min(1, subtree.avgComplexity)
            : (subtree.maxChurn ?? 0),
      });
      dummy.position.set(blk.x, blockRise / 2, blk.z);
      dummy.scale.set(
        blk.w * CELL_SPREAD.block,
        blockRise / CELL_HEIGHT,
        blk.d * CELL_SPREAD.block,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.setColorAt(i, new THREE.Color(color));
      i++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout, heatChannel, colorblind, cellCount, dummy, surface]);

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
