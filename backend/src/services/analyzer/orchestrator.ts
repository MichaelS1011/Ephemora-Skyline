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
} from "./metrics.js";
import type { CloneManager } from "../github/clone-manager.js";
import type { GitHubClient } from "../github/client.js";
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
  private cloneManager: CloneManager;
  private githubClient: GitHubClient;
  private scanner: SecurityScanner;

  constructor(cloneManager: CloneManager, githubClient: GitHubClient, scanner: SecurityScanner) {
    this.logger = pino({ name: "analysis-orchestrator" });
    this.cloneManager = cloneManager;
    this.githubClient = githubClient;
    this.scanner = scanner;
  }

  /** Analyze a GitHub repository: clone, then run the shared directory pipeline */
  async analyzeRepo(
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
    analysisId: string = crypto.randomUUID(),
  ): Promise<AnalysisResult> {
    const emit = (type: WebSocketEvent["type"], payload: Record<string, unknown>) => {
      const event: WebSocketEvent = {
        type,
        payload,
        timestamp: new Date().toISOString(),
      };
      this.logger.debug({ type }, "Progress event");
      progressCallback?.(event);
    };

    emit("repo_cloned", { repo: `${repo.owner}/${repo.name}` });
    emit("analysis_progress", {
      progress: 10,
      stage: "Cloning repository",
      repo: `${repo.owner}/${repo.name}`,
    });

    let clonePath: string;
    try {
      clonePath = await this.cloneManager.cloneRepo(repo);
    } catch (error) {
      this.logger.error({ error, repo }, "Clone failed, trying API fallback");
      // Fallback: try to use GitHub API directly
      return this.analyzeViaApi(analysisId, repo, progressCallback);
    }

    try {
      return await this.analyzeDirectory(analysisId, clonePath, repo, progressCallback);
    } finally {
      // Clones are never reused — delete immediately so temp disk usage
      // doesn't accumulate across analyses
      await this.cloneManager.cleanup(clonePath).catch(() => {});
    }
  }

  /**
   * Phases 2-5 over a directory that already exists on disk — shared by the
   * git-clone path and the local-folder upload path (POST /api/analyze-local).
   * Does NOT clean up dirPath — the caller owns the directory lifecycle.
   */
  async analyzeDirectory(
    analysisId: string,
    dirPath: string,
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

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

    for (let i = 0; i < allFiles.length; i++) {
      const relativePath = allFiles[i]!.replace(dirPath + "/", "");

      // Skip hidden dirs, node_modules, dist, build, .git
      if (/^(node_modules|\.git|dist|build|\.next|coverage|\.turbo)/.test(relativePath)) continue;
      if (!SUPPORTED_EXTENSIONS.has(path.extname(relativePath))) continue;

      try {
        const content = await fs.readFile(allFiles[i]!, "utf-8");

        // Skip oversized files
        if (content.length > MAX_FILE_SIZE) continue;

        emit("file_parsing_started", {
          file: relativePath,
          progress: Math.round((i / totalFiles) * 60) + 30,
        });

        const lines = countLines(content);
        const language = detectLanguage(relativePath);
        const cyclomatic = estimateCyclomaticComplexity(content);

        const vulnerabilities = await this.scanner.scanFile(relativePath, content);
        const { imports: rawImports, exports: fileExports } = this.scanner.scanFileStructure(
          relativePath,
          content,
        );
        const imports = rawImports.map((imp) => ({ ...imp, line: 0 }));

        // Extract functions (simple regex-based)
        const functions = extractFunctions(content);
        const classes = extractClasses(content);

        const fileAnalysis: FileAnalysis = {
          path: relativePath,
          language,
          lines,
          complexity: { cyclomatic: cyclomatic, cognitive: cyclomatic },
          functions,
          classes,
          imports,
          exports: fileExports.map((e) => ({
            type: e.type as "named" | "default" | "reexport",
            name: e.name,
            line: 0, // would need AST for line numbers
          })),
          vulnerabilities,
        };

        fileAnalyses.push(fileAnalysis);

        // Update language lines
        languageLines[language] = (languageLines[language] || 0) + lines.code;

        emit("file_parsed", {
          file: relativePath,
          progress: Math.round((i / totalFiles) * 60) + 30,
        });
      } catch {
        // Skip files that can't be read
      }
    }

    // --- Phase 3b: Batch scans (gitleaks + semgrep) — one process each on the clone, merged per file ---
    let scanProvenance: { gitleaksRan: boolean; semgrepRan: boolean; depsRan: boolean } = {
      gitleaksRan: false,
      semgrepRan: false,
      depsRan: false,
    };
    try {
      emit("analysis_progress", { progress: 88, stage: "Deep scan (semgrep + gitleaks)" });
      const batch = await this.scanner.scanRepositoryBatch(dirPath, fileAnalyses, {
        gitHistory: repo.fullHistory,
      });
      scanProvenance.gitleaksRan = batch.gitleaksRan;
      scanProvenance.semgrepRan = batch.semgrepRan;
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

  /** Fallback analysis via GitHub API (no clone needed) */
  private async analyzeViaApi(
    analysisId: string,
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
  ): Promise<AnalysisResult> {
    this.logger.info({ repo: `${repo.owner}/${repo.name}` }, "Falling back to API-based analysis");

    try {
      const fileList = await this.githubClient.listRootFiles(repo);
      const totalFiles = fileList.length;
      const fileAnalyses: FileAnalysis[] = [];

      emitProgress(30);

      for (let i = 0; i < Math.min(totalFiles, 200); i++) {
        try {
          const content = await this.githubClient.getFileContent(repo, fileList[i]!);
          const lines = countLines(content);
          const language = detectLanguage(fileList[i]!);
          const vulnerabilities = await this.scanner.scanFile(fileList[i]!, content);
          const { imports: rawImports, exports: fileExports } = this.scanner.scanFileStructure(
            fileList[i]!,
            content,
          );
          const imports = rawImports.map((imp) => ({ ...imp, line: 0 }));

          fileAnalyses.push({
            path: fileList[i]!,
            language,
            lines,
            complexity: {
              cyclomatic: estimateCyclomaticComplexity(content),
              cognitive: estimateCyclomaticComplexity(content),
            },
            functions: extractFunctions(content),
            classes: extractClasses(content),
            imports,
            exports: fileExports.map((e) => ({
              type: e.type as "named" | "default" | "reexport",
              name: e.name,
              line: 0,
            })),
            vulnerabilities,
          });
        } catch {
          // Skip files that fail
        }
        emitProgress(30 + Math.round((i / Math.min(totalFiles, 200)) * 60));
      }

      const totalVulns = fileAnalyses.reduce((s, f) => s + f.vulnerabilities.length, 0);
      const vulnBySeverity = this.scanner.countBySeverity(
        fileAnalyses.flatMap((f) => f.vulnerabilities),
      );
      const langLines: Record<string, number> = {};
      for (const f of fileAnalyses) {
        langLines[f.language] = (langLines[f.language] || 0) + f.lines.code;
      }

      const result: AnalysisResult = {
        id: analysisId,
        repo,
        files: fileAnalyses,
        directories: [],
        summary: {
          totalFiles: fileAnalyses.length,
          totalDirectories: 0,
          totalLines: fileAnalyses.reduce((s, f) => s + f.lines.total, 0),
          avgCyclomatic: 0,
          maxCyclomatic: 0,
          languages: langLines,
          totalVulnerabilities: totalVulns,
          vulnerabilitiesBySeverity: vulnBySeverity,
          languagesByLines: langLines,
        },
        createdAt: new Date().toISOString(),
        status: "complete",
      };

      emitProgress(100);
      return result;
    } catch (error) {
      this.logger.error({ error }, "API analysis failed completely");
      return {
        id: analysisId,
        repo,
        files: [],
        directories: [],
        summary: {
          totalFiles: 0,
          totalDirectories: 0,
          totalLines: 0,
          avgCyclomatic: 0,
          maxCyclomatic: 0,
          languages: {},
          totalVulnerabilities: 0,
          vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
          languagesByLines: {},
        },
        createdAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "API analysis failed",
      };
    }

    function emitProgress(progress: number) {
      progressCallback?.({
        type: "analysis_progress",
        payload: { progress, stage: "Analyzing via API" },
        timestamp: new Date().toISOString(),
      });
    }
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

      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }
}
