/**
 * Quiet scanners — a pipeline test that forks nothing.
 *
 * Measured on this machine: six test files ran into their 30 s budget at load 181
 * and were green at load 32, with the same assertions and the same fixtures. They
 * were not slow because of what they check. They were slow because each of them
 * did `new SecurityScanner()`, which means the run pays for the real engines —
 * `gitleaks detect` once per file plus a `gitleaks version` probe, a `semgrep`
 * (osemgrep + semgrep-core) run over the folder, `ruff check`, `osv-scanner`, and
 * an `npm audit` — for a question that has nothing to do with any of them:
 * which paths joined the scan, what the progress curve emitted, what the summary
 * wrote down. The engine's answer was never the assertion; the engine was only
 * ever in the room.
 *
 * That is what these two helpers remove. They are the same shape the deleted
 * per-file copies had (`pipelineScanner()` in five files, the `countingScanner()`
 * of `fahrt-drop-account.test.ts`, the inline `wiringScanner()` of
 * `provenanz-verdrahtung.test.ts`), with the spawn switched off, so a suite run
 * costs CPU in the code under test and nothing else. Files whose claim IS an
 * engine result stay real on purpose and say so in their own header — `rule-packs`
 * (real semgrep), `security-scanner` (the facade and its gitleaks boundary),
 * `secret-redaction` (a credential the real finder reported) — while
 * `regeln-regex-layer` and `sg-run-noise-strip` run shipped code in-process and
 * fork nothing, so they cost no load either way. This helper is not a way to make
 * the suite cheap; it is a way to keep the cheap questions cheap.
 *
 * `drop-formats.test.ts` still carries its own `countingScanner()` with the stale
 * `{ issuesByFile, executed }` answer for `scanDependencies`. It was not on this
 * change's list and asserts nothing on that field; it is the next copy to fold in.
 *
 * No file here is named `*.test.ts`: this is a helper, not a published test file,
 * and it must not move the suite's file count.
 */
import { RegexAdapter } from "../../src/services/security/adapters/regex-adapter.js";
import type { SecurityScanner } from "../../src/services/security/scanner.js";
import type { ResolvedScanConfig } from "../../src/services/security/scan-config.js";
import type { FileAnalysis, SecurityIssue } from "../../src/models/index.js";

/** What `scanRepositoryBatch` answers; every flag false means "no engine took part". */
export type BatchAnswer = {
  mergedCount: number;
  gitleaksRan: boolean;
  semgrepRan: boolean;
  ruffRan: boolean;
  osvRan: boolean;
};

/** The shipped return shape of `scanDependencies` — see `scanner.ts:94`. */
export type DependencyAnswer = { executed: boolean; added: number; runner: string | null };

/** What `scanFileStructure` answers: the import/export edges of one file. */
export type StructureAnswer = {
  imports: Array<{ source: string; named: string[]; isExternal: boolean }>;
  exports: Array<{ type: string; name: string }>;
};

const NO_BATCH: BatchAnswer = {
  mergedCount: 0,
  gitleaksRan: false,
  semgrepRan: false,
  ruffRan: false,
  osvRan: false,
};

const NO_DEPENDENCY_AUDIT: DependencyAnswer = { executed: false, added: 0, runner: null };

const NO_STRUCTURE: StructureAnswer = { imports: [], exports: [] };

/**
 * Per-adapter replacement for a real `SecurityScanner`.
 *
 * For the cases where a test checks one program's behaviour and not the whole
 * pipeline: it names the field, hands it a partial fake, and the fake answers
 * instead of the binary. `null` means "this engine is absent and reports itself
 * as never having run" — for gitleaks and semgrep that is literally a null field,
 * which the scanner already understands; for ruff, osv and the dependency audit a
 * null field would throw inside `scanRepositoryBatch`, so they get an inert stub.
 */
export type AdapterStubs = {
  gitleaks?: {
    enableBatchMode?: () => void;
    scanRepository?: (
      clonePath: string,
      opts?: { gitHistory?: boolean },
    ) => Promise<Map<string, SecurityIssue[]> | null>;
  } | null;
  semgrep?: {
    lastBatchExecuted?: boolean;
    scanBatch?: (clonePath: string, contentByPath: Map<string, string>) => Promise<SecurityIssue[]>;
    scanFile?: (filePath: string, content: string) => Promise<SecurityIssue[]>;
  } | null;
  ruff?: {
    lastBatchExecuted?: boolean;
    scanRepository?: (
      clonePath: string,
      opts?: { scope?: string },
    ) => Promise<Map<string, SecurityIssue[]>>;
  } | null;
  osv?: {
    lastBatchExecuted?: boolean;
    lastRunner?: string | null;
    scanRepository?: (clonePath: string) => Promise<Map<string, SecurityIssue[]>>;
  } | null;
  dependency?: {
    scanRepository?: (
      clonePath: string,
    ) => Promise<{ issuesByFile: Map<string, SecurityIssue[]>; executed: boolean }>;
  } | null;
};

/** The private adapter fields `scanner.ts` reaches for, by name. */
const FIELDS: Record<keyof AdapterStubs, string> = {
  gitleaks: "gitleaksAdapter",
  semgrep: "semgrepAdapter",
  ruff: "ruffAdapter",
  osv: "osvAdapter",
  dependency: "dependencyAdapter",
};

/**
 * Set the adapter fields of a real scanner so no engine can be reached. Returns
 * the same scanner, so a test can build it and pin it in one expression.
 */
export function stubAdapters(scanner: SecurityScanner, stubs: AdapterStubs): SecurityScanner {
  const target = scanner as unknown as Record<string, unknown>;
  for (const key of Object.keys(FIELDS) as Array<keyof AdapterStubs>) {
    if (!(key in stubs)) continue;
    const stub = stubs[key];
    target[FIELDS[key]] = stub === null ? absentEngine(key) : { ...defaultsFor(key), ...stub };
  }
  return scanner;
}

/**
 * What "this engine is not on the machine" looks like in each field. gitleaks and
 * semgrep are read through `?.` by the scanner, so null is the honest answer;
 * ruff, osv and the dependency audit are called unconditionally whenever their
 * toggle is on — a null field there throws inside `scanRepositoryBatch` instead
 * of reporting the engine as not run, so they get an object that does nothing.
 */
function absentEngine(key: keyof AdapterStubs): Record<string, unknown> | null {
  return key === "gitleaks" || key === "semgrep" ? null : defaultsFor(key);
}

function defaultsFor(key: keyof AdapterStubs): Record<string, unknown> {
  switch (key) {
    case "gitleaks":
      return { enableBatchMode: () => {}, scanRepository: async () => new Map() };
    case "semgrep":
      return { lastBatchExecuted: false, scanBatch: async () => [] as SecurityIssue[] };
    case "ruff":
      return { lastBatchExecuted: false, scanRepository: async () => new Map() };
    case "osv":
      return {
        lastBatchExecuted: false,
        lastRunner: null,
        scanRepository: async () => new Map(),
      };
    case "dependency":
      return { scanRepository: async () => ({ issuesByFile: new Map(), executed: false }) };
  }
}

/** Overrides a single test needs on top of the quiet default. */
export type QuietOverrides = {
  /**
   * Let `scanFile` answer with the shipped regex catalogue (`RegexAdapter`) instead
   * of nothing, for a test whose folder is supposed to produce a finding. Pure
   * in-process work: no engine, no child process. The import/export reader and the
   * two batch answers stay empty — reading edges is the analyzer's own code, and a
   * test that judges the scanner's dedup/mask/profile boundary builds the real
   * class, because this flag deliberately does not reproduce it.
   */
  regex?: boolean;
  scanFile?: (filePath: string, content: string) => Promise<SecurityIssue[]> | SecurityIssue[];
  scanFileStructure?: (filePath: string, content: string) => StructureAnswer;
  scanRepositoryBatch?: (
    clonePath: string,
    fileAnalyses: FileAnalysis[],
    opts?: { gitHistory?: boolean },
  ) => Promise<BatchAnswer> | BatchAnswer;
  scanDependencies?: (
    clonePath: string,
    fileAnalyses: FileAnalysis[],
  ) => Promise<DependencyAnswer> | DependencyAnswer;
  setConfig?: (config: ResolvedScanConfig) => void;
  enableBatchScans?: () => void;
  countBySeverity?: (issues: SecurityIssue[]) => { P0: number; P1: number; P2: number };
};

/**
 * A `SecurityScanner` that never starts a process.
 *
 * Default: every method answers the way an empty scan answers — no findings, no
 * structure, `scanRepositoryBatch` reports all four engines as not run,
 * `scanDependencies` reports `{ executed: false, added: 0, runner: null }` (the
 * shipped shape, not the `{ issuesByFile, executed }` one two of the deleted local
 * copies carried). `{ regex: true }` lets the shipped regex catalogue answer
 * `scanFile`; `over` replaces any single method on top of either variant.
 *
 * `countBySeverity` is not stubbed in any variant: it is three filters over an
 * array the caller already holds, and a stub there would only make a finding
 * count read as zero. `scan` and `scanBatch` are absent — no pipeline phase calls
 * them, and a quiet answer to a question nobody asks only hides a mistake.
 */
export function quietScanner(over: QuietOverrides = {}): SecurityScanner {
  const findings = over.regex ? regexBaseline() : null;
  const quiet: Record<string, unknown> = {
    setConfig: over.setConfig ?? (() => {}),
    enableBatchScans: over.enableBatchScans ?? (() => {}),
    scanFile:
      over.scanFile ??
      (async (filePath: string, content: string) => (findings ? findings(filePath, content) : [])),
    scanFileStructure: over.scanFileStructure ?? (() => NO_STRUCTURE),
    scanRepositoryBatch: over.scanRepositoryBatch ?? (async () => ({ ...NO_BATCH })),
    scanDependencies: over.scanDependencies ?? (async () => ({ ...NO_DEPENDENCY_AUDIT })),
    countBySeverity:
      over.countBySeverity ??
      ((issues: SecurityIssue[]) => ({
        P0: issues.filter((i) => i.severity === "P0").length,
        P1: issues.filter((i) => i.severity === "P1").length,
        P2: issues.filter((i) => i.severity === "P2").length,
      })),
  };
  return quiet as unknown as SecurityScanner;
}

/**
 * The shipped regex catalogue, called the way `SecurityScanner` calls it: this is
 * the finding half of a real scan and it forks nothing. What it deliberately does
 * NOT reproduce is the boundary around it — dedup, secret masking and the
 * profile filter live in `scanner.ts` and are judged there (`scan-filters.test.ts`
 * pokes a real scanner for exactly that). A test that needs the boundary builds
 * the real class; a test that needs a finding to exist takes this.
 */
function regexBaseline(): (filePath: string, content: string) => SecurityIssue[] {
  const adapter = new RegexAdapter();
  return (filePath, content) => adapter.scanFile(filePath, content);
}
