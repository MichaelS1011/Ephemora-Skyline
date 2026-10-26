/**
 * City layout — deterministic, scale-independent placement.
 *
 * Rules:
 * - The overview of ANY directory shows: one block per child directory +
 *   a central plaza with its own detail files. Repo size changes how deep
 *   the user can drill, never how much is on screen.
 * - Heavy units claim cells nearest the centre (downtown = big blocks,
 *   skyscrapers in the middle of the plaza, suburbs at the rim).
 * - Everything is seeded by path, so the same repo always produces the
 *   same city — different repos produce different cities.
 * - Block districts are ORGANIC: weighted Voronoi cells (Lloyd-relaxed)
 *   replace the rigid block grid. The classic grid remains available via
 *   setLayoutMode('grid').
 *
 * Metric→visual mapping (height, footprint, materials) lives in
 * mapping.ts — renderer-agnostic and portable.
 */

import type { CityData, CityDir, CityFile, CityFinding, Severity } from "./types";
import { formatCount, t, type Lang } from "../i18n";
import { languageColor, threatRank } from "./palette";
import { defaultOverviewPath } from "./overview";
import {
  blockFootprint as blockFootprintOf,
  buildingHeight as heightOf,
  buildingFootprint as footprintOf,
} from "./mapping";
import {
  computeVoronoi,
  cellBoundarySegments,
  polygonMinRadius,
  type VoronoiSite,
} from "./voronoi";
import { generateVoxelLayout, type VoxelLayout } from "./voxels";

// ── Placement types ────────────────────────────────────────────────────────

/**
 * One bar of a wide folder's group strip: it stands for `count` real files of
 * the subtree and is as tall as the tallest among them (same
 * `mapping.buildingHeight` rail as a single building), so the strip keeps the
 * height axis true while replacing "six towers, silence about the rest".
 */
export interface StripBar {
  /** local offset from the plot centre along the strip row */
  x: number;
  z: number;
  /** world-unit width the renderer should draw */
  w: number;
  /** world-unit depth (constant per strip) */
  d: number;
  /** world-unit height = tallest file in this bin */
  h: number;
  /** how many files this bar represents */
  count: number;
  /** language carrying the most lines in the bin */
  language: string;
  /** worst severity in the bin, or null when the bin holds no finding */
  worst: Severity | null;
  /** findings counted across the bin */
  findings: number;
}

/** Bars a strip splits a wide folder into — reads left (riskiest) to right. */
export const STRIP_BARS = 12;
/** Depth of a strip bar in world units. */
const STRIP_DEPTH = 0.7;
/** Gap between the strip row and the kerb it stands against. */
const STRIP_KERB_GAP = 0.6;

/**
 * Where the row stands inside its plot, from the plot centre along z: the kerb
 * the presentation camera is placed AT, in front of the plot's own skyline.
 *
 * It used to be the far kerb, "behind the towers", and that is what it was —
 * measured over the demo city's 23 bars from the shipped overview vantage
 * (azimuth 62°, elevation 39°), only 33.4 % of a bar's camera-facing silhouette
 * stayed clear of its own district's towers there, so the height the strip
 * exists to carry could not be read. No vantage on the key light's side fixes
 * that (the azimuth sweep peaks at 46 %, facing straight down +z), and the
 * opposite side reaches 97 % only by mirroring the row's left-is-riskiest
 * reading and leaving both visible facades unlit. On this kerb the silhouette
 * is 100 % clear with the reading order kept, and the towers give up 3.9 points
 * of their own (83.8 → 79.9). `frontend/tests/strip-kerb-side.test.ts` holds
 * the same relation on its own two-folder city: 100 % clear against 43.5 %.
 */
export function stripRowZ(plotD: number, barD: number): number {
  return plotD / 2 - barD / 2 - STRIP_KERB_GAP;
}

/**
 * The files of a subtree the payload ACTUALLY delivers: the tree's own
 * detail files (mapped or representative) plus every folded file the city
 * shipped in `additionalFiles` under this folder's path. Nothing else is
 * invented — where the payload stops, `groupStrip` refuses to draw.
 */
export function knownSubtreeFiles(dir: CityDir, additional: readonly CityFile[]): CityFile[] {
  const byId = new Map<string, CityFile>();
  const walk = (d: CityDir): void => {
    for (const f of d.detailFiles) byId.set(f.id, f);
    for (const f of d.districtFiles ?? []) byId.set(f.id, f);
    d.children.forEach(walk);
  };
  walk(dir);
  const prefix = dir.path ? `${dir.path}/` : "";
  for (const f of additional) {
    if (!prefix || f.path.startsWith(prefix)) byId.set(f.id, f);
  }
  return [...byId.values()];
}

/**
 * Bin the subtree's known files into a readable strip — only when every file
 * it claims is actually measured. Returns null when the payload does not know
 * all `fileCount` files (an honest strip cannot summarise what it never saw),
 * or when the folder is too small for a strip to say more than the towers do.
 *
 * Order: risk first (`byRisk` — tests stop leading), then height, so the
 * leftmost bar is the district's worst address and heights fall toward the
 * rim. Bins are equal-count, which keeps every bar's `count` a real number of
 * files rather than a fraction of a rounded remainder.
 */
export function groupStrip(
  child: CityDir,
  plotW: number,
  known: readonly CityFile[],
  bars = STRIP_BARS,
): StripBar[] | null {
  if (known.length < child.fileCount) return null;
  if (child.fileCount <= 6) return null;
  const sorted = [...known].sort((a, b) => {
    const r = byRisk(a, b);
    if (r !== 0) return r;
    return heightOf(b) - heightOf(a);
  });
  const n = Math.min(bars, sorted.length);
  const per = Math.ceil(sorted.length / n);
  const usable = Math.max(1, plotW - 1.4);
  const slot = usable / n;
  const out: StripBar[] = [];
  for (let i = 0; i < n; i++) {
    const bin = sorted.slice(i * per, (i + 1) * per);
    if (bin.length === 0) break;
    let h = 0;
    let findings = 0;
    let worstRank = 0;
    const linesByLang = new Map<string, number>();
    for (const f of bin) {
      h = Math.max(h, heightOf(f));
      findings += f.findings.length;
      for (const fd of f.findings) {
        worstRank = Math.max(worstRank, fd.severity === "P0" ? 3 : fd.severity === "P1" ? 2 : 1);
      }
      linesByLang.set(f.language, (linesByLang.get(f.language) ?? 0) + f.linesOfCode);
    }
    const worst: Severity | null =
      worstRank === 3 ? "P0" : worstRank === 2 ? "P1" : worstRank === 1 ? "P2" : null;
    let language = "";
    let bestLines = -1;
    for (const [name, lines] of linesByLang) {
      if (lines > bestLines) {
        bestLines = lines;
        language = name;
      }
    }
    out.push({
      x: -usable / 2 + slot * (i + 0.5),
      z: 0,
      w: slot * 0.72,
      d: STRIP_DEPTH,
      h,
      count: bin.length,
      language,
      worst,
      findings,
    });
  }
  return out;
}

/**
 * The district's underground tally — the two numbers the audit asked to see
 * on the plot itself: how many files of this folder are NOT standing as their
 * own building, and the folder's total. Both come straight from the payload
 * (`remainingFiles`, `fileCount`); nothing here estimates.
 */
export function districtUnderground(dir: CityDir): { hidden: number; total: number } {
  return { hidden: Math.max(0, dir.remainingFiles), total: dir.fileCount };
}

/**
 * The underground line of a bundled plate — the district street sign and the
 * plaza podium render the same payload numbers the same way, in both
 * languages, from here. Words are existing dictionary keys
 * (`hud.filesUnit`, `district.underground`); the numbers come from
 * `remainingFiles` and `fileCount` and are never estimated.
 */
export function undergroundPlateLine(lang: Lang, hidden: number, total: number): string {
  return hidden > 0
    ? `⌄ ${hidden}/${total} ${t(lang, "hud.filesUnit")} ${t(lang, "district.underground")}`
    : `${total} ${t(lang, "hud.filesUnit")}`;
}

export interface BlockPlacement {
  dir: CityDir;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Representative towers (district skyline), local offsets from the plot centre. */
  skyline: BuildingPlacement[];
  /**
   * Group strip for a wide folder: bins over EVERY file of the subtree whose
   * measurements the payload actually delivers (see `groupStrip`). Absent when
   * the subtree is not fully known or small enough to read as towers alone.
   */
  strip?: StripBar[] | null;
}

export interface BuildingPlacement {
  file: CityFile;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /**
   * Honest voxel packing behind this placement (plaza buildings). w/d/h are
   * derived from it (mapping-capped inside the generator), so placement and
   * voxels can never disagree. District skyline towers stay mapping-based in
   * V1 — their `voxels` field is intentionally absent; documented drift, the
   * skyline only needs silhouette proportions, not per-voxel cells.
   */
  voxels?: VoxelLayout | null;
}

export interface StreetLine {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /**
   * A plaza lane whose corridor is narrower than two curb bands carries ONE
   * pavement instead of two: its axis sits on the façade the walkers pass, and
   * the walking band is on the +normal side of the axis as written
   * (`nx = -(z2 - z1), nz = x2 - x1`). Streets never set it.
   */
  oneSided?: boolean;
}

export interface DirLayout {
  dir: CityDir;
  blocks: BlockPlacement[];
  buildings: BuildingPlacement[];
  podium: { count: number; x: number; z: number } | null;
  streets: StreetLine[];
  bounds: number; // half-extent of the whole scene
  plazaExtent: number; // half-extent of the central file plaza
  /** Centre of the central plaza in world XZ — where a level's own files stand. */
  plazaCenter: { x: number; z: number };
  /**
   * Where this level actually is: the centre of the box its own placed
   * geometry fills. Neither the world origin nor the plaza — an organic
   * level's pieces are seeded around the Voronoi field, and its plaza can sit
   * 96.6 m away from the middle of the district it belongs to (root of a
   * 2901-file city) while every flight, the construction crane, the arrow-key
   * turntable and the walk bound assumed (0,0) and framed empty ground.
   * Everything that aims at a level aims at this point instead, and `bounds`
   * is the level's half-extent measured about it.
   */
  centre: { x: number; z: number };
  /**
   * The lane a district chip is really drawn into, in world units: the
   * SMALLEST distance between the centres of any two placed blocks.
   *
   * Why this number and not one read off `bounds`: `bounds` is the level's
   * square — plaza, podium and rim included — so the pitch a uniform grid
   * would give inside it (`2·bounds/√N`, which is what `fieldPx/√N` projects)
   * is optimistic against the real Voronoi placement. Measured through this
   * module's own `getDirLayout` on the 16 block-carrying levels of the repo
   * self-scan (2026-10-26),
   * the model overstates the gap on every level of more than one block — 1.06x
   * to 1.27x — and the two levels the last rounds argued about are the tight
   * ones: `frontend/src` 91.3 px model against a 73.8 px real lane,
   * `docs/reviews` 91.3 px against 81.9 px.
   *
   * The far tier pins every chip with `<Html center>` exactly ON a block
   * centre, so this is the denominator a chip that occupies a rectangle about
   * that point has to answer to: two rectangles centred `d` apart overlap as
   * soon as `(w1 + w2)/2 > d`, and capping EVERY chip at the smallest real `d`
   * therefore makes overdraw impossible for every pair at the same time. It is
   * also the conservative reading under any orbit azimuth — an `<Html>` plate
   * has no depth order, so a pair aligned with the view direction overlaps just
   * the same; only the radial distance says that.
   *
   * One pass over the placed blocks at layout build time, inside the cached
   * `DirLayout` — never a second geometry pass per frame. With fewer than two
   * blocks there is no pair to measure, and the level's own width
   * (`2·bounds`) is the lane, because no chip here has a neighbour to cover.
   * Optional on the type only so the hand-built
   * layout literals in the test tree keep compiling; both shipped producers set
   * it, and `tests/typeFloor.test.ts` pins that they do.
   */
  minBlockPitch?: number;
}

/**
 * The smallest centre-to-centre distance between two placed blocks — see
 * `DirLayout.minBlockPitch`. O(n²) over the level's own plots (a level's
 * children are bounded by the directory, not by the repository), run once per
 * built layout.
 */
function blockMinPitch(blocks: readonly { x: number; z: number }[], noNeighbour: number): number {
  let min = Infinity;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const d = Math.hypot(blocks[i]!.x - blocks[j]!.x, blocks[i]!.z - blocks[j]!.z);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : noNeighbour;
}

// ── Deterministic pseudo-random from path ──────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(seed: string, amplitude: number): number {
  const h = hashString(seed);
  return ((h % 1000) / 1000 - 0.5) * 2 * amplitude;
}

// ── Size scales ────────────────────────────────────────────────────────────
// Height and footprint now come from the metric→visual mapping (mapping.ts):
// height = synthetic complexity, footprint = API surface. Blocks stay
// size-driven — a block IS the size class of its subtree.

export const blockFootprint = blockFootprintOf;

// ── Cell ordering: spiral of cells sorted by distance to centre ────────────

function centerOutCells(cols: number, rows: number, cell: number): Array<{ x: number; z: number }> {
  const cells: Array<{ x: number; z: number; dist: number }> = [];
  const cx = (cols - 1) / 2;
  const cz = (rows - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - cx) * cell;
      const z = (r - cz) * cell;
      cells.push({ x, z, dist: x * x + z * z });
    }
  }
  cells.sort((a, b) => a.dist - b.dist);
  return cells.map(({ x, z }) => ({ x, z }));
}

// ── Layout computation ─────────────────────────────────────────────────────

const PLAZA_CELL = 6.4;
/**
 * Lateral jitter every plaza building gets, on each axis and on each of the two
 * sides of a neighbouring pair — so a grid cell only keeps two buildings apart
 * while it is `PLAZA_JITTER + PLAZA_JITTER` wider than the larger footprint.
 * Measured on a 2901-file city: with the cell at `maxFoot + 0.8` and the widest
 * footprint grown to 6.6 m by its own volume, three pairs of neighbours stood
 * 0.17–0.29 m inside each other.
 */
const PLAZA_JITTER = 0.7;
/** The grid pitch that clears the widest footprint and both jitters. */
const plazaPitch = (maxFoot: number): number =>
  Math.max(PLAZA_CELL, maxFoot + 2 * PLAZA_JITTER + 0.4);
const BLOCK_GRID_MIN = 30;
const PLAZA_SITE_KEY = "__plaza__";

/** Legacy grid layout — retained as the deterministic fallback mode. */
function computeGridLayout(dir: CityDir, additional: readonly CityFile[]): DirLayout {
  const files = [...dir.detailFiles].sort((a, b) => heightOf(b) - heightOf(a));
  const children = [...dir.children].sort((a, b) => b.linesOfCode - a.linesOfCode);

  // ── Central plaza: files of THIS directory as a compact grid ────────────
  const buildings: BuildingPlacement[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)));
  const rows = Math.ceil(files.length / cols);
  // Voxel footprints can outgrow the legacy cell size — the grid cell must
  // clear the largest footprint plus the jitter both neighbours can carry, or
  // they fuse (see `PLAZA_JITTER`).
  const layouts = files.map((file) => generateVoxelLayout(file));
  const maxFoot = layouts.reduce((m, v) => Math.max(m, v.footprintW, v.footprintD), 0);
  const plazaCell = plazaPitch(maxFoot);
  const cells = centerOutCells(cols, rows, plazaCell);

  files.forEach((file, i) => {
    const cell = cells[i] ?? { x: 0, z: 0 };
    // Voxel-true placement: the generator holds the mapping caps itself
    // (footprint [0.8, 1.6]×, height [0.7, 1.4]×), so proportions survive.
    const voxels = layouts[i]!;
    const w = voxels.footprintW;
    const d = voxels.footprintD;
    buildings.push({
      file,
      x: cell.x + jitter(file.path, PLAZA_JITTER),
      z: cell.z + jitter(file.path + "|z", PLAZA_JITTER),
      w,
      d,
      h: voxels.height,
      voxels,
    });
  });

  const plazaExtent =
    files.length === 0 ? 0 : ((Math.max(cols, rows) - 1) * plazaCell) / 2 + maxFoot / 2 + 4;

  // ── Podium: aggregated honesty for files not rendered ────────────────────
  const podium =
    dir.remainingFiles > 0
      ? { count: dir.remainingFiles, x: plazaExtent + 4.5, z: plazaExtent + 4.5 }
      : null;

  // ── Sub-districts: blocks on their own center-out grid ──────────────────
  const blockPlacements: BlockPlacement[] = [];
  const blockW = children.map((c) => blockFootprint(c.linesOfCode));
  const maxBlockW = blockW.length > 0 ? Math.max(...blockW) : 0;
  const blockSpacing = Math.max(BLOCK_GRID_MIN, plazaExtent * 2 + maxBlockW + 6);
  const blockCols = Math.max(1, Math.ceil(Math.sqrt(children.length)));
  const blockRows = Math.ceil(children.length / blockCols);
  const blockCells = centerOutCells(blockCols, blockRows, blockSpacing);

  children.forEach((child, i) => {
    const cell = blockCells[i] ?? { x: 0, z: 0 };
    const w = blockFootprint(child.linesOfCode);
    const skyline = buildSkyline(child, w);
    const strip = groupStrip(child, w, knownSubtreeFiles(child, additional));

    blockPlacements.push({
      dir: child,
      x: cell.x + jitter(child.path, 1.1),
      z: cell.z + jitter(child.path + "|z", 1.1),
      w,
      d: w,
      skyline,
      strip,
    });
  });

  // ── Streets: grid lines between neighbouring block cells + plaza ring ────
  const streets: StreetLine[] = [];
  for (let r = 0; r < blockRows; r++) {
    for (let c = 0; c < blockCols; c++) {
      const i = r * blockCols + c;
      if (i >= children.length) continue;
      const a = blockCells[i]!;
      if (c + 1 < blockCols && i + 1 < children.length) {
        const b = blockCells[i + 1]!;
        streets.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z });
      }
      if (r + 1 < blockRows && i + blockCols < children.length) {
        const b = blockCells[i + blockCols]!;
        streets.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z });
      }
    }
  }
  const ring = plazaExtent + maxFoot / 2 + 2.5;
  if (files.length > 0 || podium) {
    streets.push({ x1: -ring, z1: -ring, x2: ring, z2: -ring });
    streets.push({ x1: ring, z1: -ring, x2: ring, z2: ring });
    streets.push({ x1: ring, z1: ring, x2: -ring, z2: ring });
    streets.push({ x1: -ring, z1: ring, x2: -ring, z2: -ring });
  }

  const framePoints: { x: number; z: number }[] = [];
  frameCorners(framePoints, { x: 0, z: 0, w: plazaExtent * 2, d: plazaExtent * 2 });
  for (const b of blockPlacements) frameCorners(framePoints, b);
  for (const b of buildings) frameCorners(framePoints, b);
  if (podium) framePoints.push({ x: podium.x, z: podium.z });
  const { centre, bounds } = levelFrame(framePoints);

  return {
    dir,
    blocks: blockPlacements,
    buildings,
    podium,
    streets,
    bounds,
    plazaExtent,
    plazaCenter: { x: 0, z: 0 },
    centre,
    minBlockPitch: blockMinPitch(blockPlacements, 2 * bounds),
  };
}

/**
 * Where a level is, and how wide it is — from everything that stands on it.
 *
 * Not the world origin: an organic level's pieces are placed around their own
 * Voronoi cells, and its plaza (which is where the camera used to be aimed)
 * can sit 96 m away from the centre of the geometry it belongs to. Both the
 * frame's centre and its half-extent are therefore read off the placed
 * rectangles themselves, in the level's own square convention (Chebyshev
 * half-extent, + margin), so the Minimap's picture, the walk bound, the
 * far-LOD threshold and the visibility rescue all talk about the same square.
 */
function levelFrame(
  points: readonly { x: number; z: number }[],
  margin = 12,
): { centre: { x: number; z: number }; bounds: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!Number.isFinite(minX)) return { centre: { x: 0, z: 0 }, bounds: margin };
  return {
    centre: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    bounds: Math.max(maxX - minX, maxZ - minZ) / 2 + margin,
  };
}

/** The four corners of a placed rectangle, for `levelFrame`. */
function frameCorners(
  out: { x: number; z: number }[],
  r: { x: number; z: number; w: number; d: number },
): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) out.push({ x: r.x + (sx * r.w) / 2, z: r.z + (sz * r.d) / 2 });
}

/**
 * Representative towers of a district's subtree (up to 6, risk-ordered).
 * V1 note: skyline towers stay mapping-based (heightOf/footprintOf) on
 * purpose — the plaza buildings carry the voxel-true placements; the
 * skyline only needs comparable silhouette proportions (documented drift).
 */
function buildSkyline(child: CityDir, blockW: number): BuildingPlacement[] {
  let reps = child.districtFiles ?? [];
  if (reps.length === 0) {
    // Fallback for older payloads: walk the subtree's detail files
    const walked: CityFile[] = [];
    const walk = (d: CityDir): void => {
      walked.push(...d.detailFiles);
      d.children.forEach(walk);
    };
    walk(child);
    reps = walked;
  }
  const skylineFiles = [...reps]
    .sort((a, b) => {
      const byRiskFirst = byRisk(a, b);
      if (byRiskFirst !== 0) return byRiskFirst;
      return b.linesOfCode - a.linesOfCode;
    })
    .slice(0, 6);
  const innerCols = Math.max(1, Math.ceil(Math.sqrt(skylineFiles.length)));
  const innerRows = Math.ceil(skylineFiles.length / innerCols);
  const innerSpacing = Math.min(Math.max(blockW * 0.3, 5.4), 8.5);
  const innerCells = centerOutCells(innerCols, innerRows, innerSpacing);
  return [...skylineFiles]
    .sort((a, b) => heightOf(b) - heightOf(a))
    .map((file, k) => {
      const cell = innerCells[k] ?? { x: 0, z: 0 };
      const fw = footprintOf(file);
      return {
        file,
        x: cell.x + jitter(file.path, 0.35),
        z: cell.z + jitter(file.path + "|z", 0.35),
        w: fw,
        d: fw,
        h: heightOf(file),
      };
    });
}

/**
 * Voronoi layout — districts as organic, Lloyd-relaxed cells weighted by
 * subtree size. Same DirLayout contract as the grid: blocks at cell
 * centroids, plaza in the central cell, cell boundaries as streets.
 */
function computeVoronoiLayout(dir: CityDir, additional: readonly CityFile[]): DirLayout {
  const files = [...dir.detailFiles].sort((a, b) => heightOf(b) - heightOf(a));
  const children = [...dir.children].sort((a, b) => b.linesOfCode - a.linesOfCode);

  const buildings: BuildingPlacement[] = [];
  const blockPlacements: BlockPlacement[] = [];

  // Needed plaza extent from the center-out grid (same packing as grid mode)
  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)));
  const rows = Math.ceil(files.length / cols);
  const voxelByFile = new Map<string, VoxelLayout>();
  let maxFoot = 0;
  files.forEach((file) => {
    const voxels = generateVoxelLayout(file);
    voxelByFile.set(file.id, voxels);
    maxFoot = Math.max(maxFoot, voxels.footprintW, voxels.footprintD);
  });
  // Voxel footprints can outgrow the legacy cell size — keep neighbours apart
  // by the pitch that clears the widest one plus both jitters.
  const plazaGridCell = plazaPitch(maxFoot);
  const cells = centerOutCells(cols, rows, plazaGridCell);
  const neededPlazaExtent =
    files.length === 0 ? 0 : ((Math.max(cols, rows) - 1) * plazaGridCell) / 2 + maxFoot / 2 + 4;

  const maxBlockW =
    children.length > 0 ? Math.max(...children.map((c) => blockFootprint(c.linesOfCode))) : 0;

  // Scene half-extent so every block's plot fits inside its cell
  const halfExtent = Math.max(
    38,
    Math.sqrt(children.length + 1) * maxBlockW * 0.9 + neededPlazaExtent,
  );
  const plazaWeight = Math.max(
    files.reduce((s, f) => s + f.linesOfCode, 0),
    1,
  );
  const sites: VoronoiSite[] = [
    { key: PLAZA_SITE_KEY, weight: plazaWeight },
    ...children.map((c) => ({ key: c.path || c.name, weight: Math.max(c.linesOfCode, 1) })),
  ];
  const vCells = computeVoronoi(sites, halfExtent, 4);
  const plazaCell = vCells.find((c) => c.key === PLAZA_SITE_KEY);
  const plazaRadius = plazaCell
    ? polygonMinRadius(plazaCell.polygon, plazaCell.centroid)
    : halfExtent;

  // Compress the plaza grid if its cell is tighter than the grid wants — but
  // never past the point where two buildings stand inside each other. The
  // footprints are measurements and do not shrink with the grid (a file with
  // 6 000 lines and deep nesting IS 7.7 m wide), while the spacing and the
  // jitter of a pair both scale with `compression`, so the pitch after
  // compression has to clear the widest footprint:
  //   plazaGridCell·c ≥ maxFoot + 2·PLAZA_JITTER·c
  // Where the cell cannot offer that, the plaza keeps the size its own files
  // need — the alternative is two files occupying one lot.
  const compression =
    neededPlazaExtent > 0
      ? Math.min(
          1,
          Math.max(
            (maxFoot + 0.2) / Math.max(1e-6, plazaGridCell - 2 * PLAZA_JITTER),
            Math.min(1, (plazaRadius * 0.82) / neededPlazaExtent),
          ),
        )
      : 1;
  const plazaExtent = neededPlazaExtent * compression;
  const plazaCenter = plazaCell?.centroid ?? { x: 0, z: 0 };

  files.forEach((file, i) => {
    const cell = cells[i] ?? { x: 0, z: 0 };
    const voxels = voxelByFile.get(file.id) ?? generateVoxelLayout(file);
    buildings.push({
      file,
      x: plazaCenter.x + cell.x * compression + jitter(file.path, PLAZA_JITTER * compression),
      z:
        plazaCenter.z + cell.z * compression + jitter(file.path + "|z", PLAZA_JITTER * compression),
      w: voxels.footprintW,
      d: voxels.footprintD,
      h: voxels.height,
      voxels,
    });
  });

  const podium =
    dir.remainingFiles > 0
      ? {
          count: dir.remainingFiles,
          x: plazaCenter.x + plazaExtent + 4.5,
          z: plazaCenter.z + plazaExtent + 4.5,
        }
      : null;

  for (const vCell of vCells) {
    if (vCell.key === PLAZA_SITE_KEY) continue;
    const child = children.find((c) => (c.path || c.name) === vCell.key);
    if (!child) continue;
    const cellRadius = polygonMinRadius(vCell.polygon, vCell.centroid);
    // The plot must sit comfortably inside its organic cell
    const w = Math.min(blockFootprint(child.linesOfCode), Math.max(cellRadius * 1.35, 8));
    const skyline = buildSkyline(child, w);
    const strip = groupStrip(child, w, knownSubtreeFiles(child, additional));
    blockPlacements.push({
      dir: child,
      x: vCell.centroid.x + jitter(child.path, 0.8),
      z: vCell.centroid.z + jitter(child.path + "|z", 0.8),
      w,
      d: w,
      skyline,
      strip,
    });
  }

  // Streets = the organic cell boundaries (shared edges drawn once)
  const streets = cellBoundarySegments(vCells);

  // Where this level is: the box its placed content fills — the plots, the
  // plaza with its ring, the podium. The Voronoi cells themselves are NOT part
  // of it: they tile the whole seeded square, so their bounding box is the
  // field, which is always centred on the origin and says nothing about where
  // the level's own buildings stand.
  const framePoints: { x: number; z: number }[] = [];
  for (const b of blockPlacements) frameCorners(framePoints, b);
  for (const b of buildings) frameCorners(framePoints, b);
  frameCorners(framePoints, {
    x: plazaCenter.x,
    z: plazaCenter.z,
    w: plazaExtent * 2,
    d: plazaExtent * 2,
  });
  if (podium) framePoints.push({ x: podium.x, z: podium.z });
  const { centre, bounds: frameBounds } = levelFrame(framePoints);
  const bounds = Math.max(plazaExtent + 12, frameBounds);

  return {
    dir,
    blocks: blockPlacements,
    buildings,
    podium,
    streets,
    bounds,
    plazaExtent,
    plazaCenter: plazaCenter,
    centre,
    minBlockPitch: blockMinPitch(blockPlacements, 2 * bounds),
  };
}

// ── Layout mode ────────────────────────────────────────────────────────────

export type LayoutMode = "voronoi" | "grid";

let activeLayoutMode: LayoutMode = "voronoi";

/** Switch the placement algorithm; caches are keyed per mode, no stale hits. */
export function setLayoutMode(mode: LayoutMode): void {
  activeLayoutMode = mode;
}

export function getLayoutMode(): LayoutMode {
  return activeLayoutMode;
}

// ── Construction pacing ────────────────────────────────────────────────────

/** One tower per beat — a figure needs this long to walk over and place it. */
const BUILD_BEAT_MS = 200;
/** A handful of towers still gets a moment; the build never snaps shut. */
const BUILD_MIN_MS = 4000;
/** A monorepo must not hold the user hostage to an animation. */
const BUILD_MAX_MS = 20_000;

/**
 * Total construction time. Proportional to the number of towers that rise,
 * floored and capped — so the wait answers to the size of the project instead
 * of normalising every city to the same six seconds.
 */
export function constructionDuration(unitTotal: number): number {
  const n = Math.max(unitTotal, 1);
  return Math.min(BUILD_MAX_MS, Math.max(BUILD_MIN_MS, n * BUILD_BEAT_MS));
}

/** Milliseconds between two rising towers. */
export function constructionStep(unitTotal: number): number {
  return constructionDuration(unitTotal) / Math.max(unitTotal, 1);
}

export type BuildUnitKind = "district" | "tower" | "building";

/** A district plot lands as a flat pad — its "roof" is the curb height. */
const PLOT_ROOF_H = 0.3;

/**
 * One work point per rising unit: where a builder stands, and how high the
 * block it places ends up. Emitted by the same walk that writes the rise
 * offsets, so a site can never drift out of step with its animation.
 */
export interface BuildSite {
  kind: BuildUnitKind;
  /** the unit's centre, world XZ */
  x: number;
  z: number;
  /** the builder's spot — just clear of the footprint */
  doorX: number;
  doorZ: number;
  /** height the rising unit ends at; the carried block lands on its roof */
  h: number;
  /** the unit's own footprint size — how close a viewer must be to see it */
  span: number;
  /** the block's colour — the language the unit is actually made of */
  color: string;
  /** ms into the build when this unit starts to rise */
  offset: number;
  /**
   * What stands on this plot, in the payload's own words: the file id for a
   * building. EPHE-AI EA-01 needs it because a plot is the one part of a
   * resident's address that survives re-scanning the same folder — file ids are
   * minted from the path. Absent for units that carry no file (a district block
   * stands for many files, so it names none).
   */
  unitId?: string;
}

export interface BuildPlan {
  /**
   * epoch-ms each district plot opens. Index-aligned with `layout.blocks`,
   * but the slots themselves are handed out in build order — centre-out — so
   * these numbers are NOT ascending in index order.
   */
  blockAt: number[];
  /** epoch-ms each skyline tower rises, index-aligned per block */
  skylineAt: number[][];
  /** epoch-ms each of this level's own plaza files rises */
  plazaAt: number[];
  /** epoch-ms the podium lands, at its own distance from the plaza */
  podiumAt: number;
  /**
   * Work points in rise order. The podium is absent: nothing is carried and
   * raised at its spot — it is one aggregate marker that lands whole.
   */
  sites: BuildSite[];
  /** rising units — the pacing input, counted by the same walk that schedules */
  total: number;
  /** ms between two units */
  step: number;
  /** wall-clock length of the construction */
  durationMs: number;
}

/** The language a directory is mostly written in — its district's wall colour. */
function dominantLanguage(languages: Record<string, number>): string {
  let best = "";
  let lines = -1;
  for (const [name, n] of Object.entries(languages)) {
    if (n > lines) {
      lines = n;
      best = name;
    }
  }
  return best;
}

/**
 * The construction schedule, built centre-out.
 *
 * Two rules, both geometric:
 * — a plot opens before its own towers (one run per district, never split),
 * — runs are scheduled by how far they stand from the plaza, so the level's
 *   own files — the centre — rise first and the districts fill outward ring by
 *   ring. The podium is one more run at its own radius; a rule that reads "the
 *   city grows from the middle" has to hold for every unit in it, not just the
 *   ones that happen to be listed last.
 *
 * Because rise order now equals distance order, the built extent can only
 * grow, and the crane can follow the city's SIZE instead of hopping from one
 * district to the next.
 */
export function planConstruction(
  layout: Pick<DirLayout, "blocks" | "buildings" | "podium">,
  baseMs: number,
  centre: { x: number; z: number } = { x: 0, z: 0 },
): BuildPlan {
  const total =
    layout.blocks.reduce((n, b) => n + 1 + b.skyline.length, 0) +
    layout.buildings.length +
    (layout.podium ? 1 : 0);
  const step = constructionStep(total);
  const blockAt: number[] = new Array<number>(layout.blocks.length).fill(0);
  const skylineAt: number[][] = new Array<number[]>(layout.blocks.length).fill([]);
  const plazaAt: number[] = new Array<number>(layout.buildings.length).fill(0);
  const sites: BuildSite[] = [];
  let cursor = 0;
  let podiumAt = baseMs;
  const slot = (): number => baseMs + cursor++ * step;

  const runs: Array<{ radius: number; place: () => void }> = [];
  layout.blocks.forEach((b, i) => {
    runs.push({
      radius: Math.hypot(b.x - centre.x, b.z - centre.z),
      place: () => {
        const at = slot();
        blockAt[i] = at;
        sites.push({
          kind: "district",
          x: b.x,
          z: b.z,
          doorX: b.x,
          doorZ: b.z + b.d / 2 + 1.1,
          h: PLOT_ROOF_H,
          span: Math.max(b.w, b.d),
          color: languageColor(dominantLanguage(b.dir.languages)),
          offset: at - baseMs,
        });
        const atPerTower: number[] = [];
        for (const t of b.skyline) {
          const towerAt = slot();
          atPerTower.push(towerAt);
          sites.push({
            kind: "tower",
            x: b.x + t.x,
            z: b.z + t.z,
            doorX: b.x + t.x,
            doorZ: b.z + t.z + t.d / 2 + 0.7,
            h: t.h,
            span: Math.max(t.w, t.d),
            color: languageColor(t.file.language),
            offset: towerAt - baseMs,
          });
        }
        skylineAt[i] = atPerTower;
      },
    });
  });
  layout.buildings.forEach((b, i) => {
    runs.push({
      radius: Math.hypot(b.x - centre.x, b.z - centre.z),
      place: () => {
        const at = slot();
        plazaAt[i] = at;
        sites.push({
          kind: "building",
          x: b.x,
          z: b.z,
          doorX: b.x,
          doorZ: b.z + b.d / 2 + 0.9,
          h: b.h,
          span: Math.max(b.w, b.d),
          color: languageColor(b.file.language),
          offset: at - baseMs,
          unitId: b.file.id,
        });
      },
    });
  });
  if (layout.podium) {
    const p = layout.podium;
    runs.push({
      radius: Math.hypot(p.x - centre.x, p.z - centre.z),
      place: () => {
        podiumAt = slot();
      },
    });
  }
  runs.sort((a, b) => a.radius - b.radius);
  for (const run of runs) run.place();

  return {
    blockAt,
    skylineAt,
    plazaAt,
    podiumAt,
    sites,
    total,
    step,
    durationMs: total * step,
  };
}

// ── The overview shot ──────────────────────────────────────────────────────

/** How wide a frame a finished city gets, as a multiple of its half-extent. */
export const OVERVIEW_FACTOR = 1.6;

/**
 * The far-LOD's exit threshold, mirrored from `hooks/useLodFar` (which cannot
 * be imported here — it reads the store, the store reads this module).
 * `tests/lodFraming.test.ts` pins the two together.
 */
const FAR_LOD_EXIT_FACTOR = 3.8;
const FAR_LOD_EXIT_FLOOR = 170 * 0.7;
/** How much of that band an overview flight may use and still be a CITY. */
export const FAR_LOD_SAFE_RATIO = 0.92;

/** The distance beyond which the renderer swaps the city for a heat grid. */
export function farLodExitDistance(bounds: number): number {
  return Math.max(FAR_LOD_EXIT_FLOOR, bounds * FAR_LOD_EXIT_FACTOR);
}

export interface OverviewShot {
  dist: number;
  targetY: number;
  elevation?: number;
}

/**
 * The shot that frames a whole level.
 *
 * Two bounds on one number, and they pull against each other:
 * — the level must FIT: its footprint needs `OVERVIEW_FACTOR × bounds`, and a
 *   crown needs its own distance to clear the 52° vertical field of view,
 * — the level must still be DRAWN: past `farLodExitDistance(bounds)` the
 *   renderer stops mounting buildings and shows the instanced heat grid
 *   instead, so a flight that lands out there frames nothing but tiles.
 *
 * The height term used to be `tallest × 2.2 + 24` — a guess that, on a level
 * holding one 40 m tower inside 50 m of ground, asked for 118 m where the heat
 * grid takes over at 119 m. The camera arrived 1 cm inside the wrong band and
 * the district you had just drilled into drew as flat plates (measured: 23
 * scene objects instead of 164 on the same level of the same city, decided by
 * the easing's float noise). A frustum-derived height term needs 1.35 × the
 * crown instead of 2.2 ×, and the ceiling makes the answer robust either way.
 */
export function overviewShot(bounds: number, tallest: number): OverviewShot {
  const fits = Math.max(
    bounds * OVERVIEW_FACTOR,
    // targetY lifts the eye line to 40 % of the crown, so 60 % of it has to
    // clear the half field of view: 0.6 × tallest / tan(26°) = 1.23 ×, +10 %.
    tallest * 1.35,
    24,
  );
  const drawn = farLodExitDistance(bounds) * FAR_LOD_SAFE_RATIO;
  return {
    dist: Math.min(fits, drawn),
    targetY: Math.max(1.5, tallest * 0.4),
    elevation: 0.32,
  };
}

/**
 * Vertical clearance a crown needs at this camera (52° vertical fov, eye line
 * 21° below horizontal) — measured, not guessed: it is the factor that kept a
 * rising tower inside the frame in the plot-height shots it replaces.
 */
const CROWN_FACTOR = 1.55;

/** Tightest shot the crane gets: the street-level establishing distance. */
const CRANE_MIN_DIST = 26;

export interface CraneShot {
  dist: number;
  targetY: number;
  /** Where the shot looks: the level's centre, which is not the world origin. */
  x: number;
  z: number;
}

/**
 * The shot for a city that currently spans `radius` and stands `top` tall,
 * centred on `centre`.
 *
 * `OVERVIEW_FACTOR` is the one the 'built' reveal uses, so the crane ends
 * where that flight begins instead of fighting it. The min distance keeps the
 * FIRST small building big on screen — which is the whole point: the frame is
 * sized to what actually stands, so the builders are large while the centre is
 * built and the reveal of scale comes as the rings fill.
 */
export function craneShot(
  radius: number,
  top: number,
  centre: { x: number; z: number } = { x: 0, z: 0 },
): CraneShot {
  // The crane pulls back smoothly as the city grows. The distance scales with
  // the built radius so the user sees a continuous zoom-out from street level
  // to the presentation view — the pull-back IS the reveal, no separate flight.
  return {
    dist: Math.max(CRANE_MIN_DIST, radius * 2.2 + 12, top * CROWN_FACTOR),
    targetY: Math.max(1.5, top * 0.35),
    x: centre.x,
    z: centre.z,
  };
}

/**
 * How much city stands `elapsed` ms into the build: the outermost footprint
 * edge and the tallest crown among the units that have STARTED rising.
 *
 * Both are maxima over a set that only grows, so the pair is monotone — the
 * crane can pull back and never has to push in again. The radius is measured
 * from the level's own centre, which for an organic layout is not the world
 * origin.
 */
export function builtExtent(
  sites: readonly BuildSite[],
  elapsed: number,
  centre: { x: number; z: number } = { x: 0, z: 0 },
): { radius: number; top: number } {
  let radius = 0;
  let top = 0;
  for (const s of sites) {
    if (s.offset > elapsed) continue;
    radius = Math.max(radius, Math.hypot(s.x - centre.x, s.z - centre.z) + s.span / 2);
    top = Math.max(top, s.h);
  }
  return { radius, top };
}

// ── Memoised access ────────────────────────────────────────────────────────

const layoutCache = new WeakMap<CityData, Map<string, DirLayout>>();

export function resolveDir(root: CityDir, focusPath: string[]): CityDir {
  let node = root;
  for (const seg of focusPath) {
    const next = node.children.find((c) => c.name === seg);
    if (!next) break;
    node = next;
  }
  return node;
}

export function getDirLayout(city: CityData, focusPath: string[]): DirLayout {
  let perCity = layoutCache.get(city);
  if (!perCity) {
    perCity = new Map();
    layoutCache.set(city, perCity);
  }
  const key = `${activeLayoutMode}:${focusPath.join("/")}`;
  const hit = perCity.get(key);
  if (hit) return hit;
  const target = resolveDir(city.tree, focusPath);
  const additional = city.additionalFiles ?? [];
  const layout =
    activeLayoutMode === "voronoi"
      ? computeVoronoiLayout(target, additional)
      : computeGridLayout(target, additional);
  perCity.set(key, layout);
  return layout;
}

/**
 * What a plot draws for a child district: its representative skyline towers.
 * Older payloads carry no skyline, and then the layout walks the subtree's
 * rendered files instead — the same fallback `buildSkyline` uses, so the
 * panel never explains a picture that is not on screen.
 */
function skylineReps(child: CityDir): number {
  const direct = child.districtFiles?.length ?? 0;
  if (direct > 0) return direct;
  let n = 0;
  const walk = (d: CityDir): void => {
    n += d.detailFiles.length;
    d.children.forEach(walk);
  };
  walk(child);
  return n;
}

/** The caps a city was laid out under, as shipped in its payload. */
export interface CityDrawLimits {
  skylineTowers: number;
  buildingsPerDirectory: number;
}

/** How many files a view draws, and where the rest of them are. */
export interface DistrictDraw {
  /** files in this subtree */
  totalFiles: number;
  /** files sitting directly in this folder */
  filesHere: number;
  /** of those, how many stand as their own building */
  drawnHere: number;
  /** of those, how many the view folds into the podium marker */
  folded: number;
  /** sub-district plots this view draws */
  plots: number;
  /** files living inside those plots */
  filesBelow: number;
  /** towers drawn across those plots */
  towers: number;
  /** towers per plot — from the payload's limits, else the widest one here */
  skylineTowers: number;
}

/**
 * Count what the current view actually draws. Every number comes from the tree
 * the mapper built: a folder's own files are the plaza buildings (capped per
 * folder), everything else is either a sub-district plot with a handful of
 * skyline towers, or folded into one podium marker.
 */
export function districtDraw(dir: CityDir, limits?: CityDrawLimits): DistrictDraw {
  const reps = dir.children.map(skylineReps);
  const observedMax = reps.length > 0 ? Math.max(...reps) : 0;
  const skylineTowers = limits?.skylineTowers ?? observedMax;
  const filesBelow = dir.children.reduce((s, c) => s + c.fileCount, 0);
  const filesHere = Math.max(0, dir.fileCount - filesBelow);
  const drawnHere = dir.detailFiles.length;
  return {
    totalFiles: dir.fileCount,
    filesHere,
    drawnHere,
    folded: Math.max(0, filesHere - drawnHere),
    plots: dir.children.length,
    filesBelow,
    towers: reps.reduce((s, n) => s + Math.min(n, skylineTowers || n), 0),
    skylineTowers,
  };
}

/**
 * Say why a district with 92 files draws 6 buildings — in the words the
 * numbers support. Returns nothing when the view draws every file it holds.
 */
export function explainDistrictDraw(
  dir: CityDir,
  limits: CityDrawLimits | undefined,
  lang: Lang,
): string[] {
  const draw = districtDraw(dir, limits);
  const lines: string[] = [];
  if (draw.folded > 0) {
    const cap = limits?.buildingsPerDirectory ?? draw.drawnHere;
    lines.push(
      t(lang, draw.drawnHere === 1 ? "layout.drawnHereOne" : "layout.drawnHere", {
        drawn: draw.drawnHere,
        files: draw.filesHere,
        cap,
      }),
    );
  }
  if (draw.plots > 0 && draw.filesBelow > 0) {
    lines.push(
      t(lang, draw.plots === 1 ? "layout.subDistrictsOne" : "layout.subDistrictsMany", {
        files: t(lang, draw.filesBelow === 1 ? "ctx.filesOne" : "ctx.filesMany", {
          n: formatCount(lang, draw.filesBelow),
        }),
        plots: draw.plots,
        towers: draw.skylineTowers,
      }),
    );
  }
  return lines;
}

// ── Search / navigation / tour helpers ─────────────────────────────────────

export interface FileHit {
  file: CityFile;
  chain: string[]; // focus path of the directory containing the file
}

function walkFiles(dir: CityDir, chain: string[], out: FileHit[]): void {
  for (const f of dir.detailFiles) out.push({ file: f, chain });
  for (const c of dir.children) walkFiles(c, [...chain, c.name], out);
}

/**
 * Per-city memoization: allFiles() walks the whole tree, and it runs in
 * per-keystroke (SearchBar) and per-render (InfoPanel, ContextCard,
 * SecurityTour) code paths — cache the flat index per CityData instance
 * (city data is immutable after load, so WeakMap is safe).
 */
const allFilesCache = new WeakMap<CityData, FileHit[]>();

export function allFiles(city: CityData): FileHit[] {
  const cached = allFilesCache.get(city);
  if (cached) return cached;
  const out: FileHit[] = [];
  walkFiles(city.tree, [], out);
  const seen = new Set(out.map((hit) => hit.file.id));
  for (const file of city.additionalFiles ?? []) {
    if (!seen.has(file.id)) out.push({ file, chain: file.path.split("/").slice(0, -1) });
  }
  allFilesCache.set(city, out);
  return out;
}

export function findFileById(city: CityData, id: string): FileHit | null {
  return allFiles(city).find((h) => h.file.id === id) ?? null;
}

export function searchFiles(city: CityData, query: string, limit = 7): FileHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allFiles(city)
    .filter(
      ({ file }) =>
        file.name.toLowerCase().includes(q) ||
        file.path.toLowerCase().includes(q) ||
        file.language.toLowerCase().includes(q),
    )
    .sort((a, b) => b.file.linesOfCode - a.file.linesOfCode)
    .slice(0, limit);
}

/** Weighted risk of a file (P0 dominates) — used for landmark + tour order. */
export function riskScore(file: CityFile): number {
  return file.findings.reduce(
    (s, f) => s + (f.severity === "P0" ? 10 : f.severity === "P1" ? 7 : 3),
    0,
  );
}

/**
 * Compare two files for any "what is most risky" decision.
 *
 * A fixture that exists to show a vulnerable snippet outscored the shipped
 * code in the first self-scan: 35 of 56 findings sat in `*.test.ts`, and the
 * tool named its own scanner test as the project's highest risk. Test code is
 * still scanned and still listed — it just stops leading.
 */
export function byRisk(a: CityFile, b: CityFile): number {
  const aCode = a.role === "test" ? 0 : 1;
  const bCode = b.role === "test" ? 0 : 1;
  return bCode - aCode || riskScore(b) - riskScore(a);
}

/** Files with findings, most risky first — the Security Tour itinerary. */
const tourStopsCache = new WeakMap<CityData, FileHit[]>();

export function tourStops(city: CityData): FileHit[] {
  const cached = tourStopsCache.get(city);
  if (cached) return cached;
  const stops = allFiles(city)
    .filter(({ file }) => file.findings.length > 0)
    .sort(
      (a, b) =>
        byRisk(a.file, b.file) || threatRank(b.file.threatLevel) - threatRank(a.file.threatLevel),
    );
  tourStopsCache.set(city, stops);
  return stops;
}

/** The single most risky file in the city — rendered as a landmark tower. */
const landmarkCache = new WeakMap<CityData, string | null>();

export function landmarkFileId(city: CityData): string | null {
  const cached = landmarkCache.get(city);
  if (cached !== undefined) return cached;
  let best: FileHit | null = null;
  for (const hit of allFiles(city)) {
    if (hit.file.findings.length === 0) continue;
    if (!best || byRisk(hit.file, best.file) < 0) best = hit;
  }
  const id = best?.file.id ?? null;
  landmarkCache.set(city, id);
  return id;
}

// ── Finding search ─────────────────────────────────────────────────────────

export interface FindingHit {
  file: CityFile;
  finding: CityFinding;
  /** Position in the file's FULL findings list — the findingKey contract. */
  index: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

/** Total ordering over findings: severity first, then risk, then message. */
function compareFindingHits(a: FindingHit, b: FindingHit): number {
  const bySeverity = SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity];
  if (bySeverity !== 0) return bySeverity;
  const byFileRisk = byRisk(a.file, b.file);
  if (byFileRisk !== 0) return byFileRisk;
  const byMessage = a.finding.message.localeCompare(b.finding.message);
  if (byMessage !== 0) return byMessage;
  const byPath = a.file.path.localeCompare(b.file.path);
  if (byPath !== 0) return byPath;
  return a.index - b.index;
}

/**
 * Full-text search over findings: ruleId (falling back to the finding type),
 * message, severity token, and the containing file's name/path — all
 * case-insensitive contains. Ordered P0 < P1 < P2, then file risk, then
 * message; fully deterministic for the search dropdown and its keyboard
 * navigation.
 */
export function searchFindings(city: CityData, query: string, limit = 5): FindingHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: FindingHit[] = [];
  for (const { file } of allFiles(city)) {
    file.findings.forEach((finding, index) => {
      const subject = (finding.ruleId ?? finding.type).toLowerCase();
      if (
        subject.includes(q) ||
        finding.message.toLowerCase().includes(q) ||
        finding.severity.toLowerCase().includes(q) ||
        file.name.toLowerCase().includes(q) ||
        file.path.toLowerCase().includes(q)
      ) {
        hits.push({ file, finding, index });
      }
    });
  }
  return hits.sort(compareFindingHits).slice(0, limit);
}

/**
 * V3 (reveal pulse): the file whose building on the level the reveal frames
 * carries the worst REAL finding of the city — or null when there is none.
 *
 * A demo finding (`provenance: "demo"`) is a synthetic example, not a scan
 * result: it must never light up as the city's worst finding (the demo is
 * honest about being nobody's analysis). Only a file that is actually drawn on
 * the framed level may pulse — a plaza building or a district's skyline tower
 * (most repos keep their files inside districts, and the skyline tower IS the
 * building that represents the file on the overview). A pulse on something not
 * on screen would be decoration, not information. The ordering is the triage
 * order: severity first (P0 < P1 < P2), then file risk, then message/path, so
 * the choice is deterministic and matches what the queue would present first.
 */
export function revealPulseFileId(city: CityData, focusPath: string[]): string | null {
  let best: FindingHit | null = null;
  for (const hit of allFiles(city)) {
    for (let index = 0; index < hit.file.findings.length; index++) {
      const finding = hit.file.findings[index]!;
      if (finding.provenance === "demo") continue;
      const candidate = { file: hit.file, finding, index };
      if (!best || compareFindingHits(candidate, best) < 0) best = candidate;
    }
  }
  if (!best) return null;
  const layout = getDirLayout(city, focusPath);
  const onPlaza = layout.buildings.some((b) => b.file.id === best!.file.id);
  const onSkyline = layout.blocks.some((blk) =>
    blk.skyline.some((t) => t.file.id === best!.file.id),
  );
  return onPlaza || onSkyline ? best.file.id : null;
}

/** Duration of the reveal flight out to the overview — the same number the
 *  camera tween in CityScene is asked for and the moment the reveal pulse may
 *  begin (the pulse starts when the flight ends). */
export const REVEAL_FLIGHT_MS = 1400;

/**
 * V3: the reveal pulse arming decision — one damped pulse on the beacon of the
 * building that carries the worst REAL finding, timed to begin when the reveal
 * flight ends. Reduced motion collapses the flight to an instant write, so the
 * pulse begins at once there (Building then consumes it without animating). A
 * city whose findings are synthetic (demo) or that has no findings at all arms
 * nothing — the pulse is evidence, never decoration.
 */
export function armRevealPulse(
  cityData: CityData | null,
  now: number,
  reduced: boolean,
): { fileId: string; startAt: number } | null {
  const fileId = cityData ? revealPulseFileId(cityData, defaultOverviewPath(cityData)) : null;
  if (!fileId) return null;
  return { fileId, startAt: now + (reduced ? 0 : REVEAL_FLIGHT_MS) };
}
