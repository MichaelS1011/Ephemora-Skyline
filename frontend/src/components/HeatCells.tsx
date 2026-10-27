"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { surfaceMatrix } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";
import type { DirLayout } from "../city/layout";
import type { CityData, CityFile } from "../city/types";
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
import { NO_HISTORY, STOOD, NOT_YET, stoodAt, timeCensus, type ChurnMeta } from "../city/stoodAt";

/**
 * Far-zoom LOD: the whole city collapses into ONE instanced mesh of flat
 * heat cells — a single draw call replacing hundreds of building groups.
 * The color channel is switchable (threat / complexity / churn / time).
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
 * - time: the census decision from `city/stoodAt.ts` rides the silhouette, not
 *   the hue. A file that already stood at the slider's date rises to the top of
 *   the same band; a file that had not been committed yet sinks to a foundation
 *   stub — the site is empty ground plus rubble, which is what it was at that
 *   date. A file the churn pass never dated keeps the calm plate UNTOUCHED: it
 *   is not "not yet", and the two must never share a shape.
 *
 * Monotone in every channel: the height never contradicts the colour.
 */
export const CELL_RISE = {
  /** the flat plate every calm tile keeps */
  BASE: CELL_HEIGHT,
  /** units of additional height per unit of the channel's 0..1 value */
  VALUE_UNITS: 3.2,
} as const;

/**
 * The time channel's three silhouettes, on the band the other channels use.
 * `HOLLOW` is deliberately below `BASE`: a not-yet site is readable as "less
 * than the calm plate", never as a full tile in a different hue.
 */
export const TIME_RISE = {
  STOOD: CELL_RISE.BASE + CELL_RISE.VALUE_UNITS,
  HOLLOW: 0.18,
} as const;

/**
 * Inks for the time channel — deliberately achromatic. Every hue in the
 * palette already answers another channel (threat reds, churn green→orange,
 * CX cyan→magenta, reviewed green), and "stood" is a new meaning, so it takes
 * none of them: daylight steel for a tower that stood, pit-black for the hollow
 * of one that did not, and the same "nothing to say" slate the churn channel
 * already spends on an undated file.
 */
export const TIME_INK = {
  stood: "#9fb4cc",
  notYet: "#0d1420",
  noHistory: "#243247",
} as const;

export function heatCellRise(
  channel: HeatChannel,
  input: { findingCount: number; value: number; stood?: string },
): number {
  if (channel === "threat")
    return Math.max(CELL_RISE.BASE, findingBarHeightForCount(input.findingCount));
  if (channel === "time") {
    if (input.stood === STOOD) return TIME_RISE.STOOD;
    if (input.stood === NOT_YET) return TIME_RISE.HOLLOW;
    if (input.stood === undefined) {
      // Blocks are analog: `value` is the share of the subtree's dated files
      // that already stood, mapped onto the same band as the file silhouettes
      // — a fully-not-yet block sinks with its files, never posing as calm.
      const v = Math.max(0, Math.min(1, input.value));
      return TIME_RISE.HOLLOW + v * (TIME_RISE.STOOD - TIME_RISE.HOLLOW);
    }
    // NO_HISTORY and anything unanswerable keep the untouched calm plate.
    return CELL_RISE.BASE;
  }
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
  stood?: string,
): THREE.Color {
  // Keep the dark semantic tiles distinct from the daylight ground.
  const tile = (hex: string): THREE.Color => new THREE.Color(hex);
  if (channel === "time") {
    if (stood === STOOD) return tile(TIME_INK.stood);
    if (stood === NOT_YET) return tile(TIME_INK.notYet);
    return tile(TIME_INK.noHistory);
  }
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
  // The time channel's question. Committed only when the slider is released
  // (debounced in HeatmapToggle), so this effect — which rewrites every
  // instance matrix — never runs per frame while the thumb moves.
  const heatDateMs = useStore((s) => s.heatDateMs);
  const churnMeta = useStore((s) => s.cityData?.meta) as ChurnMeta;
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
      const stood = heatChannel === "time" ? stoodAt(b.file, heatDateMs, churnMeta) : undefined;
      const rise = heatCellRise(heatChannel, {
        findingCount: b.file.findings.length,
        value:
          heatChannel === "complexity" ? syntheticComplexity(b.file) : (b.file.churnScore ?? 0),
        stood,
      });
      dummy.position.set(b.x, rise / 2, b.z);
      dummy.scale.set(b.w * CELL_SPREAD.building, rise / CELL_HEIGHT, b.d * CELL_SPREAD.building);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.setColorAt(i, fileHeatColor(heatChannel, b.file, colorblind, stood));
      i++;
    }
    for (const blk of layout.blocks) {
      // Blocks aggregate their subtree: worst threat / avg complexity / max churn
      const subtree = allSubtreeFiles(blk.dir);
      const state = blockThreatState(blk.dir);
      const timeShare =
        heatChannel === "time" ? subtreeTimeShare(blk.dir, heatDateMs, churnMeta) : null;
      const color =
        heatChannel === "time"
          ? timeShare === null
            ? TIME_INK.noHistory
            : new THREE.Color(TIME_INK.notYet).lerp(new THREE.Color(TIME_INK.stood), timeShare)
          : heatChannel === "threat"
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
            : heatChannel === "time"
              ? (timeShare ?? 0)
              : (subtree.maxChurn ?? 0),
        // A block is analog: its height carries the share of its dated subtree
        // files that already stood, so an all-not-yet block sinks toward the
        // hollow and a fully-standing one rises. A block with nothing to say
        // (share null) keeps the calm plate via the same branch as no-history.
        stood: heatChannel === "time" && timeShare === null ? NO_HISTORY : undefined,
      });
      dummy.position.set(blk.x, blockRise / 2, blk.z);
      dummy.scale.set(
        blk.w * CELL_SPREAD.block,
        blockRise / CELL_HEIGHT,
        blk.d * CELL_SPREAD.block,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.setColorAt(i, new THREE.Color(color as THREE.ColorRepresentation));
      i++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout, heatChannel, heatDateMs, churnMeta, colorblind, cellCount, dummy, surface]);

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

/**
 * The share of a block's DATED subtree files that already stood at the
 * slider's date — null when the subtree holds no dated file at all, which is
 * the no-history case and must render as the untouched plate, never as 0.
 * Undated files are left out of numerator and denominator alike: a file the
 * churn pass never named says nothing about the date, so it may not vote.
 */
export function subtreeTimeShare(
  dir: CityData["tree"],
  dateMs: number | null,
  meta: ChurnMeta,
): number | null {
  const files: CityFile[] = [];
  const walk = (d: CityData["tree"]): void => {
    files.push(...d.detailFiles);
    d.children.forEach(walk);
  };
  walk(dir);
  const c = timeCensus(files, dateMs ?? NaN, meta);
  const answerable = c.stood + c.notYet;
  return answerable === 0 ? null : c.stood / answerable;
}
