/**
 * Whole-clone batch scan — gitleaks (one process for the entire repo) plus
 * semgrep (one run), merged per file and deduped against per-file findings
 * already attached to the FileAnalysis objects.
 *
 * Extracted from `SecurityScanner.scanRepositoryBatch` (K7). The engine state,
 * the config and the per-finding judges live on the scanner, so this module
 * receives them through the typed context below and never reaches into the
 * class. The scanner keeps a delegating method with the same signature for
 * its callers.
 */

import { promises as fs } from "fs";
import path from "path";
import type { Logger } from "pino";
import type { SecurityIssue, FileAnalysis } from "../../models/index.js";
import type { ResolvedScanConfig } from "./scan-config.js";
import { dedupIssues, compareBySeverityThenLine } from "./dedup.js";
import { enrichIssues } from "./finding-knowledge.js";
import { maskSecretText } from "./redact.js";
import { suppressLocalDuplicates } from "./local-rules.js";
import type { GitleaksEngine, OsvEngine, RuffEngine, SemgrepEngine } from "./scanner.js";

/** What the batch run borrows from its scanner — the scanner's half of the seam. */
export interface BatchScanContext {
  logger: Logger;
  config: ResolvedScanConfig;
  gitleaks: GitleaksEngine | null;
  semgrep: SemgrepEngine | null;
  ruff: RuffEngine;
  osv: OsvEngine;
  /** `SecurityScanner.filterForPath` — the single judge of a finding. */
  filterForPath(issues: SecurityIssue[], filePath: string): SecurityIssue[];
  /** `SecurityScanner.scanBatch` — SARIF-aware semgrep run, keyed by repo-relative path. */
  scanBatch(
    clonePath: string,
    contentByPath: Map<string, string>,
  ): Promise<Map<string, SecurityIssue[]>>;
  /** One CVE question per scan: the batch and dependency phases share it. */
  markCveAsked(): void;
  /** osv brought an answer back (or did not) — the dependency phase must not ask again. */
  setCveAnswered(value: boolean): void;
}

export interface RepositoryBatchResult {
  mergedCount: number;
  gitleaksRan: boolean;
  semgrepRan: boolean;
  ruffRan: boolean;
  osvRan: boolean;
}

export async function runRepositoryBatch(
  ctx: BatchScanContext,
  clonePath: string,
  fileAnalyses: FileAnalysis[],
  opts?: { gitHistory?: boolean },
): Promise<RepositoryBatchResult> {
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
    if (!ctx.gitleaks || !ctx.config.tools.gitleaks) return null;
    try {
      return await ctx.gitleaks.scanRepository(clonePath, {
        gitHistory: opts?.gitHistory,
      });
    } catch (e) {
      ctx.logger.warn({ e }, "Gitleaks batch scan failed — secrets only via fallback");
      return null;
    }
  })();

  const semgrepTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
    if (!ctx.semgrep || !ctx.config.tools.semgrep) return new Map();
    try {
      return await ctx.scanBatch(clonePath, contentByPath);
    } catch (e) {
      ctx.logger.warn({ e }, "Semgrep batch scan failed — continuing with regex results");
      return new Map();
    }
  })();

  // ruff: Python quality/security lint (parallel, batch-only)
  const ruffTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
    if (!ctx.config.tools.ruff) return new Map();
    try {
      return await ctx.ruff.scanRepository(clonePath, {
        scope: ctx.config.profile === "deep" ? "full" : "security",
      });
    } catch (e) {
      ctx.logger.warn({ e }, "ruff batch scan failed — Python lint skipped");
      return new Map();
    }
  })();

  const osvTask = (async (): Promise<Map<string, SecurityIssue[]>> => {
    if (!ctx.config.tools.osv) return new Map();
    ctx.markCveAsked();
    try {
      const found = await ctx.osv.scanRepository(clonePath);
      // "answered" means an answer came back. A scan that never ran leaves the
      // question open for the dependency phase's fallback, and reporting it as
      // answered is how `dependencies: true` reached a payload with no
      // dependency engine on the machine.
      ctx.setCveAnswered(ctx.osv.lastBatchExecuted);
      return found;
    } catch (e) {
      ctx.logger.warn({ e }, "osv batch scan failed — CVEs skipped");
      ctx.setCveAnswered(false);
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
    const semgrepForFile = semgrepByFile.get(fa.path) ?? [];
    const extras: SecurityIssue[] = [
      ...(secretsByFile?.get(fa.path) ?? []),
      ...semgrepForFile,
      ...(ruffByFile.get(fa.path) ?? []),
      ...(osvByFile.get(fa.path) ?? []),
    ];

    /**
     * The two rule channels, one answer per line.
     *
     * The local matcher and semgrep read the same YAML pack, so on a machine
     * that has the engine both of them can describe the same line. The rule is
     * written down in one place — `suppressLocalDuplicates()` — and it always
     * favors the engine: the in-process matcher is what a machine without
     * semgrep gets, not a second opinion on a machine that has one. Without
     * this, the per-file findings are already in `fa.vulnerabilities` when the
     * engine's arrive, and `dedupIssues()` keeps the first for a line and type,
     * which would silently replace the engine's verdict with ours.
     */
    const existing =
      semgrepForFile.length > 0
        ? suppressLocalDuplicates(fa.vulnerabilities, semgrepForFile)
        : fa.vulnerabilities;

    if (extras.length === 0) continue;
    const allowed = ctx.filterForPath(extras, fa.path);
    if (allowed.length === 0) continue;

    // gitleaks names the file and line only, so the line the report shows has
    // to be read from disk here — BEFORE enrichment, because enrichment
    // consumes the matched value, and masking a line that was already clipped
    // at 120 characters can leave the back half of a credential behind.
    for (const iss of allowed) {
      if (
        !iss.code &&
        iss.provenance?.startsWith("gitleaks") &&
        iss.provenance !== "gitleaks-history"
      ) {
        const raw = contentByPath.get(fa.path)?.split("\n")[iss.line - 1]?.trim();
        const masked = raw ? maskSecretText(raw, iss.secretValue ?? []) : undefined;
        if (masked) iss.code = masked.slice(0, 120);
      }
    }

    // Batch findings arrive without content — enrich with knowledge + code
    // frame against the on-disk content read above
    enrichIssues(allowed, contentByPath.get(fa.path));

    const merged = dedupIssues([...existing, ...allowed]);
    mergedCount += merged.length - existing.length;
    merged.sort(compareBySeverityThenLine);
    fa.vulnerabilities = merged;
  }

  return {
    mergedCount,
    gitleaksRan: secretsByFile !== null,
    semgrepRan: ctx.semgrep?.lastBatchExecuted ?? false,
    ruffRan: ctx.ruff.lastBatchExecuted,
    osvRan: ctx.osv.lastBatchExecuted,
  };
}
