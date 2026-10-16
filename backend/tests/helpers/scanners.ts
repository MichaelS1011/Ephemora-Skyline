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
import { SecurityScanner } from "../../src/services/security/scanner.js";
import type {
  DependencyEngine,
  GitleaksEngine,
  OsvEngine,
  RuffEngine,
  ScannerEngines,
  SemgrepEngine,
} from "../../src/services/security/scanner.js";
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
 * Per-adapter replacement for a real `SecurityScanner`, injected through the
 * scanner's own engine interfaces (`ScannerEngines`, exported by scanner.ts) —
 * no cast, no reaching into private fields.
 *
 * For the cases where a test checks one program's behaviour and not the whole
 * pipeline: it names the field, hands it a partial fake, and the fake answers
 * instead of the binary. `null` means "this engine is absent and reports itself
 * as never having run" — for gitleaks and semgrep that is literally a null
 * engine, which the scanner already understands; for ruff, osv and the
 * dependency audit a null engine would throw inside `scanRepositoryBatch`, so
 * they get an inert stub.
 */
export type AdapterStubs = {
  gitleaks?: Partial<GitleaksEngine> | null;
  semgrep?: Partial<SemgrepEngine> | null;
  dependency?: Partial<DependencyEngine> | null;
  osv?: Partial<OsvEngine> | null;
  ruff?: Partial<RuffEngine> | null;
};

const GITLEAKS_DEFAULTS: GitleaksEngine = {
  enableBatchMode: () => {},
  scanRepository: async () => new Map(),
};

const SEMGREP_DEFAULTS: SemgrepEngine = {
  setRuleDirs: () => {},
  lastBatchExecuted: false,
  scanBatch: async () => [],
};

const DEPENDENCY_DEFAULTS: DependencyEngine = {
  scanRepository: async () => ({ issuesByFile: new Map(), executed: false }),
};

const OSV_DEFAULTS: OsvEngine = {
  lastBatchExecuted: false,
  lastRunner: null,
  scanRepository: async () => new Map(),
};

const RUFF_DEFAULTS: RuffEngine = {
  lastBatchExecuted: false,
  scanRepository: async () => new Map(),
};

/**
 * Build the constructor's `engines` argument from per-adapter stubs. A missing
 * key keeps the scanner's shipped engine; `null` reports gitleaks/semgrep as
 * absent (they are read through `?.`); ruff, osv and the dependency audit are
 * called unconditionally whenever their toggle is on, so a null there would
 * throw inside `scanRepositoryBatch` — they get an inert stub instead.
 */
export function enginesFor(stubs: AdapterStubs): ScannerEngines {
  const engines: ScannerEngines = {};
  if (stubs.gitleaks !== undefined)
    engines.gitleaks = stubs.gitleaks === null ? null : { ...GITLEAKS_DEFAULTS, ...stubs.gitleaks };
  if (stubs.semgrep !== undefined)
    engines.semgrep = stubs.semgrep === null ? null : { ...SEMGREP_DEFAULTS, ...stubs.semgrep };
  if (stubs.dependency !== undefined)
    engines.dependency =
      stubs.dependency === null
        ? DEPENDENCY_DEFAULTS
        : { ...DEPENDENCY_DEFAULTS, ...stubs.dependency };
  if (stubs.osv !== undefined)
    engines.osv = stubs.osv === null ? OSV_DEFAULTS : { ...OSV_DEFAULTS, ...stubs.osv };
  if (stubs.ruff !== undefined)
    engines.ruff = stubs.ruff === null ? RUFF_DEFAULTS : { ...RUFF_DEFAULTS, ...stubs.ruff };
  return engines;
}

/**
 * Set the engine dependencies of a real scanner so no engine can be reached.
 * The same injection the constructor accepts, through the typed
 * `setEngines()` — never a cast into the private fields. Returns the same
 * scanner, so a test can build it and pin it in one expression.
 */
export function stubAdapters(scanner: SecurityScanner, stubs: AdapterStubs): SecurityScanner {
  scanner.setEngines(enginesFor(stubs));
  return scanner;
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

/** Engines that answer "absent / never ran" — the construction half of quietScanner. */
const QUIET_ENGINES: ScannerEngines = {
  gitleaks: null,
  semgrep: null,
  dependency: DEPENDENCY_DEFAULTS,
  osv: OSV_DEFAULTS,
  ruff: RUFF_DEFAULTS,
};

/**
 * A `SecurityScanner` that never starts a process.
 *
 * Built as a real scanner whose engines are injected at construction as
 * "absent / never ran", then each pipeline method is replaced with the quiet
 * answer below — same defaults, same overrides, no cast into the class.
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
  const scanner = new SecurityScanner([], undefined, QUIET_ENGINES);
  const overrides: Pick<
    SecurityScanner,
    | "setConfig"
    | "enableBatchScans"
    | "scanFile"
    | "scanFileStructure"
    | "scanRepositoryBatch"
    | "scanDependencies"
    | "countBySeverity"
  > = {
    setConfig: over.setConfig ?? (() => {}),
    enableBatchScans: over.enableBatchScans ?? (() => {}),
    scanFile: async (filePath: string, content: string) => {
      if (over.scanFile) return await over.scanFile(filePath, content);
      return findings ? findings(filePath, content) : [];
    },
    scanFileStructure: over.scanFileStructure ?? (() => NO_STRUCTURE),
    scanRepositoryBatch: async (
      clonePath: string,
      fileAnalyses: FileAnalysis[],
      opts?: { gitHistory?: boolean },
    ) => {
      if (over.scanRepositoryBatch)
        return await over.scanRepositoryBatch(clonePath, fileAnalyses, opts);
      return { ...NO_BATCH };
    },
    scanDependencies: async (clonePath: string, fileAnalyses: FileAnalysis[]) => {
      if (over.scanDependencies) return await over.scanDependencies(clonePath, fileAnalyses);
      return { ...NO_DEPENDENCY_AUDIT };
    },
    countBySeverity:
      over.countBySeverity ??
      ((issues: SecurityIssue[]) => ({
        P0: issues.filter((i) => i.severity === "P0").length,
        P1: issues.filter((i) => i.severity === "P1").length,
        P2: issues.filter((i) => i.severity === "P2").length,
      })),
  };
  Object.assign(scanner, overrides);
  return scanner;
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
