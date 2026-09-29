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

import type { CityData, CityFile } from "./types";

// ── Normalization references (what counts as "maxed out") ─────────────────

export const NORM_REFERENCE = {
  /** Cyclomatic complexity ≥ this saturates the cyclomatic factor */
  cyclomatic: 25,
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
  const s = syntheticComplexity(file);
  return clamp(2.2 + Math.pow(s, 0.9) * 31.8, 2.2, 34);
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
