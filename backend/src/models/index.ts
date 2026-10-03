/**
 * Domain Models — TypeScript interfaces for all entities.
 *
 * These interfaces define the shape of data flowing
 * between backend services and the frontend.
 */

export interface GitHubRepo {
  owner: string;
  name: string;
  branch: string;
  cloneUrl: string;
  analyzedAt: string;
  /** Full clone (no --depth) so gitleaks can scan the entire git history */
  fullHistory?: boolean;
}

export interface FileAnalysis {
  path: string;
  language: string;
  lines: { total: number; code: number; comments: number; blank: number };
  /** Raw file size in bytes — flags binary bloat that LOC hides */
  bytes?: number;
  complexity: { cyclomatic: number };
  functions: Array<{
    name: string;
    line: number;
    parameters: number;
    complexity: number;
    isAsync: boolean;
  }>;
  classes: Array<{ name: string; line: number; methods: number }>;
  imports: Array<{
    source: string;
    named: string[];
    isExternal: boolean;
    line: number;
  }>;
  exports: Array<{
    type: "named" | "default" | "reexport";
    name: string;
    line: number;
  }>;
  /**
   * Git change-frequency data (clone-based scans only; absent for local
   * uploads or single-commit clones). Drives the visual "git erosion".
   */
  churn?: {
    commits: number;
    addedLines: number;
    deletedLines: number;
    daysSinceLastCommit: number;
    authors: number;
    /** Developer with the most commits on this file */
    topAuthor?: string;
    /** 0..1 normalized hotspot score */
    score: number;
  };
  /** Line-coverage percentage parsed from lcov-style reports, if present */
  coveragePct?: number;
  /** Other files sharing ≥ MIN_CLONE_LINES normalized lines (top 3) */
  clonePartners?: Array<{ path: string; lines: number }>;
  /** Part of at least one circular import chain */
  inCycle?: boolean;
  /**
   * Voxel sections (CodeBlocks design): functions/classes shape city
   * blocks, 1 voxel = 1 code line, nesting forms terraces. Absent for
   * demo/legacy results — always optional and backwards compatible.
   */
  sections?: Array<{
    name: string;
    kind: "function" | "class" | "module" | "imports";
    start: number;
    end: number;
    codeLines: number;
    depth: number;
  }>;
  content?: string;
  vulnerabilities: SecurityIssue[];
}

export interface CodeSnippet {
  before: string[];
  line: string;
  after: string[];
  number: number;
}

export interface SecurityIssue {
  type: string;
  severity: "P0" | "P1" | "P2";
  score: number;
  line: number;
  code: string;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
  /** Plain-language explanation of the finding class (curated knowledge) */
  explanation?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — shows WHERE the problem lives */
  snippet?: CodeSnippet;
}

export interface AnalysisResult {
  id: string;
  repo: GitHubRepo;
  files: FileAnalysis[];
  directories: DirectorySummary[];
  summary: ProjectSummary;
  createdAt: string;
  status: "pending" | "analyzing" | "complete" | "failed";
  error?: string;
}

export interface DirectorySummary {
  path: string;
  fileCount: number;
  totalLines: number;
  avgComplexity: number;
  vulnerabilityCount: number;
  children: DirectorySummary[];
}

export interface ProjectSummary {
  totalFiles: number;
  totalDirectories: number;
  /**
   * Σ lines of every scanned file, data catalogues included. The city panel
   * does not show this number: `cityMapper` splits the data lines back out
   * (`codeLines` / `dataLines`), because 300 lines of translation JSON are not
   * 300 lines of code. Producers that fill this field count all of them.
   */
  totalLines: number;
  avgCyclomatic: number;
  maxCyclomatic: number;
  languages: Record<string, number>;
  totalVulnerabilities: number;
  vulnerabilitiesBySeverity: { P0: number; P1: number; P2: number };
  /** language → lines of every scanned file; see `totalLines` for the caveat */
  languagesByLines: Record<string, number>;
  /** Entries the project's own .gitignore kept out of the scan */
  skippedByGitignore?: { files: number; directories: number };
  /** Which scanners actually contributed to this result ("complete" can be regex-only) */
  scanProvenance?: {
    regex: boolean;
    gitleaks: boolean;
    semgrep: boolean;
    dependencies?: boolean;
    osv?: boolean;
    ruff?: boolean;
    /** git history was deep enough for trustworthy churn scores */
    churn?: boolean;
    /** copy-paste clones were found */
    duplicates?: boolean;
    /** a lcov-style coverage report was found and parsed */
    coverage?: boolean;
  };
}

export type WebSocketEventType =
  | "repo_cloned"
  | "file_parsing_started"
  | "file_parsed"
  | "building_generated"
  | "analysis_progress"
  | "analysis_complete"
  | "vulnerability_found"
  | "connected"
  | "error";

export interface WebSocketEvent {
  type: WebSocketEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}
