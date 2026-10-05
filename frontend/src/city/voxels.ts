/**
 * Voxel building layout — the contract between the data layer and the
 * renderer for "honest buildings": a file's geometry is derived from its
 * real code. One voxel conceptually equals one code line; the layout packs
 * sections (functions/classes) as strata and expresses nesting depth as
 * terraced insets, so "big but simple" and "small but tangled" look
 * different (spec §5–7).
 *
 * ETPPE V1 STATUS: contract + real packing generator. Sections pack as
 * strata bottom-up (file order), nesting depth terraces the footprint,
 * volume is honest (1 voxel = 1 code line) and capped by VOXEL_BUDGET
 * through slab degradation from the building's end.
 *
 * Budget rule (spec §21): detailed per-voxel cells are only produced up to
 * VOXEL_BUDGET cells per building; larger files degrade to closed slabs —
 * the silhouette stays identical, only the lazy voxel materialization is
 * skipped for degraded sections.
 */

import type { CityFile } from "./types";
import { buildingFootprint, buildingHeight } from "./mapping";

/** One named code region of a file (function / class / module body). */
export interface VoxelSectionSpec {
  name: string;
  kind: "function" | "class" | "module" | "imports";
  start: number; // 1-based first line
  end: number; // 1-based last line (inclusive)
  codeLines: number; // non-blank, non-comment lines in range
  depth: number; // max nesting/indentation depth in range (0 = top level)
}

export type VoxelCellKind = "code" | "comment";

export interface VoxelCell {
  /** Grid position relative to the building's base center, in voxels. */
  x: number;
  y: number;
  z: number;
  kind: VoxelCellKind;
}

export interface VoxelSectionLayout {
  name: string;
  kind: VoxelSectionSpec["kind"];
  startLine: number;
  endLine: number;
  /** World-space offset of this section's voxel origin within the building. */
  base: { x: number; z: number };
  /** Detail=false sections have no cells (slab fallback, closed silhouette). */
  detail: boolean;
  cells: VoxelCell[];
  codeLines: number;
  depth: number;
}

export interface VoxelLayout {
  /** World-unit footprint (matches the plaza placement bounding box). */
  footprintW: number;
  footprintD: number;
  /**
   * Top of the packed stack in world units — exactly where the highest voxel
   * of this building ends, so no geometry is ever drawn above the height the
   * layout reports (and none is missing under it).
   */
  height: number;
  voxelSize: number;
  sections: VoxelSectionLayout[];
  /** Number of code voxels the layout represents (cell count + slab counts). */
  totalVoxels: number;
}

/** Max lazily-materializable cells per building — the perf deckel. */
export const VOXEL_BUDGET = 6000;
/** World units per voxel edge — constant per city for comparability. */
export const VOXEL_SIZE = 0.55;
/**
 * Widest base a building may claim to keep its volume under the height rail —
 * 8.8 m, the size of the largest district plot's smallest neighbour, so a
 * volume that needs more ground than the API-surface rail allows still gets
 * it without becoming a tower.
 */
const MAX_BASE_EDGE = 16;

// ── Packing helpers (all pure, all deterministic — no Math.random) ─────────

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Sections to pack, in strict file order (start asc; ties broken by end,
 * then by input position). Files without section data (old payloads, demo
 * cities) degrade to a single synthetic "module" section spanning the whole
 * file — still volume-honest, since totalVoxels follows its codeLines.
 */
function normalizeSections(file: CityFile): VoxelSectionSpec[] {
  const fallbackLOC = Math.max(1, file.linesOfCode);
  if (!file.sections || file.sections.length === 0) {
    return [
      {
        name: file.name,
        kind: "module",
        start: 1,
        end: fallbackLOC,
        codeLines: fallbackLOC,
        depth: 0,
      },
    ];
  }
  return file.sections
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => a.spec.start - b.spec.start || a.spec.end - b.spec.end || a.index - b.index)
    .map(({ spec }) => spec);
}

/**
 * Voxel grid + world footprint for the whole building, derived from the
 * code volume and held by the mapping handrails so plaza grid and skyline
 * proportions survive (the FORM follows the code, the SCALE stays urban).
 *
 * The base is the square grid whose packed stack comes closest to the
 * mapping height. Sizing the base by the height it has to carry is what keeps
 * the reported height equal to the drawn one: the old plan took the SMALLEST
 * base that could fit under the height CEILING and then clamped the NUMBER
 * down, so the silhouette the renderer drew and the height the layout, the
 * crane and the pick box used disagreed (measured on a 2901-file city: 76 % of
 * plaza buildings drew a stack on average 95 m above their own placement
 * height; one 535-line file stood 156 m tall on a 42.7 m number).
 *
 * The footprint rail [0.8, 1.6]× is a floor and a preference, not a ceiling
 * for volume that has nowhere else to go: a base wider than 1.6× is opened
 * only as far as it takes to bring the stack back under the height rail. A
 * file with 6 000 code lines and deep nesting IS a broad building; hiding that
 * by letting it grow through the sky instead would trade one lie for another.
 *
 * The terrace inset is part of the packing math and therefore part of the
 * search: a deep section only keeps its middle columns, so a tangled file
 * needs a wider base than a flat one to reach the same height.
 */
function planBase(
  file: CityFile,
  specs: VoxelSectionSpec[],
): {
  footW: number;
  footD: number;
  gw: number;
  gd: number;
} {
  const bh = buildingHeight(file);
  const fp = buildingFootprint(file);
  // Nearest voxel row to each rail edge: the grid cannot hit a world-unit
  // bound exactly, and pretending otherwise costs a whole floor of height.
  const edgeLo = Math.max(1, Math.round((fp * 0.8) / VOXEL_SIZE));
  const railHi = Math.max(edgeLo, Math.round((fp * 1.6) / VOXEL_SIZE));
  const stackAt = (edge: number): number => floorsFor(specs, edge) * VOXEL_SIZE;
  // The narrowest base whose stack still fits under the height ceiling.
  let fitting = railHi;
  while (stackAt(fitting) > bh * 1.4 && fitting < MAX_BASE_EDGE) fitting++;
  const edgeHi = Math.max(railHi, fitting);
  // The best height inside the range; ties go to the narrower base, so a
  // building never spreads wider than its own volume requires.
  let best = edgeLo;
  let bestErr = Infinity;
  for (let edge = edgeLo; edge <= edgeHi; edge++) {
    const err = Math.abs(stackAt(edge) - bh);
    if (err < bestErr - 1e-9) {
      bestErr = err;
      best = edge;
    }
  }
  const footW = best * VOXEL_SIZE;
  return { footW, footD: footW, gw: best, gd: best }; // square base in V1
}

/**
 * How many floors `specs` stack on a square grid of `edge` voxels — the exact
 * arithmetic `packStrata` performs, without materializing the cells. Shared by
 * the base search and the packing so the planned height can never disagree
 * with the packed one.
 */
function floorsFor(specs: VoxelSectionSpec[], edge: number): number {
  const inset = Math.floor((edge - 1) / 2);
  return specs.reduce((floors, spec) => {
    const cut = Math.min(Math.max(spec.depth, 0), inset);
    const side = Math.max(1, edge - 2 * cut);
    return floors + Math.ceil(spec.codeLines / (side * side));
  }, 0);
}

/**
 * Which sections keep per-voxel detail: the maximal bottom prefix whose
 * summed cells still fit the VOXEL_BUDGET. Degradation therefore starts at
 * the building's END (top, farthest from the source); slabs keep their
 * codeLines/base so the renderer can draw closed floors — totalVoxels
 * always stays the full, honest number.
 */
function planDetailFlags(specs: VoxelSectionSpec[]): boolean[] {
  let cumulative = 0;
  let busted = false;
  return specs.map((spec) => {
    if (busted) return false;
    if (cumulative + spec.codeLines > VOXEL_BUDGET) {
      busted = true;
      return false;
    }
    cumulative += spec.codeLines;
    return true;
  });
}

/**
 * Pack the sections as connected strata, bottom-up in file order. Each
 * section fills its own floors of the (possibly inset) base grid, row by
 * row, column by column, from one corner — 1 voxel per code line.
 * Nesting depth terraces the stratum: `depth` outer rings are dropped on
 * all four sides (clamped so ≥ 1 cell per axis remains), so "small but
 * tangled" grows a stepped tower where "big but simple" stays a slab.
 */
function packStrata(
  specs: VoxelSectionSpec[],
  gw: number,
  gd: number,
): { sections: VoxelSectionLayout[]; floors: number } {
  const detailFlags = planDetailFlags(specs);
  const sections: VoxelSectionLayout[] = [];
  let floorCursor = 0;

  specs.forEach((spec, i) => {
    // Terrace inset: drop `depth` rings, but keep at least one column/row.
    const insetX = Math.min(Math.max(spec.depth, 0), Math.floor((gw - 1) / 2));
    const insetZ = Math.min(Math.max(spec.depth, 0), Math.floor((gd - 1) / 2));
    const iw = gw - 2 * insetX;
    const id = gd - 2 * insetZ;
    const area = iw * id;
    const floors = Math.ceil(spec.codeLines / area);
    const detail = detailFlags[i] ?? false;
    // World offset of this section's voxel origin (its inset grid corner),
    // relative to the building's base center.
    const base = { x: (insetX - gw / 2) * VOXEL_SIZE, z: (insetZ - gd / 2) * VOXEL_SIZE };

    const cells: VoxelCell[] = [];
    if (detail) {
      let remaining = spec.codeLines;
      for (let f = 0; f < floors && remaining > 0; f++) {
        for (let rz = 0; rz < id && remaining > 0; rz++) {
          for (let cx = 0; cx < iw && remaining > 0; cx++) {
            // Section-relative grid position at voxel centers, 0-based within
            // the section's (possibly inset) footprint. The world transform
            // is `base + cell × VOXEL_SIZE` (VoxelMesh) — base already carries
            // the inset + building-centering offset in world units. Composing
            // both here would double-apply the offset (reviewed).
            cells.push({
              x: cx + 0.5,
              y: floorCursor + f,
              z: rz + 0.5,
              kind: "code", // V1: per-line comment data lands later
            });
            remaining--;
          }
        }
      }
    }

    sections.push({
      name: spec.name,
      kind: spec.kind,
      startLine: spec.start,
      endLine: spec.end,
      base,
      detail,
      cells,
      codeLines: spec.codeLines,
      depth: spec.depth,
    });
    floorCursor += floors;
  });

  return { sections, floors: floorCursor };
}

/** Where a source line lives in the voxel layout (voxel-focus V3). */
export interface VoxelHit {
  sectionIndex: number;
  cellIndex: number;
  cell: VoxelCell;
}

/**
 * Locate the voxel that represents a 1-based source line. Finds the section
 * whose [startLine, endLine] contains the line — when ranges overlap, the
 * smallest range wins (the most specific region). The cell is the section's
 * `line − startLine`-th materialized cell: cells are packed row by row in
 * file order, so the n-th code line of a section fills the n-th cell
 * (clamped into the materialized range). Returns null when there is no
 * layout, no sections, the line falls outside every range, or the matched
 * section degraded to a slab (detail=false — nothing materialized to point
 * at). Pure + deterministic.
 */
export function findVoxelForLine(layout: VoxelLayout, line: number): VoxelHit | null {
  let bestIndex: number | null = null;
  let bestSpan = Infinity;
  for (let i = 0; i < layout.sections.length; i++) {
    const section = layout.sections[i]!;
    if (line < section.startLine || line > section.endLine) continue;
    const span = section.endLine - section.startLine;
    if (span < bestSpan) {
      bestIndex = i;
      bestSpan = span;
    }
  }
  if (bestIndex === null) return null;
  const section = layout.sections[bestIndex]!;
  if (!section.detail || section.cells.length === 0) return null;
  const ordinal = clamp(line - section.startLine, 0, section.cells.length - 1);
  const cell = section.cells[ordinal];
  if (!cell) return null;
  return { sectionIndex: bestIndex, cellIndex: ordinal, cell };
}

/**
 * Build the voxel layout for one file. Deterministic: the same file always
 * produces the same building. Volume honesty: totalVoxels == Σ section
 * codeLines (== linesOfCode for payloads without sections) — one voxel per
 * code line, budget or not. Files without section data degrade to a single
 * "module" stratum; huge volumes degrade to closed slabs from the top down.
 *
 * `height` is the top of the packed stack — the number the renderer draws,
 * the plaza placement, the pick volume and the crane all agree with it. The
 * mapping height is what the base was chosen to reach, so the two track each
 * other; where the integer voxel grid cannot, the stack wins and the height
 * tells the truth about it.
 */
export function generateVoxelLayout(file: CityFile): VoxelLayout {
  const specs = normalizeSections(file);
  const totalVoxels = specs.reduce((sum, spec) => sum + spec.codeLines, 0);
  const { footW, footD, gw, gd } = planBase(file, specs);
  const { sections, floors } = packStrata(specs, gw, gd);

  return {
    footprintW: footW,
    footprintD: footD,
    height: Math.max(VOXEL_SIZE, floors * VOXEL_SIZE),
    voxelSize: VOXEL_SIZE,
    sections,
    totalVoxels,
  };
}
