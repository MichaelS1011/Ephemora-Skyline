/**
 * City domain types — mirror of backend `cityMapper.ts` output.
 */

import type { VoxelSectionSpec } from "./voxels";

export type Severity = "P0" | "P1" | "P2";
export type ThreatLevel = "critical" | "high" | "medium" | "low" | "safe";
/** Reviewer's triage state for one finding (local-first, no server). */
export type ReviewStatus = "reviewed" | "false-positive" | "to-fix";

export interface CitySnippet {
  before: string[];
  line: string;
  after: string[];
  number: number;
}

export interface CityFinding {
  type: string;
  severity: Severity;
  line: number;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
  /** Plain-language explanation of the finding class */
  explanation?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — where exactly the problem lives */
  snippet?: CitySnippet;
}

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  linesOfCode: number;
  cyclomaticComplexity: number;
  threatLevel: ThreatLevel;
  findings: CityFinding[];
  /** Raw file size in bytes — bloat LOC hides */
  bytes?: number;
  /** 0..1 git change-frequency hotspot score (absent without git history) */
  churnScore?: number;
  commitCount?: number;
  daysSinceLastCommit?: number;
  /** Developer with the most commits touching this file */
  topAuthor?: string;
  /** Number of exported symbols — the file's public API surface */
  exportedSymbols?: number;
  /** Number of import statements — coupling proxy until the AST core lands */
  importCount?: number;
  /** Exports exist but nothing imports this file (conservative heuristic) */
  deadCodeCandidate?: boolean;
  /** Part of at least one circular import chain */
  inCycle?: boolean;
  /** Line coverage 0..100 parsed from a lcov-style report, if present */
  coveragePct?: number;
  /** Files sharing ≥6 normalized duplicated lines with this one (top 3) */
  clonePartners?: Array<{ id: string; path: string; lines: number }>;
  /** Named code regions feeding the voxel packing (absent in old payloads) */
  sections?: VoxelSectionSpec[];
}

export interface CityDir {
  name: string;
  path: string;
  fileCount: number;
  linesOfCode: number;
  languages: Record<string, number>;
  findingsBySeverity: Record<Severity, number>;
  threatScore: number;
  topFindings: CityFinding[];
  children: CityDir[];
  detailFiles: CityFile[];
  remainingFiles: number;
  /** Up to 6 representative subtree files — the district's skyline. */
  districtFiles: CityFile[];
  /** Author owning the most files in this subtree ("Anna's district") */
  topAuthor?: string;
  topAuthorShare?: number;
}

export interface FileConnection {
  from: string;
  to: string;
  weight: number;
}

export interface DirConnection {
  from: string;
  to: string;
  weight: number;
}

export interface CityData {
  repo: { owner: string; name: string; branch: string };
  totalFiles: number;
  renderedFiles: number;
  totalLines: number;
  findingsBySeverity: Record<Severity, number>;
  languages: Record<string, number>;
  tree: CityDir;
  fileConnections: FileConnection[];
  dirConnections: DirConnection[];
  /** Which optional dimensions are present — UI degrades gracefully without */
  meta: {
    churn: boolean;
    deadCode: boolean;
    duplicates: boolean;
    cycles: boolean;
    coverage: boolean;
    blame: boolean;
  };
}

/** Which unit is currently selected (a rendered file building or a block). */
export type SelectedUnit = { kind: "file"; id: string } | { kind: "block"; path: string } | null;
