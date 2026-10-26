/**
 * SecurityScanner — Facade over ScannerAdapters.
 *
 * RegexAdapter + GitleaksAdapter (Secrets) + SemgrepAdapter (AST, SARIF) hinter gleicher Schnittstelle.
 * Ohne Binary/Docker: Graceful Fallback auf Regex/Gitleaks-Fallback, kein Crash.
 */

import pino from "pino";
import type { SecurityIssue, FileAnalysis } from "../../models/index.js";
import type { ScannerAdapter } from "./adapter.js";
import { RegexAdapter } from "./adapters/regex-adapter.js";
import { GitleaksAdapter } from "./adapters/gitleaks-adapter.js";
import { SemgrepAdapter } from "./adapters/semgrep-adapter.js";
import { DependencyAdapter } from "./adapters/dependency-adapter.js";
import { OsvAdapter } from "./adapters/osv-adapter.js";
import { RuffAdapter } from "./adapters/ruff-adapter.js";
import { dedupIssues, compareBySeverityThenLine } from "./dedup.js";
import { categoryOf } from "./categories.js";
import { enrichIssues } from "./finding-knowledge.js";
import { maskIssueFrames } from "./redact.js";
import { resolveConfig, type ResolvedScanConfig } from "./scan-config.js";
import { runRepositoryBatch, type RepositoryBatchResult } from "./batch-scan.js";
import { semgrepRuleDirs } from "./rule-packs.js";
import { scanFileStructure as parseFileStructure } from "../analyzer/file-structure.js";
import type { FileStructure } from "../analyzer/file-structure.js";

/** What the scanner needs from the gitleaks engine — the shipped adapter satisfies it. */
export interface GitleaksEngine {
  enableBatchMode(): void;
  scanRepository(
    clonePath: string,
    opts?: { gitHistory?: boolean },
  ): Promise<Map<string, SecurityIssue[]> | null>;
}

/** What the scanner needs from the semgrep engine — the shipped adapter satisfies it. */
export interface SemgrepEngine {
  setRuleDirs(dirs: string[]): void;
  lastBatchExecuted: boolean;
  scanBatch(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[]>;
}

/** What the scanner needs from the npm-audit engine — the shipped adapter satisfies it. */
export interface DependencyEngine {
  scanRepository(
    clonePath: string,
  ): Promise<{ issuesByFile: Map<string, SecurityIssue[]>; executed: boolean }>;
}

/** What the scanner needs from the osv engine — the shipped adapter satisfies it. */
export interface OsvEngine {
  lastBatchExecuted: boolean;
  lastRunner: string | null;
  scanRepository(clonePath: string): Promise<Map<string, SecurityIssue[]>>;
}

/** What the scanner needs from the ruff engine — the shipped adapter satisfies it. */
export interface RuffEngine {
  lastBatchExecuted: boolean;
  scanRepository(
    clonePath: string,
    opts?: { scope?: string },
  ): Promise<Map<string, SecurityIssue[]>>;
}

/**
 * The engine dependencies of a scan, injectable through the constructor.
 * `null` reports an engine as absent from the machine (gitleaks/semgrep read
 * it through `?.`); `undefined` or an omitted key means "use the shipped
 * adapter". dependency/osv/ruff are called unconditionally whenever their
 * tool toggle is on, so their keys take an engine, never null.
 */
export interface ScannerEngines {
  gitleaks?: GitleaksEngine | null;
  semgrep?: SemgrepEngine | null;
  dependency?: DependencyEngine;
  osv?: OsvEngine;
  ruff?: RuffEngine;
}

/**
 * A batch finding carries its file through `_filePath` — `sarifToIssues`
 * attaches it so the merge can key by repo-relative path. It is an internal
 * channel between the semgrep adapter and this merge, not part of the model.
 */
type BatchIssue = SecurityIssue & { _filePath?: string };

export class SecurityScanner {
  private logger: pino.Logger;
  private adapters: ScannerAdapter[];
  private gitleaksAdapter: GitleaksEngine | null;
  private dependencyAdapter: DependencyEngine;
  private osvAdapter: OsvEngine;
  private ruffAdapter: RuffEngine;
  private config: ResolvedScanConfig;
  /** One CVE question per scan: the batch phase and the dependency phase share it */
  /** osv brought an answer back — the dependency phase must not ask again. */
  private cveAnswered = false;
  /** osv was tried this scan, with or without an answer: asking twice is one trip too many. */
  private cveAsked = false;
  private semgrepAdapter: SemgrepEngine | null;

  constructor(adapters?: ScannerAdapter[], config?: ResolvedScanConfig, engines?: ScannerEngines) {
    this.logger = pino({ name: "security-scanner" });
    this.config = config ?? resolveConfig().config;
    if (adapters) {
      // An explicit per-file list owns the per-file loop; the engine fields
      // stay separate and default to "absent" exactly as before.
      this.adapters = adapters;
      this.gitleaksAdapter = engines?.gitleaks !== undefined ? engines.gitleaks : null;
      this.semgrepAdapter = engines?.semgrep !== undefined ? engines.semgrep : null;
    } else {
      // The default per-file list and the engine fields must be the SAME
      // instances: enableBatchScans() flips batchMode on the field, and
      // scanFile reads it back off the list entry.
      const gitleaks = new GitleaksAdapter();
      const semgrep = new SemgrepAdapter();
      this.gitleaksAdapter = engines?.gitleaks !== undefined ? engines.gitleaks : gitleaks;
      this.semgrepAdapter = engines?.semgrep !== undefined ? engines.semgrep : semgrep;
      this.adapters = [new RegexAdapter(), gitleaks, semgrep];
    }
    this.dependencyAdapter =
      engines?.dependency !== undefined ? engines.dependency : new DependencyAdapter();
    this.osvAdapter = engines?.osv !== undefined ? engines.osv : new OsvAdapter();
    this.ruffAdapter = engines?.ruff !== undefined ? engines.ruff : new RuffAdapter();
    this.applyCustomPatterns();
    this.applyRulePacks();
  }

  /**
   * Replace the engine dependencies after construction — the same injection
   * the constructor accepts. `null` reports gitleaks/semgrep as absent;
   * `undefined` leaves the current engine alone.
   */
  setEngines(engines: ScannerEngines): void {
    if (engines.gitleaks !== undefined) this.gitleaksAdapter = engines.gitleaks;
    if (engines.semgrep !== undefined) this.semgrepAdapter = engines.semgrep;
    if (engines.dependency !== undefined) this.dependencyAdapter = engines.dependency;
    if (engines.osv !== undefined) this.osvAdapter = engines.osv;
    if (engines.ruff !== undefined) this.ruffAdapter = engines.ruff;
  }

  /**
   * A user rule that is validated, stored and never compiled is a lie about the
   * scan: the config's `customPatterns` join the regex catalogue here, and again
   * on every setConfig, because one scanner instance serves many scans.
   */
  private applyCustomPatterns(): void {
    for (const adapter of this.adapters) {
      if (adapter.id !== "regex" || !(adapter instanceof RegexAdapter)) continue;
      adapter.setCustomPatterns(this.config.customPatterns);
    }
  }

  /**
   * Which rules semgrep loads is decided per scan, not per process: a selected
   * pack reads off the local disk, no selection keeps the registry default.
   *
   * A selection that resolves to nothing switches the engine off rather than
   * falling through to the registry — a pack disappearing between "the config
   * was valid" and "the scan runs" must not turn into a network fetch the user
   * never asked for, nor into a scan that quietly widened itself.
   */
  private applyRulePacks(): void {
    const dirs = semgrepRuleDirs(this.config.rulePacks);
    if (this.config.rulePacks.length > 0 && dirs.length === 0) {
      this.logger.warn(
        { selected: this.config.rulePacks },
        "selected rule packs are no longer on disk — semgrep stays off for this scan",
      );
      this.config.tools.semgrep = false;
    }
    this.semgrepAdapter?.setRuleDirs(dirs);
  }

  /**
   * Dependency scan — CVEs from the best available source: osv-scanner
   * (all ecosystems) first, then the existing npm audit. Findings attach
   * to the lockfile/manifest building; executed=false when nothing ran.
   */
  async scanDependencies(
    clonePath: string,
    fileAnalyses: FileAnalysis[],
  ): Promise<{ executed: boolean; added: number; runner: string | null }> {
    if (!this.config.tools.dependencies) return { executed: false, added: 0, runner: null };
    // The batch phase already asked the CVE question when osv is on — asking it
    // again here cost a second network round trip per scan.
    if (this.cveAnswered) return { executed: true, added: 0, runner: this.osvAdapter.lastRunner };

    // osv covers npm too — prefer it, fall back to the npm-audit adapter. A batch
    // that TRIED osv and brought nothing back (no binary on PATH) is not an
    // answer: the fallback is what SECURITY.md promises a reader who selected
    // osv-scanner but never installed it.
    const useOsv = this.config.tools.osv && !this.cveAsked;
    const osv = useOsv ? await this.osvAdapter.scanRepository(clonePath) : new Map();
    this.cveAnswered = useOsv && this.osvAdapter.lastBatchExecuted;
    if (useOsv && this.osvAdapter.lastBatchExecuted) {
      return {
        executed: true,
        added: this.mergeByFile(osv, fileAnalyses, "osv"),
        runner: this.osvAdapter.lastRunner,
      };
    }
    const { issuesByFile, executed } = await this.dependencyAdapter.scanRepository(clonePath);
    // A clean audit is an audit that RAN. Reporting it as not-run made the panel
    // claim a depth gap in front of a lockfile that had just been checked — and
    // it did so on exactly the projects the tool is meant to reassure.
    if (!executed) return { executed: false, added: 0, runner: null };
    return {
      executed: true,
      added: this.mergeByFile(issuesByFile, fileAnalyses, "npm-audit"),
      runner: "npm-audit",
    };
  }

  /** Attach per-file issue lists to FileAnalysis entries (lockfile first) */
  private mergeByFile(
    issuesByFile: Map<string, SecurityIssue[]>,
    fileAnalyses: FileAnalysis[],
    provenance: string,
  ): number {
    let added = 0;
    for (const [rel, issues] of issuesByFile) {
      // Manifest files (.txt/.toml/.lock) are not in fileAnalyses — create a
      // synthetic building so the CVEs are visible in the city
      let target = fileAnalyses.find((f) => f.path === rel);
      if (!target) {
        target = {
          path: rel,
          language: "Config",
          lines: { total: 1, code: 1, comments: 0, blank: 0 },
          complexity: { cyclomatic: 1 },
          functions: [],
          classes: [],
          imports: [],
          exports: [],
          vulnerabilities: [],
        };
        fileAnalyses.push(target);
      }
      enrichIssues(issues, target.content);
      const merged = this.filterForPath(dedupIssues([...target.vulnerabilities, ...issues]), rel);
      added += merged.length - target.vulnerabilities.length;
      target.vulnerabilities = merged.sort(compareBySeverityThenLine);
    }
    void provenance;
    return added;
  }

  /** Apply a scan config for the NEXT scan (mutates thresholds, tool toggles) */
  setConfig(config: ResolvedScanConfig): void {
    this.config = config;
    this.applyCustomPatterns();
    this.applyRulePacks();
  }

  /**
   * Switch adapters to whole-clone batch mode. Call BEFORE the per-file loop
   * when a clone directory is available: gitleaks then contributes its findings
   * via scanRepositoryBatch() instead of one process spawn per file.
   */
  enableBatchScans(): void {
    this.gitleaksAdapter?.enableBatchMode();
  }

  /**
   * Batch scan — accepts an array of FileAnalysis objects and returns them
   * with their `vulnerabilities` field populated. Async wegen Gitleaks-Binary.
   */
  async scan(files: FileAnalysis[]): Promise<FileAnalysis[]> {
    return Promise.all(
      files.map(async (file) => ({
        ...file,
        vulnerabilities: file.content ? await this.scanFile(file.path, file.content) : [],
      })),
    );
  }

  /** Scan a single file's content string for vulnerabilities (async, merged adapters) */
  async scanFile(filePath: string, content: string): Promise<SecurityIssue[]> {
    const all: SecurityIssue[] = [];
    for (const adapter of this.adapters) {
      const res = await adapter.scanFile(filePath, content);
      all.push(...res);
    }
    const deduped = this.filterForPath(dedupIssues(all), filePath);
    // Sort by severity order P0>P1>P2 then line
    deduped.sort(compareBySeverityThenLine);
    // The boundary masks, not only the enrichment pass. An adapter that reads
    // the source line itself — gitleaks without its binary — never goes through
    // enrichIssues, and its raw `code` is what a user then exports. Whatever an
    // adapter forgets, nothing leaves this method carrying a credential value.
    for (const issue of deduped) maskIssueFrames(issue);
    if (deduped.length > 0)
      this.logger.info({ filePath, issues: deduped.length }, "Security scan completed");
    return deduped;
  }

  /**
   * The single place a finding is judged. Batch and dependency merges used to
   * append their results beside it, so a category turned off in the profile was
   * still reported whenever semgrep, gitleaks or ruff named it.
   */
  private filterForPath(issues: SecurityIssue[], filePath: string): SecurityIssue[] {
    if (this.config.excludePaths.some((needle) => filePath.includes(needle))) return [];
    return issues.filter((i) => this.configFilterAllows(i));
  }

  /**
   * Severity threshold + type allow/denylist from the scan config — the single
   * judge every arrival path is filtered through. Public so the filter contract
   * can be tested against an injected config without reaching into the class.
   */
  configFilterAllows(issue: SecurityIssue): boolean {
    const t = this.config.severityThreshold;
    if (t === "P0" && issue.severity !== "P0") return false;
    if (t === "P1" && issue.severity === "P2") return false;
    if (this.config.disabledFindingTypes.includes(issue.type)) return false;
    const allow = this.config.enabledFindingTypes;
    if (
      allow.length > 0 &&
      // An entry names a family too: ruff contributes QUALITY_<code> and semgrep
      // SECURITY_<check-id>, which no fixed list could ever enumerate.
      !allow.some((a) => issue.type === a || issue.type.startsWith(`${a}_`))
    )
      return false;
    const categories = this.config.enabledCategories;
    // Python linter findings are a whole family, not just the three handwritten
    // style rules — categoryOf resolves them into the hygiene bucket.
    const category = issue.category ?? categoryOf(issue.type, issue.cwe);
    if (categories.length > 0 && !categories.includes(category)) return false;
    return true;
  }

  /** Parse ESM + CJS + dynamic imports and exports from source — delegated to the analyzer */
  scanFileStructure(filePath: string, content: string): FileStructure {
    return parseFileStructure(filePath, content);
  }

  /**
   * Whole-clone batch scan — gitleaks (one process for the entire repo) plus
   * semgrep (one run), merged per file and deduped against per-file findings
   * already attached to the FileAnalysis objects. The run itself lives in
   * batch-scan.ts; this method only hands it the scanner's engine state.
   */
  async scanRepositoryBatch(
    clonePath: string,
    fileAnalyses: FileAnalysis[],
    opts?: { gitHistory?: boolean },
  ): Promise<RepositoryBatchResult> {
    return runRepositoryBatch(
      {
        logger: this.logger,
        config: this.config,
        gitleaks: this.gitleaksAdapter,
        semgrep: this.semgrepAdapter,
        ruff: this.ruffAdapter,
        osv: this.osvAdapter,
        filterForPath: (issues, filePath) => this.filterForPath(issues, filePath),
        scanBatch: (c, m) => this.scanBatch(c, m),
        markCveAsked: () => {
          this.cveAsked = true;
        },
        setCveAnswered: (value) => {
          this.cveAnswered = value;
        },
      },
      clonePath,
      fileAnalyses,
      opts,
    );
  }

  /** Batch SARIF-aware scan — invoked by orchestrator on clonePath (optional, not per-file) */
  async scanBatch(
    clonePath: string,
    contentByPath: Map<string, string>,
  ): Promise<Map<string, SecurityIssue[]>> {
    if (!this.semgrepAdapter) return new Map();
    const batchIssues = await this.semgrepAdapter.scanBatch(clonePath, contentByPath);
    const byFile = new Map<string, SecurityIssue[]>();
    for (const issue of batchIssues) {
      const fp = (issue as BatchIssue)._filePath;
      if (!fp) continue;
      // normalize to repo-relative path
      const rel = fp.startsWith(clonePath + "/") ? fp.slice(clonePath.length + 1) : fp;
      const list = byFile.get(rel) ?? byFile.get(fp) ?? [];
      list.push(issue);
      byFile.set(rel, list);
      if (rel !== fp) byFile.set(fp, list);
    }
    return byFile;
  }

  /** Count issues by severity bucket */
  countBySeverity(issues: SecurityIssue[]): { P0: number; P1: number; P2: number } {
    return {
      P0: issues.filter((i) => i.severity === "P0").length,
      P1: issues.filter((i) => i.severity === "P1").length,
      P2: issues.filter((i) => i.severity === "P2").length,
    };
  }
}
