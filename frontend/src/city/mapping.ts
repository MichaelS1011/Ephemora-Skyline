/**
 * Metric → visual mapping — the single source of truth for how data
 * dimensions become shapes, materials and erosion. Pure functions over
 * CityFile, no rendering, no React: fully unit-testable and portable to
 * the Babylon renderer (Phase 2) unchanged.
 *
 * Dimensions:
 * - HEIGHT    = synthetic complexity (cyclomatic + depth proxy + size)
 * - FOOTPRINT = API surface (exported symbols) — decoupled from height
 * - SURFACE   = git erosion (churn score → rough "under construction")
 * - MATERIAL  = graphite (healthy) / glass (dead code) / neon (findings)
 */

import type { CityData, CityFile, Severity } from "./types";

// ── Normalization references (what counts as "maxed out") ─────────────────

export const NORM_REFERENCE = {
  /**
   * Cyclomatic complexity ≥ this saturates the cyclomatic factor. Calibrated
   * to the share of files that max out, not to the raw number: the counter
   * behind this metric used to miss `&&`, `||`, ternaries and bare `else`
   * while counting comments, so fixing it moved a real project's median from
   * 12 to 22. 40 keeps the skyline's saturation rate where 25 had it (26 % vs
   * 27 % of files) — the reference tracks the metric, not the taste.
   */
  cyclomatic: 40,
  /** Import count ≥ this saturates the depth proxy (coupling) */
  imports: 12,
  /** LOC ≥ this saturates the size factor */
  loc: 2000,
  /** Exported symbols ≥ this saturate the API-surface footprint */
  exports: 24,
} as const;

/**
 * Weight table of the synthetic complexity — edit here to rebalance the
 * skyline. Weights must sum to 1.
 */
export const COMPLEXITY_WEIGHTS = {
  cyclomatic: 0.45,
  depthProxy: 0.3,
  loc: 0.25,
} as const;

// ── Factors (all 0..1) ─────────────────────────────────────────────────────

export function cyclomaticFactor(file: CityFile): number {
  return Math.min(file.cyclomaticComplexity / NORM_REFERENCE.cyclomatic, 1);
}

/**
 * AST-depth proxy until the Rust/WASM core delivers real parse trees:
 * import count (coupling ≈ indirection depth) dominates.
 */
export function astDepthProxyFactor(file: CityFile): number {
  return Math.min((file.importCount ?? 0) / NORM_REFERENCE.imports, 1);
}

export function locFactor(file: CityFile): number {
  return Math.min(Math.sqrt(Math.max(file.linesOfCode, 1)) / Math.sqrt(NORM_REFERENCE.loc), 1);
}

/** 0..1 synthetic complexity — weighted blend of the three factors */
export function syntheticComplexity(file: CityFile): number {
  const w = COMPLEXITY_WEIGHTS;
  return (
    w.cyclomatic * cyclomaticFactor(file) +
    w.depthProxy * astDepthProxyFactor(file) +
    w.loc * locFactor(file)
  );
}

// ── Shape scales ───────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Building height from synthetic complexity (2.2 .. 34 world units) */
export function buildingHeight(file: CityFile): number {
  return heightForComplexity(syntheticComplexity(file));
}

/**
 * The height rail as a readout axis: 0 .. 1 synthetic complexity mapped onto
 * the same 2.2 .. 34 world units `buildingHeight` uses. The far ends are the
 * saturation rails themselves — a building of height 34 is one whose
 * cyclomatic, coupling and size ALL reach `NORM_REFERENCE` — so a measuring
 * mast drawn with this function states exactly what the skyline measures.
 */
export function heightForComplexity(c: number): number {
  return clamp(2.2 + Math.pow(Math.max(0, Math.min(1, c)), 0.9) * 31.8, 2.2, 34);
}

/**
 * Inverse of the mast: the complexity value a drawn height stands for. A
 * street sign quotes the tallest file of its plot in the SAME coordinates as
 * the measuring mast, so the number and the rail it sits on agree by
 * construction, not by convention. (Outside the clamp's linear zone the
 * inversion is exact; the clamped ends resolve to 0 and 1.)
 */
export function complexityForHeight(h: number): number {
  if (h <= 2.2) return 0;
  if (h >= 34) return 1;
  return Math.pow((h - 2.2) / 31.8, 1 / 0.9);
}

/** Where the mast puts its ticks — complexity values, monotone upward. */
export const COMPLEXITY_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Which threat verdict a folder earns — the far-zoom heat tile's colour key. */
export type BlockThreatState = "P0" | "P1" | "P2" | "unchecked" | "safe";

/**
 * The district's threat verdict, ranked over ALL files of its subtree (the
 * payload's own tally), not just the ones drawn.
 *
 * `unchecked` used to require EVERY file to be unverified — a district of 900
 * files with 500 files no scanner ever saw painted itself `safe` in the heat
 * grid: the loudest claim the tile can make, with the grey population
 * swallowed by exactly the zoom level a reader uses to look for it. Any
 * unverified file now keeps the tile grey — the same decision
 * `isUncheckedClean` makes per file.
 */
export function blockThreatState(dir: {
  findingsBySeverity: { P0: number; P1: number; P2: number };
  unverifiedFiles?: number;
}): BlockThreatState {
  if (dir.findingsBySeverity.P0 > 0) return "P0";
  if (dir.findingsBySeverity.P1 > 0) return "P1";
  if (dir.findingsBySeverity.P2 > 0) return "P2";
  if ((dir.unverifiedFiles ?? 0) > 0) return "unchecked";
  return "safe";
}

/**
 * Footprint (width AND depth) from API surface: exported symbols.
 * Falls back to the legacy LOC scale when the dimension is missing
 * (older payloads, API-fallback scans).
 */
export function buildingFootprint(file: CityFile): number {
  if (file.exportedSymbols !== undefined) {
    return clamp(2.1 + Math.sqrt(file.exportedSymbols) * 0.9, 2.1, 6.5);
  }
  return clamp(2.1 + Math.sqrt(Math.max(file.linesOfCode, 1)) * 0.12, 2.1, 4.6);
}

/** District block footprint — still size-driven (blocks ARE the size class) */
export function blockFootprint(loc: number): number {
  return clamp(8 + Math.sqrt(Math.max(loc, 1)) * 0.3, 8, 20);
}

// ── Git erosion ────────────────────────────────────────────────────────────

export type ErosionState = "stable" | "weathered" | "eroded" | "unknown";

/**
 * Surface state from churn. 'unknown' means no git history (local upload,
 * shallow clone) — renderers must fall back to a smooth surface instead
 * of inventing erosion.
 */
export function erosionState(file: CityFile, meta?: CityData["meta"]): ErosionState {
  if (file.churnScore === undefined) return "unknown";
  if (meta && !meta.churn) return "unknown";
  if (file.churnScore >= 0.55) return "eroded";
  if (file.churnScore >= 0.35) return "weathered";
  return "stable";
}

// ── Finding bars (Balken) ──────────────────────────────────────────────────

/**
 * The finding count as MASS. A beacon on the roof says "something here", but
 * it is a 4 px dot at district distance and it says nothing about how much:
 * measured on the demo city at 111 units out, the whole P0 population of the
 * frame was 2 px and P2 was 0 px — a file whose worst finding is P2 had no
 * signature in the 3D view at all, only in the far-zoom heat grid.
 *
 * A stack of segments answers that without a legend: one segment per finding,
 * worst at the bottom, so height counts the findings and the reading order
 * counts their severity. Position carries severity, colour only repeats it —
 * the stack reads the same in grey, under CVD palette and to anyone who cannot
 * tell #ff2e4d from #ff7a1a.
 */
export const FINDING_BAR = {
  /** world units one finding stacks up */
  SEGMENT_UNITS: 0.85,
  /** findings drawn as their own segment; beyond this they stack into the last */
  MAX_SEGMENTS: 6,
  /** extra units per finding past the cap — keeps the height monotone in count */
  TAIL_UNITS: 0.15,
  /** footprint of the bar itself, in world units (a fixed footprint means the
   *  height is the only variable, so nothing is encoded twice by accident) */
  WIDTH: 0.46,
  DEPTH: 0.46,
} as const;

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

export interface FindingBarSegment {
  severity: Severity;
  /** stack base of this segment, in world units above the roof */
  y0: number;
  /** stack top of this segment */
  y1: number;
  /** how many findings this segment stands for (1 below the cap, more above) */
  count: number;
}

/**
 * The bar for one file's findings: sorted worst-first, one segment per finding
 * up to `MAX_SEGMENTS`, and the tail folded into the top segment so a file with
 * 30 findings is taller than one with 6 and never drawn 30 units high.
 * Pure, ordered, deterministic — the same findings always build the same bar.
 */
export function findingBarSegments(findings: Array<{ severity: Severity }>): FindingBarSegment[] {
  if (findings.length === 0) return [];
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const seg = FINDING_BAR.SEGMENT_UNITS;
  const cap = FINDING_BAR.MAX_SEGMENTS;
  const out: FindingBarSegment[] = [];
  const heads = Math.min(sorted.length, cap);
  const tail = sorted.length - heads;
  for (let i = 0; i < heads; i++) {
    const y0 = i * seg;
    const extra = i === heads - 1 ? tail * FINDING_BAR.TAIL_UNITS : 0;
    out.push({
      severity: sorted[i]!.severity,
      y0,
      y1: y0 + seg + extra,
      count: i === heads - 1 ? 1 + tail : 1,
    });
  }
  return out;
}

/** Total bar height in world units — strictly increasing in the finding count. */
export function findingBarHeight(findings: Array<{ severity: Severity }>): number {
  return findingBarHeightForCount(findings.length);
}

/**
 * The same law over a count instead of a list, so an aggregate (a district's
 * subtree in the far-zoom heat grid) rises by exactly what a stack of single
 * files would: one height rule, two zoom levels, no double standard.
 */
export function findingBarHeightForCount(n: number): number {
  if (n <= 0) return 0;
  const cap = FINDING_BAR.MAX_SEGMENTS;
  const heads = Math.min(n, cap);
  return heads * FINDING_BAR.SEGMENT_UNITS + Math.max(0, n - cap) * FINDING_BAR.TAIL_UNITS;
}

// ── Material state ─────────────────────────────────────────────────────────

export type MaterialState = "graphite" | "glass" | "alarm";

/**
 * Base material: dead-code candidates are glass (transparent — you can
 * see there is nothing holding it up), findings pulse neon, healthy code
 * is matte graphite. Alarm wins over glass: a finding on dead code is
 * more urgent than the dead code itself.
 */
export function materialState(file: CityFile): MaterialState {
  if (file.threatLevel === "critical" || file.threatLevel === "high") return "alarm";
  if (file.deadCodeCandidate) return "glass";
  return "graphite";
}
