/**
 * Refactor Sandbox — a deterministic, read-only scenario model.
 *
 * Nothing in here edits code or a CityFile. It answers a counterfactual on the
 * SAME height rail the city already uses (`syntheticComplexity` → `buildingHeight`):
 * "if this file were split / had a module extracted / gained tests, what would
 * the heuristic say about height, coupling and assumptions?"
 *
 * Every number is an estimate. `heuristic: true` and `mutatesCity: false` are
 * part of the returned value so no caller can quietly present it as measured.
 */

import type { CityFile, FileConnection } from "./types";
import { buildingHeight, syntheticComplexity } from "./mapping";

export type SandboxAction = "split" | "extract" | "test";

export const DEFAULT_SPLIT_PARTS = 2;
export const MIN_SPLIT_PARTS = 2;
export const MAX_SPLIT_PARTS = 4;

/** Split parts are a small UI choice, not a free number. */
export function clampSplitParts(parts: number | undefined): number {
  if (parts === undefined || !Number.isFinite(parts)) return DEFAULT_SPLIT_PARTS;
  return Math.min(MAX_SPLIT_PARTS, Math.max(MIN_SPLIT_PARTS, Math.trunc(parts)));
}

export interface SandboxMetrics {
  /** Synthetic complexity on the city's existing 0..1 scale. */
  readonly complexity: number;
  /** World-unit height from `heightForComplexity`. */
  readonly height: number;
  /** Lines of the module the metrics describe (the tallest one). */
  readonly linesOfCode: number;
  /** How many modules the file becomes after the scenario. */
  readonly modules: number;
}

export interface GhostModule {
  readonly id: string;
  readonly name: string;
  readonly kind: "part" | "extracted";
  readonly linesOfCode: number;
  readonly cyclomaticComplexity: number;
  readonly complexity: number;
  readonly height: number;
}

export interface SandboxEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "internal" | "extract";
}

export interface SandboxDelta {
  readonly complexity: number;
  readonly height: number;
  readonly linesOfCode: number;
  readonly modules: number;
}

export interface CoverageGoal {
  readonly targetPct: number;
  /** A goal is never a measurement — this field cannot become true. */
  readonly measured: false;
}

export interface CouplingFacts {
  /** Files whose `from` edge points at this file. */
  readonly importers: number;
  /** External importers stay the same in every scenario. */
  readonly externalImporters: number;
  readonly externalImportersUnchanged: true;
  readonly newEdges: number;
  readonly newInternalEdges: number;
}

export type SandboxAssumption =
  | "heuristic-not-measured"
  | "no-code-changed"
  | "split-distributes-lines-and-branches"
  | "split-adds-internal-edges"
  | "extract-moves-30-percent"
  | "extract-adds-one-module"
  | "test-does-not-change-height"
  | "coverage-goal-not-measured"
  | "external-importers-unchanged";

export interface SandboxScenario {
  readonly fileId: string;
  readonly filePath: string;
  readonly action: SandboxAction;
  readonly parts: number;
  readonly original: SandboxMetrics;
  readonly scenario: SandboxMetrics;
  readonly delta: SandboxDelta;
  readonly ghosts: readonly GhostModule[];
  readonly edges: readonly SandboxEdge[];
  readonly assumptions: readonly SandboxAssumption[];
  readonly coupling: CouplingFacts;
  readonly coverageGoal: CoverageGoal | null;
  readonly heuristic: true;
  readonly mutatesCity: false;
}

export interface SandboxOptions {
  readonly parts?: number;
  readonly connections?: readonly FileConnection[];
}

const EXTRACT_SHARE = 0.3;
const COVERAGE_GOAL_PCT = 80;

function distribute(total: number, parts: number): number[] {
  const safeTotal = Math.max(0, Math.trunc(total));
  const base = Math.floor(safeTotal / parts);
  const remainder = safeTotal - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

function metricsFor(
  file: CityFile,
  linesOfCode: number,
  cyclomaticComplexity: number,
  importCount: number,
  modules: number,
): SandboxMetrics {
  const projected: CityFile = {
    ...file,
    linesOfCode: Math.max(1, Math.trunc(linesOfCode)),
    cyclomaticComplexity: Math.max(1, Math.trunc(cyclomaticComplexity)),
    importCount: Math.max(0, Math.trunc(importCount)),
  };
  return {
    complexity: syntheticComplexity(projected),
    height: buildingHeight(projected),
    linesOfCode: projected.linesOfCode,
    modules,
  };
}

function originalMetrics(file: CityFile): SandboxMetrics {
  return {
    complexity: syntheticComplexity(file),
    height: buildingHeight(file),
    linesOfCode: file.linesOfCode,
    modules: 1,
  };
}

function deltaOf(original: SandboxMetrics, scenario: SandboxMetrics): SandboxDelta {
  return {
    complexity: scenario.complexity - original.complexity,
    height: scenario.height - original.height,
    linesOfCode: scenario.linesOfCode - original.linesOfCode,
    modules: scenario.modules - original.modules,
  };
}

function tallestGhost(ghosts: readonly GhostModule[]): GhostModule {
  return ghosts.reduce((tallest, ghost) => (ghost.height > tallest.height ? ghost : tallest));
}

function couplingFacts(
  file: CityFile,
  connections: readonly FileConnection[],
  edges: readonly SandboxEdge[],
): CouplingFacts {
  const importers = connections.filter((edge) => edge.to === file.id).length;
  return {
    importers,
    externalImporters: importers,
    externalImportersUnchanged: true,
    newEdges: edges.length,
    newInternalEdges: edges.filter((edge) => edge.kind === "internal").length,
  };
}

function splitScenario(
  file: CityFile,
  parts: number,
): Pick<SandboxScenario, "ghosts" | "edges" | "assumptions"> & {
  projected: SandboxMetrics;
} {
  const lines = distribute(file.linesOfCode, parts).map((n) => Math.max(1, n));
  const branches = distribute(file.cyclomaticComplexity, parts).map((n) => Math.max(1, n));
  // Every new internal edge is also one new import statement.
  const imports = distribute((file.importCount ?? 0) + (parts - 1), parts);
  const ghosts: GhostModule[] = Array.from({ length: parts }, (_, i) => {
    const id = `${file.id}#split-${i + 1}`;
    const metrics = metricsFor(file, lines[i]!, branches[i]!, imports[i]!, 1);
    return {
      id,
      name: `${file.name} #${i + 1}`,
      kind: "part",
      linesOfCode: metrics.linesOfCode,
      cyclomaticComplexity: Math.max(1, Math.trunc(branches[i]!)),
      complexity: metrics.complexity,
      height: metrics.height,
    };
  });
  const edges: SandboxEdge[] = Array.from({ length: parts - 1 }, (_, i) => ({
    from: ghosts[i]!.id,
    to: ghosts[i + 1]!.id,
    kind: "internal",
  }));
  const tallest = tallestGhost(ghosts);
  return {
    ghosts,
    edges,
    assumptions: [
      "heuristic-not-measured",
      "no-code-changed",
      "split-distributes-lines-and-branches",
      "split-adds-internal-edges",
      "external-importers-unchanged",
    ],
    projected: {
      complexity: tallest.complexity,
      height: tallest.height,
      linesOfCode: tallest.linesOfCode,
      modules: parts,
    },
  };
}

function extractScenario(file: CityFile): Pick<
  SandboxScenario,
  "ghosts" | "edges" | "assumptions"
> & {
  projected: SandboxMetrics;
} {
  const extractedLines = Math.max(1, Math.round(file.linesOfCode * EXTRACT_SHARE));
  const remainingLines = Math.max(1, file.linesOfCode - extractedLines);
  const extractedBranches = Math.max(1, Math.round(file.cyclomaticComplexity * EXTRACT_SHARE));
  const remainingBranches = Math.max(1, file.cyclomaticComplexity - extractedBranches);
  // The remaining file imports the extracted module; its own import list grows
  // by exactly that one edge.
  const remainingImports = (file.importCount ?? 0) + 1;
  const extracted = metricsFor(file, extractedLines, extractedBranches, 0, 1);
  const ghost: GhostModule = {
    id: `${file.id}#extracted`,
    name: `${file.name} · extracted`,
    kind: "extracted",
    linesOfCode: extracted.linesOfCode,
    cyclomaticComplexity: extractedBranches,
    complexity: extracted.complexity,
    height: extracted.height,
  };
  const projected = metricsFor(file, remainingLines, remainingBranches, remainingImports, 2);
  return {
    ghosts: [ghost],
    edges: [{ from: file.id, to: ghost.id, kind: "extract" }],
    assumptions: [
      "heuristic-not-measured",
      "no-code-changed",
      "extract-moves-30-percent",
      "extract-adds-one-module",
      "external-importers-unchanged",
    ],
    projected,
  };
}

export function planRefactorSandbox(
  file: CityFile,
  action: SandboxAction,
  options: SandboxOptions = {},
): SandboxScenario {
  const parts = action === "split" ? clampSplitParts(options.parts) : 1;
  const original = originalMetrics(file);
  const connections = options.connections ?? [];

  let projected: SandboxMetrics;
  let ghosts: readonly GhostModule[];
  let edges: readonly SandboxEdge[];
  let assumptions: readonly SandboxAssumption[];

  if (action === "split") {
    const split = splitScenario(file, parts);
    projected = split.projected;
    ghosts = split.ghosts;
    edges = split.edges;
    assumptions = split.assumptions;
  } else if (action === "extract") {
    const extract = extractScenario(file);
    projected = extract.projected;
    ghosts = extract.ghosts;
    edges = extract.edges;
    assumptions = extract.assumptions;
  } else {
    projected = original;
    ghosts = [];
    edges = [];
    assumptions = [
      "heuristic-not-measured",
      "no-code-changed",
      "test-does-not-change-height",
      "coverage-goal-not-measured",
      "external-importers-unchanged",
    ];
  }

  return {
    fileId: file.id,
    filePath: file.path,
    action,
    parts,
    original,
    scenario: projected,
    delta: deltaOf(original, projected),
    ghosts,
    edges,
    assumptions,
    coupling: couplingFacts(file, connections, edges),
    coverageGoal: action === "test" ? { targetPct: COVERAGE_GOAL_PCT, measured: false } : null,
    heuristic: true,
    mutatesCity: false,
  };
}
