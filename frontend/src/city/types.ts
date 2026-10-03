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
  /** Found in test code — true statement about a fixture, weak one about the product */
  inTest?: boolean;
}

/** Which side of the codebase a file belongs to. */
export type FileRole = "code" | "test";

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  /** Absent in payloads mapped before the code/test split */
  role?: FileRole;
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
  /** Σ lines in the subtree, data catalogues included — the plot's size class. */
  linesOfCode: number;
  /** `linesOfCode` without the data files; absent in payloads before #48b. */
  codeLines?: number;
  /** lines of JSON/YAML catalogues and manifests, counted apart from code */
  dataLines?: number;
  /** language → CODE lines (data files never appear here) */
  languages: Record<string, number>;
  /** language → data lines */
  dataLanguages?: Record<string, number>;
  findingsBySeverity: Record<Severity, number>;
  /** Weighted risk of the findings in SHIPPED code (P0×10 + P1×7 + P2×3) */
  threatScore: number;
  /** Files in the subtree that live in test code */
  testFiles?: number;
  /** Findings in the subtree that were found in test code */
  findingsInTests?: number;
  /** Weighted risk of those test-code findings */
  testThreatScore?: number;
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

/** Which scanners actually contributed — "complete" alone says nothing about depth. */
export interface ScanProvenance {
  regex: boolean;
  gitleaks: boolean;
  semgrep: boolean;
  dependencies?: boolean;
  osv?: boolean;
  ruff?: boolean;
  churn?: boolean;
  duplicates?: boolean;
  coverage?: boolean;
}

export interface CityData {
  repo: { owner: string; name: string; branch: string };
  totalFiles: number;
  renderedFiles: number;
  /** Σ lines the scanner read as code-shaped, data catalogues included */
  totalLines: number;
  /** `totalLines` without the data files; absent in payloads before #48b */
  codeLines?: number;
  /** lines of translation catalogues, manifests and other data files */
  dataLines?: number;
  findingsBySeverity: Record<Severity, number>;
  /** language → CODE lines */
  languages: Record<string, number>;
  /** language → data lines, kept out of the bar above */
  dataLanguages?: Record<string, number>;
  /** Findings found in test code — counted, not hidden */
  findingsInTests?: number;
  /** How many of `totalFiles` are test files */
  testFiles?: number;
  tree: CityDir;
  fileConnections: FileConnection[];
  dirConnections: DirConnection[];
  /**
   * The caps the city was laid out under — what the panel quotes when it says
   * "6 of 92". Absent in payloads before the draw limits were published.
   */
  limits?: { skylineTowers: number; buildingsPerDirectory: number };
  /** Which optional dimensions are present — UI degrades gracefully without */
  meta: {
    churn: boolean;
    deadCode: boolean;
    duplicates: boolean;
    cycles: boolean;
    coverage: boolean;
    blame: boolean;
  };
  scanProvenance?: ScanProvenance;
  /**
   * What the project's own .gitignore kept out of the scan. Absent for
   * results scanned before the counter — the panel then says nothing about it.
   */
  skippedByGitignore?: { files: number; directories: number };
}

/** Which unit is currently selected (a rendered file building or a block). */
export type SelectedUnit = { kind: "file"; id: string } | { kind: "block"; path: string } | null;
