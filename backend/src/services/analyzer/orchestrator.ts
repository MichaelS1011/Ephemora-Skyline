/**
 * AnalysisOrchestrator — Glues clone → parse → scan → build pipeline together.
 *
 * Pipeline:
 * 1. Clone repo → local temp dir (via CloneManager)
 * 2. Enumerate files → read content → compute metrics
 * 3. Security scan → tag vulnerabilities
 * 4. Aggregate → produce AnalysisResult
 * 5. Stream progress via WebSocket events
 */

import { promises as fs } from "fs";
import path from "path";
import pino from "pino";
import type {
  AnalysisResult,
  FileAnalysis,
  ProjectSummary,
  GitHubRepo,
  WebSocketEvent,
} from "../../models/index.js";
import {
  countLines,
  detectLanguage,
  estimateCyclomaticComplexity,
  extractClasses,
  extractFunctions,
  extractSections,
} from "./metrics.js";
import { languageOfPath, type ResolvedScanConfig } from "../security/scan-config.js";
import { collectGitChurn, hasGitHistory } from "./git-churn.js";
import { detectDuplicates } from "./duplicates.js";
import { collectCoverage } from "./coverage.js";
import type { SecurityScanner } from "../security/scanner.js";

interface ProgressCallback {
  (event: WebSocketEvent): void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB max per file
const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".html",
  ".css",
  ".scss",
  ".json",
  ".yaml",
  ".yml",
]);

export class AnalysisOrchestrator {
  private logger: pino.Logger;
  private scanner: SecurityScanner;

  constructor(scanner: SecurityScanner) {
    this.logger = pino({ name: "analysis-orchestrator" });
    this.scanner = scanner;
  }

  /**
   * Phases 2-5 over a directory that already exists on disk (the staged
   * local-folder upload from POST /api/analyze-local). Does NOT clean up
   * dirPath — the caller owns the directory lifecycle.
   */
  async analyzeDirectory(
    analysisId: string,
    dirPath: string,
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
    config?: ResolvedScanConfig,
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    if (config) this.scanner.setConfig(config);

    const emit = (type: WebSocketEvent["type"], payload: Record<string, unknown>) => {
      const event: WebSocketEvent = {
        type,
        payload,
        timestamp: new Date().toISOString(),
      };
      this.logger.debug({ type }, "Progress event");
      progressCallback?.(event);
    };

    // --- Phase 2: Enumerate files ---
    emit("analysis_progress", { progress: 25, stage: "Enumerating files" });

    const allFiles: string[] = [];
    await this.walkDirectory(dirPath, dirPath, allFiles);

    const totalFiles = allFiles.length;
    this.logger.info(
      { totalFiles, repo: `${repo.owner}/${repo.name}` },
      "File enumeration complete",
    );

    // --- Phase 3: Parse + Scan each file ---
    emit("analysis_progress", { progress: 30, stage: "Parsing files", totalFiles });

    // Whole-clone batch scans (gitleaks, semgrep) replace per-file process
    // spawns — the facade merges their findings into the per-file loop.
    this.scanner.enableBatchScans();

    const fileAnalyses: FileAnalysis[] = [];
    const languageLines: Record<string, number> = {};
    // Duplicate detection needs the raw lines — collected alongside parsing
    // (content is otherwise not persisted)
    const contentMap = new Map<string, string>();

    const candidateFiles: Array<{ fullPath: string; relativePath: string }> = [];
    for (const filePath of allFiles) {
      const relativePath = filePath.replace(dirPath + "/", "");
      // Skip hidden dirs, node_modules, dist, build, .git
      if (/^(node_modules|\.git|dist|build|\.next|coverage|\.turbo)/.test(relativePath)) continue;
      if (!SUPPORTED_EXTENSIONS.has(path.extname(relativePath))) continue;
      // Scan-config scope: language allowlist + user exclude paths
      if (config?.languageScope?.length) {
        const lang = languageOfPath(relativePath);
        if (!config.languageScope.includes(lang)) continue;
      }
      if (config?.excludePaths?.some((needle) => relativePath.includes(needle))) continue;
      candidateFiles.push({ fullPath: filePath, relativePath });
    }

    const PARALLEL_BATCH_SIZE = 16;
    for (let i = 0; i < candidateFiles.length; i += PARALLEL_BATCH_SIZE) {
      const batch = candidateFiles.slice(i, i + PARALLEL_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async ({ fullPath, relativePath }, idx) => {
          const fileIndex = i + idx;
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            // Skip oversized files
            if (content.length > MAX_FILE_SIZE) return null;

            emit("file_parsing_started", {
              file: relativePath,
              progress: Math.round((fileIndex / totalFiles) * 60) + 30,
            });

            const lines = countLines(content);
            const language = detectLanguage(relativePath);
            const cyclomatic = estimateCyclomaticComplexity(content, language);

            const vulnerabilities = await this.scanner.scanFile(relativePath, content);
            const { imports: rawImports, exports: fileExports } = this.scanner.scanFileStructure(
              relativePath,
              content,
            );
            const imports = rawImports.map((imp) => ({ ...imp, line: 0 }));

            // Extract functions (simple regex-based)
            const functions = extractFunctions(content);
            const classes = extractClasses(content);
            // Voxel sections (CodeBlocks): blocks from the found structure
            const sections = extractSections(relativePath, content, { functions, classes });

            const analysis: FileAnalysis = {
              path: relativePath,
              language,
              lines,
              bytes: Buffer.byteLength(content, "utf-8"),
              complexity: { cyclomatic },
              functions,
              classes,
              sections,
              imports,
              exports: fileExports.map((e) => ({
                type: e.type as "named" | "default" | "reexport",
                name: e.name,
                line: 0, // would need AST for line numbers
              })),
              vulnerabilities,
            };

            emit("file_parsed", {
              file: relativePath,
              progress: Math.round((fileIndex / totalFiles) * 60) + 30,
            });

            contentMap.set(relativePath, content);
            return analysis;
          } catch {
            return null;
          }
        }),
      );

      for (const res of results) {
        if (!res) continue;
        fileAnalyses.push(res);
        languageLines[res.language] = (languageLines[res.language] || 0) + res.lines.code;
      }
    }

    // --- Phase 3b: Batch scans (gitleaks + semgrep + ruff + osv) — one process each on the clone, merged per file ---
    let scanProvenance: {
      gitleaksRan: boolean;
      semgrepRan: boolean;
      depsRan: boolean;
      ruffRan: boolean;
      osvRan: boolean;
      churnRan: boolean;
      duplicatesRan: boolean;
      coverageRan: boolean;
    } = {
      gitleaksRan: false,
      semgrepRan: false,
      depsRan: false,
      ruffRan: false,
      osvRan: false,
      churnRan: false,
      duplicatesRan: false,
      coverageRan: false,
    };
    try {
      emit("analysis_progress", { progress: 88, stage: "Deep scan (semgrep + gitleaks)" });
      const batch = await this.scanner.scanRepositoryBatch(dirPath, fileAnalyses, {
        gitHistory: repo.fullHistory,
      });
      scanProvenance.gitleaksRan = batch.gitleaksRan;
      scanProvenance.semgrepRan = batch.semgrepRan;
      scanProvenance.ruffRan = batch.ruffRan;
      scanProvenance.osvRan = batch.osvRan;
    } catch (e) {
      this.logger.warn({ e }, "Batch scan failed — continuing with regex results");
    }

    // --- Phase 3c: Dependency scan (npm audit) — supply-chain findings ---
    try {
      emit("analysis_progress", { progress: 89, stage: "Dependency audit (npm)" });
      const deps = await this.scanner.scanDependencies(dirPath, fileAnalyses);
      scanProvenance.depsRan = deps.executed;
    } catch (e) {
      this.logger.warn({ e }, "Dependency scan failed — continuing without CVE findings");
    }

    // --- Phase 3d: Git churn (hotspot analysis, clone-based scans only) ---
    try {
      if (await hasGitHistory(dirPath)) {
        emit("analysis_progress", { progress: 90, stage: "Analyzing git history" });
        const churn = await collectGitChurn(dirPath);
        if (churn.meaningful) {
          for (const f of fileAnalyses) {
            const c = churn.byPath.get(f.path);
            if (c) f.churn = c;
          }
          scanProvenance.churnRan = true;
        } else {
          this.logger.debug(
            { totalCommits: churn.totalCommits },
            "Git history too shallow for churn scores",
          );
        }
      }
    } catch (e) {
      this.logger.warn({ e }, "Git churn analysis failed — continuing without erosion data");
    }

    // --- Phase 3e: Code duplicates (copy-paste detection) ---
    try {
      if (contentMap.size > 1) {
        emit("analysis_progress", { progress: 91, stage: "Detecting code duplicates" });
        const dup = detectDuplicates(contentMap);
        for (const f of fileAnalyses) {
          const partners = dup.byPath.get(f.path);
          if (partners && partners.length > 0) f.clonePartners = partners;
        }
        scanProvenance.duplicatesRan = dup.pairs.length > 0;
        contentMap.clear(); // free the memory — content is never persisted
      }
    } catch (e) {
      this.logger.warn({ e }, "Duplicate detection failed — continuing without clone data");
    }

    // --- Phase 3f: Test coverage (read existing lcov reports, never run tests) ---
    try {
      emit("analysis_progress", { progress: 92, stage: "Reading coverage reports" });
      const cov = await collectCoverage(dirPath);
      if (cov.source) {
        for (const f of fileAnalyses) {
          const pct = cov.byPath.get(f.path);
          if (pct !== undefined) f.coveragePct = pct;
        }
        scanProvenance.coverageRan = true;
      }
    } catch (e) {
      this.logger.warn({ e }, "Coverage parsing failed — continuing without shields");
    }

    // --- Phase 5: Aggregate summary ---
    const totalLines = fileAnalyses.reduce((sum, f) => sum + f.lines.total, 0);
    const totalVulns = fileAnalyses.reduce((sum, f) => sum + f.vulnerabilities.length, 0);
    const vulnerabilitiesBySeverity = this.scanner.countBySeverity(
      fileAnalyses.flatMap((f) => f.vulnerabilities),
    );
    const allCyclomatic = fileAnalyses.map((f) => f.complexity.cyclomatic);
    const avgCyclomatic =
      allCyclomatic.length > 0
        ? Math.round((allCyclomatic.reduce((a, b) => a + b, 0) / allCyclomatic.length) * 100) / 100
        : 0;
    const maxCyclomatic = allCyclomatic.length > 0 ? Math.max(...allCyclomatic) : 0;

    const summary: ProjectSummary = {
      totalFiles: fileAnalyses.length,
      totalDirectories: 0,
      totalLines,
      avgCyclomatic,
      maxCyclomatic,
      languages: languageLines,
      totalVulnerabilities: totalVulns,
      vulnerabilitiesBySeverity,
      languagesByLines: languageLines,
      // Honest provenance: "complete" doesn't imply semgrep/gitleaks ran
      scanProvenance: {
        regex: true,
        gitleaks: scanProvenance.gitleaksRan,
        semgrep: scanProvenance.semgrepRan,
        dependencies: scanProvenance.depsRan,
        osv: scanProvenance.osvRan,
        ruff: scanProvenance.ruffRan,
        churn: scanProvenance.churnRan,
        duplicates: scanProvenance.duplicatesRan,
        coverage: scanProvenance.coverageRan,
      },
    };

    emit("analysis_progress", { progress: 95, stage: "Finalizing results" });

    const result: AnalysisResult = {
      id: analysisId,
      repo,
      files: fileAnalyses,
      directories: [], // structure lives in cityMapper's own trie — never consumed here
      summary,
      createdAt: new Date().toISOString(),
      status: "complete",
    };

    emit("analysis_progress", {
      progress: 100,
      stage: "Analysis complete",
      totalFiles: result.summary.totalFiles,
    });
    emit("analysis_complete", {
      id: analysisId,
      totalFiles: result.summary.totalFiles,
      duration: Date.now() - startTime,
    });

    this.logger.info(
      { analysisId, totalFiles: result.summary.totalFiles, totalVulns },
      "Analysis complete",
    );
    return result;
  }

  /** Recursively walk directory and collect file paths */
  private async walkDirectory(
    basePath: string,
    currentPath: string,
    files: string[],
  ): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip directories with no relevant source — must stay in sync with
      // SKIP_DIRS in frontend/src/hooks/useLocalAnalysis.ts
      if (
        /^(node_modules|\.git|dist|build|out|\.next|\.nuxt|coverage|\.turbo|\.vscode|\.idea|__pycache__|\.venv|venv|target|vendor|\.pytest_cache|\.mypy_cache|\.gradle|Pods|bin|obj)$/i.test(
          entry.name,
        )
      )
        continue;
      if (/^\.(hidden|DS_Store)$/.test(entry.name)) continue;

      // Symlinks in untrusted repos could point anywhere on disk (e.g.
      // /etc/passwd) — never follow them into reads or recursion.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }
}
