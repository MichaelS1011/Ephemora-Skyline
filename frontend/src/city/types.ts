/**
 * City domain types — mirror of backend `cityMapper.ts` output.
 */

import type { VoxelSectionSpec } from "./voxels";

export type Severity = "P0" | "P1" | "P2";
export type ThreatLevel = "critical" | "high" | "medium" | "low" | "safe";
/**
 * What kind of mistake a finding is. Decided by the backend's CWE-cluster
 * table (`services/security/categories.ts`); the UI only labels and filters.
 */
export type FindingCategory =
  | "injection"
  | "secrets"
  | "crypto"
  | "transport"
  | "exposure"
  | "dependencies"
  | "permissions"
  | "hygiene"
  | "unclassified";
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
  /** What kind of mistake this is — the axis the user filters by */
  category?: FindingCategory;
  line: number;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
  historyCommit?: string;
  sourceSeverity?: string;
  packageName?: string;
  packageVersion?: string;
  /** The rule class in a developer's words, for a filter chip */
  label?: string;
  /** German twin of `label` */
  labelDe?: string;
  /** Plain-language explanation of the finding class */
  explanation?: string;
  /** German twin of `explanation` — the card picks it when the UI speaks German */
  explanationDe?: string;
  /** German one-line remediation, mirroring the EN `fix` the adapters ship */
  fixDe?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — where exactly the problem lives */
  snippet?: CitySnippet;
  /** Found in test code — true statement about a fixture, weak one about the product */
  inTest?: boolean;
  /**
   * Stable identity of this finding across re-scans of the same code — see
   * `backend/src/services/security/finding-identity.ts`. The same value the
   * SARIF export puts in `partialFingerprints.primaryLocationLineHash`, so a
   * verdict taken in the panel can be pointed at in a report and by an agent.
   */
  fingerprint?: string;
}

/**
 * Which side of the codebase a file belongs to. "data" marks files that carry
 * data and no behaviour (lockfiles, generated schemas, catalogues, env files,
 * Terraform, SQL migrations) — the renderer must not draw them as complexity
 * towers. Older payloads omit the value; treat absent as "code".
 */
export type FileRole = "code" | "test" | "data";

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  /** Absent in payloads mapped before the code/test split */
  role?: FileRole;
  linesOfCode: number;
  cyclomaticComplexity: number;
  /** Structure notes for the card's teaching block (analyzer/structure-advice) */
  advice?: Array<{ kind: "monolith" | "deep" | "longline"; value: number }>;
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
  /**
   * This file was re-read by a live delta: only the built-in rules saw this
   * version. External-engine answers still on the card belong to the full scan.
   */
  liveRefreshed?: boolean;
  /** Files sharing ≥6 normalized duplicated lines with this one (top 3) */
  clonePartners?: Array<{ id: string; path: string; lines: number }>;
  /** Named code regions feeding the voxel packing (absent in old payloads) */
  sections?: VoxelSectionSpec[];
  /**
   * Scanners that were switched off but cover this file's language. A file
   * with no findings and a non-empty list was never deeply checked — it may
   * not wear the colour of a clean one.
   */
  unverifiedBy?: string[];
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
  /** Which kinds of mistakes live in this folder — the axis the user chose */
  findingsByCategory?: Record<FindingCategory, number>;
  /** Weighted risk of the findings in SHIPPED code (P0×10 + P1×7 + P2×3) */
  threatScore: number;
  /** Files in the subtree that live in test code */
  testFiles?: number;
  /** Findings in the subtree that were found in test code */
  findingsInTests?: number;
  /** Findings in the subtree that sit in data files (lockfiles, env, schemas) */
  findingsInData?: number;
  /** Clean-looking files the switched-off engines would have covered */
  unverifiedFiles?: number;
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
  /**
   * Which engine answered the dependency CVE question — `npm-audit`, `osv` or
   * `pip-audit`. Absent in payloads written before the flag existed, where the
   * card falls back to the engine the `dependencies` flag is named for.
   */
  dependencyRunner?: string | null;
  osv?: boolean;
  ruff?: boolean;
  churn?: boolean;
  duplicates?: boolean;
  coverage?: boolean;
  /** Present once a live delta replaced part of the result. */
  live?: {
    at: string;
    fullScanAt: string;
    changed: number;
    added: number;
    removed: number;
    refreshed: number;
    /** Engines whose answer is from the full scan, not from this state */
    stale: string[];
  };
}

export interface CityData {
  additionalFiles?: CityFile[];
  repo: { owner: string; name: string; branch: string };
  /**
   * Which scan produced this city. Every export and every deep link names the
   * scan it came from, so a stale city can be called stale. Absent in payloads
   * written before the field existed.
   */
  analysisId?: string;
  /** ISO time the scan finished. Older payloads do not carry it. */
  createdAt?: string;
  totalFiles: number;
  renderedFiles: number;
  /** Σ lines the scanner read as code-shaped, data catalogues included */
  totalLines: number;
  /** `totalLines` without the data files; absent in payloads before #48b */
  codeLines?: number;
  /** lines of translation catalogues, manifests and other data files */
  dataLines?: number;
  findingsBySeverity: Record<Severity, number>;
  /** Which kinds of mistakes the scan reported, over the whole city */
  findingsByCategory?: Record<FindingCategory, number>;
  /** language → CODE lines */
  languages: Record<string, number>;
  /** language → data lines, kept out of the bar above */
  dataLanguages?: Record<string, number>;
  /** Findings found in test code — counted, not hidden */
  findingsInTests?: number;
  /** Findings in data files — a lockfile finding is not a code finding */
  findingsInData?: number;
  /** How many of `totalFiles` are test files */
  testFiles?: number;
  /** Buildings that look clean but were never seen by an engine covering them */
  unverifiedFiles?: number;
  /** Engines that were off for the languages this project contains */
  unverifiedEngines?: string[];
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
  /**
   * Files the picked folder held that the scan never read, split by why each one
   * left. Absent for cities built before the counter existed — then the total is
   * a total of what was read, and nothing claims the folder was that small.
   */
  dropped?: DroppedFiles;
}

/** The nine ways a path in the picked folder can end up unread. */
export interface DroppedFiles {
  /** Path longer than the upload's character bound */
  pathTooLong: number;
  /** Path rejected as unsafe (absolute, parent segment, NUL) */
  unsafePath: number;
  /** File bigger than the per-file cap */
  tooLarge: number;
  /** Read failed (permissions, disappearing file) */
  unreadable: number;
  /** Left out by the user's own exclude folders */
  excluded: number;
  /**
   * Paths the project's own .gitignore set aside, counted at the first ignored
   * ancestor: one ignored folder is one number, not its file count.
   */
  gitIgnored: number;
  /**
   * `.git` files that did not fit the history budget. They are not too large —
   * the budget simply filled — and the difference matters, because churn scores
   * are then built on the part of the history that arrived.
   */
  gitBudget: number;
  /** Shape the scan does not read: pictures, text without a known extension */
  unsupportedFormat: number;
  /**
   * Source files a large folder offered but the preview sample left out. This
   * is not a read failure: the scan never promised to open them. It is kept in
   * the accounting so "2,000 files" cannot stand for "2,000 of 48,000" without
   * the second number being reachable.
   */
  preview?: number;
}

/** Which unit is currently selected (a rendered file building or a block). */
export type SelectedUnit = { kind: "file"; id: string } | { kind: "block"; path: string } | null;
