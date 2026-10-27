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
  /**
   * Structure notes for the card's teaching block (analyzer/structure-advice).
   * Plain {kind,value} pairs — the UI words them in its own language, and they
   * are deliberately NOT findings: the triage queue stays about risks.
   */
  advice?: Array<{ kind: "monolith" | "deep" | "longline"; value: number }>;
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
    /**
     * Epoch-ms of the path's earliest / last known commit, rename chains
     * followed. Optional because results persisted before these fields ship
     * restore without them — a mapper must carry `undefined`, never invent 0.
     */
    firstCommitAt?: number;
    lastCommitAt?: number;
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
  /**
   * This file was re-read by a live delta and therefore only saw the built-in
   * rules. Every project-wide engine (semgrep, gitleaks, the dependency audit,
   * churn, duplicates, coverage) still holds its answer from the full scan.
   */
  liveRefreshed?: boolean;
  vulnerabilities: SecurityIssue[];
}

export interface CodeSnippet {
  before: string[];
  line: string;
  after: string[];
  number: number;
}

/**
 * The kind of mistake a finding represents. The table that decides this lives
 * in `services/security/categories.ts`; the union lives here because the
 * payload and the frontend both speak it.
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
  historyCommit?: string;
  sourceSeverity?: string;
  packageName?: string;
  packageVersion?: string;
  /** The rule class in a developer's words, for a filter chip (curated knowledge) */
  label?: string;
  /** German twin of `label` */
  labelDe?: string;
  /** Plain-language explanation of the finding class (curated knowledge) */
  explanation?: string;
  /** German twin of `explanation` — the card picks it when the UI speaks German */
  explanationDe?: string;
  /** German one-line remediation, mirroring the EN `fix` the adapters ship */
  fixDe?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** What kind of mistake this is — the axis a user filters by */
  category?: FindingCategory;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — shows WHERE the problem lives */
  snippet?: CodeSnippet;
  /**
   * The exact credential string a scanner matched, when it reports one.
   * Input to the masking boundary only: `maskIssueFrames` consumes it and
   * removes it, so no result, city JSON or export ever carries it.
   */
  secretValue?: string;
}

/**
 * The threat scale a severity is worth: P0 = 10, P1 = 7, P2 = 3.
 *
 * One table, keyed by the severity union `SecurityIssue` itself declares,
 * because two copies of the same scale are two scales waiting to drift:
 * `utils/cityMapper.ts` sums and orders it into the city's `threatScore`,
 * `services/security/sarif-mapper.ts` writes it into the `score` field of a
 * semgrep finding. Both read this object; neither restates a number.
 *
 * Deliberately NOT in here: `adapters/regex-adapter.ts` weighs its own engine's
 * findings 9 / 6 / 3 — a weaker claim from a weaker signal, and merging it would
 * change what the city shows, not just where the number lives.
 */
export const THREAT_SCORE: Record<SecurityIssue["severity"], number> = { P0: 10, P1: 7, P2: 3 };

export interface AnalysisResult {
  id: string;
  repo: GitHubRepo;
  files: FileAnalysis[];
  directories: DirectorySummary[];
  summary: ProjectSummary;
  createdAt: string;
  /** Last live delta that changed this result. Absent for a pure full scan. */
  updatedAt?: string;
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

/**
 * The nine ways a file that exists in the picked folder can end up unread.
 * Every field is a count of real paths, and every one of them is produced where
 * the path actually left: `pathTooLong`/`unsafePath`/`tooLarge`/`excluded` at the
 * upload boundary, `unreadable`/`tooLarge` while the pipeline reads, and
 * `unsupportedFormat` where the scan decides which extensions it reads at all.
 */
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
   * Paths the project's own .gitignore set aside. Counted at the first ignored
   * ancestor, so one ignored folder is one number rather than its file count —
   * which is what both pickers can state without walking into it.
   */
  gitIgnored: number;
  /**
   * `.git` files that did not fit the history budget. Not oversized — the budget
   * filled — which is why they are counted apart: churn then rests on the part
   * of the history that arrived.
   */
  gitBudget: number;
  /** Shape the scan does not read: pictures, text without a known extension */
  unsupportedFormat: number;
  /**
   * Source files a large folder offered but the preview sample left out. Not a
   * failure: the scan never opened them. Counted so a sampled city cannot pass
   * its 2,000 files off as the whole folder.
   */
  preview: number;
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
  /**
   * Files the picked folder held that the scan never read, split by why each
   * one left. Without this the total is a rounding: 32 files shown for a folder
   * of 62 reads as "this repo is small", not as "30 paths went unread".
   */
  dropped?: DroppedFiles;
  /** Which scanners actually contributed to this result ("complete" can be regex-only) */
  scanProvenance?: {
    regex: boolean;
    gitleaks: boolean;
    semgrep: boolean;
    /**
     * The shipped rule pack was executed in-process by `local-rules.ts`, over at
     * least one file of THIS scan. It is a separate flag because it is a
     * separate channel: `semgrep` may only ever be set by the engine. It is a
     * per-file pass, but the live delta builds its scanner from a regex-only
     * adapter list (`server/index.ts:101`), so a delta answers `false` here —
     * the honest reading of a channel that did not run, not a stale flag.
     */
    localRules?: boolean;
    dependencies?: boolean;
    /** Which engine answered the dependency CVE question: `npm-audit`, `osv`, `pip-audit`. */
    dependencyRunner?: string | null;
    osv?: boolean;
    ruff?: boolean;
    /** git history was deep enough for trustworthy churn scores */
    churn?: boolean;
    /**
     * The churn pass met a `.git` folder and could not finish: the history
     * arrived cut off (a pack over the upload's per-file wall leaves the
     * object store split — `git log` then dies with `unable to read tree`) or
     * the git call failed. This is NOT `churn: false` "without history": the
     * folder has history, the upload truncated it. Payloads written before the
     * distinction carry neither value.
     */
    churnInterrupted?: boolean;
    /** copy-paste clones were found */
    duplicates?: boolean;
    /** a lcov-style coverage report was found and parsed */
    coverage?: boolean;
    /**
     * Present once a live delta has replaced part of the result. The flags
     * above still describe the full scan; `stale` names the engines whose
     * answer belongs to that full scan and was NOT re-run for this state.
     */
    live?: LiveScanInfo;
  };
}

export interface LiveScanInfo {
  /** When the delta landed (ISO) */
  at: string;
  /** When the full scan this result grew out of finished (ISO) */
  fullScanAt: string;
  changed: number;
  added: number;
  removed: number;
  /** Files re-read by the delta — built-in rules only */
  refreshed: number;
  /** Engines whose answer is from the full scan, not from this state */
  stale: string[];
}

/**
 * One step of the analysis pipeline. The job-progress map holds the latest of
 * these and `GET /api/status/:id` serves it — the frontend polls that endpoint,
 * there is no socket to feed.
 */
export interface ProgressEvent {
  progress: number;
  stage: string;
}
