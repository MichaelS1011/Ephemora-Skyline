/**
 * SecurityScanner — Facade over ScannerAdapters.
 *
 * RegexAdapter + GitleaksAdapter (Secrets) + SemgrepAdapter (AST, SARIF) hinter gleicher Schnittstelle.
 * Ohne Binary/Docker: Graceful Fallback auf Regex/Gitleaks-Fallback, kein Crash.
 */

import { promises as fs } from "fs";
import path from "path";
import pino from "pino";
import type { SecurityIssue, FileAnalysis } from "../../models/index.js";
import type { ScannerAdapter } from "./adapter.js";
import { RegexAdapter } from "./adapters/regex-adapter.js";
import { GitleaksAdapter } from "./adapters/gitleaks-adapter.js";
import { SemgrepAdapter } from "./adapters/semgrep-adapter.js";
import { DependencyAdapter } from "./adapters/dependency-adapter.js";
import { OsvAdapter } from "./adapters/osv-adapter.js";
import { RuffAdapter } from "./adapters/ruff-adapter.js";
import { dedupIssues, SEVERITY_ORDER } from "./dedup.js";
import { categoryOf } from "./categories.js";
import { enrichIssues } from "./finding-knowledge.js";
import { maskIssueFrames, maskSecretText } from "./redact.js";
import { resolveConfig, type ResolvedScanConfig } from "./scan-config.js";
import { semgrepRuleDirs } from "./rule-packs.js";

export class SecurityScanner {
  private logger: pino.Logger;
  private adapters: ScannerAdapter[];
  private gitleaksAdapter: GitleaksAdapter | null = null;
  private dependencyAdapter: DependencyAdapter = new DependencyAdapter();
  private osvAdapter: OsvAdapter = new OsvAdapter();
  private ruffAdapter: RuffAdapter = new RuffAdapter();
  private config: ResolvedScanConfig;
  /** One CVE question per scan: the batch phase and the dependency phase share it */
  private cveAnswered = false;
  semgrepAdapter: SemgrepAdapter | null = null;

  constructor(adapters?: ScannerAdapter[], config?: ResolvedScanConfig) {
    this.logger = pino({ name: "security-scanner" });
    this.config = config ?? resolveConfig().config;
    if (adapters) {
      this.adapters = adapters;
    } else {
      const semgrep = new SemgrepAdapter();
      this.semgrepAdapter = semgrep;
      this.gitleaksAdapter = new GitleaksAdapter();
      this.adapters = [new RegexAdapter(), this.gitleaksAdapter, semgrep];
    }
    this.applyCustomPatterns();
    this.applyRulePacks();
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

    // osv covers npm too — prefer it, fall back to the npm-audit adapter
    const useOsv = this.config.tools.osv;
    const osv = useOsv ? await this.osvAdapter.scanRepository(clonePath) : new Map();
    this.cveAnswered = useOsv;
    if (useOsv && this.osvAdapter.lastBatchExecuted) {
      return {
        executed: true,
        added: this.mergeByFile(osv, fileAnalyses, "osv"),
        runner: this.osvAdapter.lastRunner,
      };
    }
    const { issuesByFile, executed } = await this.dependencyAdapter.scanRepository(clonePath);
    if (!executed || issuesByFile.size === 0) return { executed: false, added: 0, runner: null };
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
        } as unknown as FileAnalysis;
        fileAnalyses.push(target);
      }
      enrichIssues(issues, target.content);
      const merged = this.filterForPath(dedupIssues([...target.vulnerabilities, ...issues]), rel);
      added += merged.length - target.vulnerabilities.length;
      target.vulnerabilities = merged.sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line,
      );
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
    deduped.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line,
    );
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

  /** Severity threshold + type allow/denylist from the scan config */
  private configFilterAllows(issue: SecurityIssue): boolean {
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
    if (
      categories.length > 0 &&
      !categories.includes(issue.category ?? categoryOf(issue.type, issue.cwe))
    )
      return false;
    return true;
  }

  /** Parse ESM + CJS + dynamic imports and exports from source */
  scanFileStructure(
    filePath: string,
    content: string,
  ): {
    imports: Array<{ source: string; named: string[]; isExternal: boolean }>;
    exports: Array<{ type: string; name: string }>;
  } {
    const imports: Array<{ source: string; named: string[]; isExternal: boolean }> = [];
    const exports: Array<{ type: string; name: string }> = [];
    const seen = new Set<string>();

    const push = (source: string, named: string[]): void => {
      if (seen.has(source)) return;
      seen.add(source);
      imports.push({
        source,
        named,
        isExternal: !source.startsWith(".") && !source.startsWith("/"),
      });
    };

    let match: RegExpExecArray | null;

    // ── ESM: import { x } / import y / import type … from '…' ────────────
    const esmRegex =
      /import\s+(?:type\s+)?(?:(?:\{([^}]+)\})|(?:([\w$]+))|(?:[\w$]+\s+as\s+([\w$]+)))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = esmRegex.exec(content)) !== null) {
      const named =
        match[1]
          ?.split(",")
          .map((s: string) => s.trim().split(" as ")[0]!.trim())
          .filter(Boolean) ?? [];
      const def = match[2] ?? match[3] ?? "";
      push(match[4]!, def ? [...named, def] : named);
    }

    // ── ESM: import '…' (side-effect) ─────────────────────────────────────
    const esmSideEffect = /import\s+['"]([^'"]+)['"]/g;
    while ((match = esmSideEffect.exec(content)) !== null) {
      push(match[1]!, []);
    }

    // ── CJS: const { a, b } = require('…') / const x = require('…') ───────
    const cjsDestructured =
      /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = cjsDestructured.exec(content)) !== null) {
      const named = match[1]!
        .split(",")
        .map((s: string) =>
          s
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter(Boolean);
      push(match[2]!, named);
    }

    const cjsSimple = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = cjsSimple.exec(content)) !== null) {
      push(match[2]!, [match[1]!]);
    }

    // ── CJS: bare require('…') — e.g. inside if-guards or middleware chains
    const cjsBare = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = cjsBare.exec(content)) !== null) {
      push(match[1]!, []);
    }

    // ── Dynamic import: import('…') ────────────────────────────────────────
    const dynImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynImport.exec(content)) !== null) {
      push(match[1]!, []);
    }

    // ── ESM exports ────────────────────────────────────────────────────────
    const exportRegex =
      /export\s+(?:default\s+)?(?:function|class|const|let|var|async\s+function)\s+([\w$]+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push({ type: "named", name: match[1]! });
    }
    const defaultExportRegex = /export\s+default\s+(?:function|class)\s+([\w$]+)/g;
    while ((match = defaultExportRegex.exec(content)) !== null) {
      exports.push({ type: "default", name: match[1]! });
    }

    // ── CJS exports: module.exports / exports.x ────────────────────────────
    const cjsExportNamed = /exports\s*\.\s*([\w$]+)\s*=/g;
    while ((match = cjsExportNamed.exec(content)) !== null) {
      exports.push({ type: "named", name: match[1]! });
    }
    if (/module\.exports\s*=/.test(content)) {
      exports.push({ type: "default", name: "default" });
    }

    return { imports, exports };
  }

  /**
   * Whole-clone batch scan — gitleaks (one process for the entire repo) plus
   * semgrep (one run), merged per file and deduped against per-file findings
   * already attached to the FileAnalysis objects.
   */
  async scanRepositoryBatch(
    clonePath: string,
    fileAnalyses: FileAnalysis[],
    opts?: { gitHistory?: boolean },
  ): Promise<{
    mergedCount: number;
    gitleaksRan: boolean;
    semgrepRan: boolean;
    ruffRan: boolean;
    osvRan: boolean;
  }> {
    // Read contents once, then run gitleaks + semgrep IN PARALLEL — both are
    // independent processes and each can take a while on big repos
    const contentByPath = new Map<string, string>();
    for (const fa of fileAnalyses) {
      const abs = path.join(clonePath, fa.path);
      try {
        contentByPath.set(fa.path, await fs.readFile(abs, "utf-8"));
      } catch {
        // ignore unreadable
      }
    }

    const gitleaksTask = (async (): Promise<Map<string, SecurityIssue[]> | null> => {
      if (!this.gitleaksAdapter || !this.config.tools.gitleaks) return null;
      try {
        return await this.gitleaksAdapter.scanRepository(clonePath, {
          gitHistory: opts?.gitHistory,
        });
      } catch (e) {
        this.logger.warn({ e }, "Gitleaks batch scan failed — secrets only via fallback");
        return null;
      }
    })();

    const semgrepTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
      if (!this.semgrepAdapter || !this.config.tools.semgrep) return new Map();
      try {
        return await this.scanBatch(clonePath, contentByPath);
      } catch (e) {
        this.logger.warn({ e }, "Semgrep batch scan failed — continuing with regex results");
        return new Map();
      }
    })();

    // ruff: Python quality/security lint (parallel, batch-only)
    const ruffTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
      if (!this.config.tools.ruff) return new Map();
      try {
        return await this.ruffAdapter.scanRepository(clonePath, {
          scope:
            this.config.profile === "deep" || this.config.profile === "quality-only"
              ? "full"
              : "security",
        });
      } catch (e) {
        this.logger.warn({ e }, "ruff batch scan failed — Python lint skipped");
        return new Map();
      }
    })();

    const osvTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
      if (!this.config.tools.osv) return new Map();
      // "answered" = it was asked in this scan, whatever it brought back — the
      // dependency phase must not spend a second round trip on the same question
      this.cveAnswered = true;
      try {
        const found = await this.osvAdapter.scanRepository(clonePath);
        return found;
      } catch (e) {
        this.logger.warn({ e }, "osv batch scan failed — CVEs skipped");
        return new Map();
      }
    })();

    const [secretsByFile, semgrepByFile, ruffByFile, osvByFile] = await Promise.all([
      gitleaksTask,
      semgrepTask,
      ruffTask,
      osvTask,
    ]);

    let mergedCount = 0;
    for (const fa of fileAnalyses) {
      const extras: SecurityIssue[] = [
        ...(secretsByFile?.get(fa.path) ?? []),
        ...(semgrepByFile.get(fa.path) ?? []),
        ...(ruffByFile.get(fa.path) ?? []),
        ...(osvByFile.get(fa.path) ?? []),
      ];
      if (extras.length === 0) continue;
      const allowed = this.filterForPath(extras, fa.path);
      if (allowed.length === 0) continue;

      // Batch findings arrive without content — enrich with knowledge + code
      // frame against the on-disk content read above
      enrichIssues(allowed, contentByPath.get(fa.path));
      for (const iss of allowed) {
        if (!iss.code && iss.provenance?.startsWith("gitleaks")) {
          // This is the line the report will show. gitleaks only names the file
          // and line, so the text has to be read from disk here — and it must
          // arrive masked, because enrichIssues ran before this fill.
          const raw = contentByPath.get(fa.path)?.split("\n")[iss.line - 1]?.trim().slice(0, 120);
          const masked = raw ? maskSecretText(raw) : raw;
          if (masked) iss.code = masked;
        }
      }

      const merged = dedupIssues([...fa.vulnerabilities, ...allowed]);
      mergedCount += merged.length - fa.vulnerabilities.length;
      merged.sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line,
      );
      fa.vulnerabilities = merged;
    }

    return {
      mergedCount,
      gitleaksRan: secretsByFile !== null,
      semgrepRan: this.semgrepAdapter?.lastBatchExecuted ?? false,
      ruffRan: this.ruffAdapter.lastBatchExecuted,
      osvRan: this.osvAdapter.lastBatchExecuted,
    };
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
      const fp = (issue as unknown as Record<string, unknown>)._filePath as string | undefined;
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
