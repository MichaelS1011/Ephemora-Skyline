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
 */

import type { CityData, CityDir, CityFile } from './types';
import { threatRank } from './palette';

// ── Placement types ────────────────────────────────────────────────────────

export interface BlockPlacement {
  dir: CityDir;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Representative towers (district skyline), local offsets from the plot centre. */
  skyline: BuildingPlacement[];
}

export interface BuildingPlacement {
  file: CityFile;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface StreetLine {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface DirLayout {
  dir: CityDir;
  blocks: BlockPlacement[];
  buildings: BuildingPlacement[];
  podium: { count: number; x: number; z: number } | null;
  streets: StreetLine[];
  bounds: number; // half-extent of the whole scene
  plazaExtent: number; // half-extent of the central file plaza
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
  return (((h % 1000) / 1000) - 0.5) * 2 * amplitude;
}

// ── Size scales (sqrt so monster files don't dwarf the city) ───────────────

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function blockFootprint(loc: number): number {
  return clamp(8 + Math.sqrt(Math.max(loc, 1)) * 0.3, 8, 20);
}

export function buildingFootprint(loc: number): number {
  return clamp(2.1 + Math.sqrt(Math.max(loc, 1)) * 0.12, 2.1, 4.6);
}

export function buildingHeight(loc: number): number {
  return clamp(2.2 + Math.sqrt(Math.max(loc, 1)) * 0.85, 2.2, 26);
}

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
const BLOCK_GRID_MIN = 30;

function computeLayout(dir: CityDir): DirLayout {
  const files = [...dir.detailFiles].sort((a, b) => buildingHeight(b.linesOfCode) - buildingHeight(a.linesOfCode));
  const children = [...dir.children].sort((a, b) => b.linesOfCode - a.linesOfCode);

  // ── Central plaza: files of THIS directory as a compact grid ────────────
  const buildings: BuildingPlacement[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length)));
  const rows = Math.ceil(files.length / cols);
  const cells = centerOutCells(cols, rows, PLAZA_CELL);

  let maxFoot = 0;
  files.forEach((file, i) => {
    const cell = cells[i] ?? { x: 0, z: 0 };
    const w = buildingFootprint(file.linesOfCode);
    const d = buildingFootprint(file.linesOfCode);
    maxFoot = Math.max(maxFoot, w, d);
    buildings.push({
      file,
      x: cell.x + jitter(file.path, 0.7),
      z: cell.z + jitter(file.path + '|z', 0.7),
      w,
      d,
      h: buildingHeight(file.linesOfCode),
    });
  });

  const plazaExtent = files.length === 0 ? 0 : ((Math.max(cols, rows) - 1) * PLAZA_CELL) / 2 + maxFoot / 2 + 4;

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

    // ── District skyline: representative towers of the whole subtree ──────
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
        const ra = riskScore(a);
        const rb = riskScore(b);
        if (rb !== ra) return rb - ra;
        return b.linesOfCode - a.linesOfCode;
      })
      .slice(0, 6);
    const innerCols = Math.max(1, Math.ceil(Math.sqrt(skylineFiles.length)));
    const innerRows = Math.ceil(skylineFiles.length / innerCols);
    const innerSpacing = Math.min(Math.max(w * 0.3, 5.4), 8.5);
    const innerCells = centerOutCells(innerCols, innerRows, innerSpacing);
    const skyline: BuildingPlacement[] = [...skylineFiles]
      .sort((a, b) => buildingHeight(b.linesOfCode) - buildingHeight(a.linesOfCode))
      .map((file, k) => {
        const cell2 = innerCells[k] ?? { x: 0, z: 0 };
        const fw = buildingFootprint(file.linesOfCode);
        return {
          file,
          x: cell2.x + jitter(file.path, 0.35),
          z: cell2.z + jitter(file.path + '|z', 0.35),
          w: fw,
          d: fw,
          h: buildingHeight(file.linesOfCode),
        };
      });

    blockPlacements.push({
      dir: child,
      x: cell.x + jitter(child.path, 1.1),
      z: cell.z + jitter(child.path + '|z', 1.1),
      w,
      d: w,
      skyline,
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

  let bounds = plazaExtent + 12;
  for (const b of blockPlacements) {
    bounds = Math.max(bounds, Math.abs(b.x) + b.w / 2 + 10, Math.abs(b.z) + b.d / 2 + 10);
  }

  return { dir, blocks: blockPlacements, buildings, podium, streets, bounds, plazaExtent };
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
  const key = focusPath.join('/');
  const hit = perCity.get(key);
  if (hit) return hit;
  const layout = computeLayout(resolveDir(city.tree, focusPath));
  perCity.set(key, layout);
  return layout;
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

export function allFiles(city: CityData): FileHit[] {
  const out: FileHit[] = [];
  walkFiles(city.tree, [], out);
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
  return file.findings.reduce((s, f) => s + (f.severity === 'P0' ? 10 : f.severity === 'P1' ? 7 : 3), 0);
}

/** Files with findings, most risky first — the Security Tour itinerary. */
export function tourStops(city: CityData): FileHit[] {
  return allFiles(city)
    .filter(({ file }) => file.findings.length > 0)
    .sort((a, b) => riskScore(b.file) - riskScore(a.file) || threatRank(b.file.threatLevel) - threatRank(a.file.threatLevel));
}

/** The single most risky file in the city — rendered as a landmark tower. */
export function landmarkFileId(city: CityData): string | null {
  let best: FileHit | null = null;
  for (const hit of allFiles(city)) {
    if (hit.file.findings.length === 0) continue;
    if (!best || riskScore(hit.file) > riskScore(best.file)) best = hit;
  }
  return best?.file.id ?? null;
}
