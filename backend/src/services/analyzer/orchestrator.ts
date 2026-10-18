/**
 * AnalysisOrchestrator — glues read → parse → scan → aggregate together.
 *
 * Pipeline:
 * 1. Walk the folder the user picked (staged copy under the uploads root) —
 *    there is no clone step and no remote to clone from
 * 2. Enumerate files → read content → compute metrics
 * 3. Security scan → tag vulnerabilities
 * 4. Aggregate → produce AnalysisResult
 * 5. Emit progress events for the job-progress map (GET /api/status/:id)
 */

import { promises as fs } from "fs";
import path from "path";
import pino from "pino";
import type {
  AnalysisResult,
  DroppedFiles,
  FileAnalysis,
  ProjectSummary,
  GitHubRepo,
  ProgressEvent,
} from "../../models/index.js";
import {
  countLines,
  detectLanguage,
  ENV_FILE,
  estimateCyclomaticComplexity,
  extractClasses,
  extractFunctions,
  extractSections,
  isDataFile,
} from "./metrics.js";
import { languageOfPath, type ResolvedScanConfig } from "../security/scan-config.js";
import { collectGitChurn, hasGitHistory } from "./git-churn.js";
import { detectDuplicates } from "./duplicates.js";
import { collectCoverage } from "./coverage.js";
import { structureNotes } from "./structure-advice.js";
import { IgnoreMatcher } from "./gitignore.js";
import type { SecurityScanner } from "../security/scanner.js";

interface ProgressCallback {
  (event: ProgressEvent): void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB max per file
export const SUPPORTED_EXTENSIONS = new Set([
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
  // Shell/SQL/infra files are where deploy accidents live — a folder scan that
  // never uploads them cannot claim to have looked at the project's scripts.
  ".sh",
  ".bash",
  ".sql",
  ".tf",
  ".php",
  ".cs",
  ".kt",
  ".swift",
]);

/**
 * Does this path join the scan? An extension from the list above, or an env file
 * — `.env` has no extension to look up (`path.extname(".env")` is empty), and
 * the file that holds the deployment secrets was silently outside the scan the
 * user thought they had run.
 */
export function isScannedPath(relativePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(relativePath)) || ENV_FILE.test(relativePath);
}

/**
 * Names that mark a path segment as tool output rather than source: build
 * folders, coverage and test traces, dependency and cache directories. A
 * user's repo produces these the same way ours does, and a .gitignore is the
 * project's courtesy, not the scanner's safety net — so the analyzer excludes
 * them even where nothing ignores them.
 *
 * The test is exact per segment on purpose. The check this replaced matched
 * prefixes without a boundary: `.gitlab-ci.yml`, `.github/workflows/ci.yml`,
 * `distribute.ts` and `builder/main.ts` were measured out of the scan by the
 * tool's own selection — real source silently missing.
 */
const ARTIFACT_SEGMENT =
  /^(?:node_modules|\.git|dist|build|out|\.next|\.nuxt|coverage|\.nyc_output|\.turbo|\.vscode|\.idea|__pycache__|\.venv|venv|target|vendor|\.pytest_cache|\.mypy_cache|\.gradle|Pods|bin|obj|playwright-report|test-results|blob-report|storybook-static)$/i;

/** Does any segment of this project-relative path name tool output? */
export function isArtifactPath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => ARTIFACT_SEGMENT.test(segment));
}

/**
 * The user's own exclude folders, applied the same way on the server as in the
 * browser's reader: a needle is a substring of the project-relative path. Empty
 * needles are ignored rather than honoured — `path.includes("")` is true for
 * every file, so an accidental blank entry would silently empty the city.
 */
export function isExcludedPath(relativePath: string, needles: string[]): boolean {
  return needles.some((needle) => needle.length > 0 && relativePath.includes(needle));
}

/** The eight counters, all at zero. */
export function emptyDroppedFiles(): DroppedFiles {
  return {
    pathTooLong: 0,
    unsafePath: 0,
    tooLarge: 0,
    unreadable: 0,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 0,
  };
}

/** Sum of two accounting records — the upload side and the read side. */
export function sumDroppedFiles(...records: Array<DroppedFiles | undefined>): DroppedFiles {
  const total = emptyDroppedFiles();
  for (const record of records) {
    if (!record) continue;
    for (const key of Object.keys(total) as Array<keyof DroppedFiles>) {
      const value = record[key];
      total[key] += Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }
  }
  return total;
}

/** Thrown when the person who started a scan asked for it to stop. */
export class ScanCancelledError extends Error {
  constructor() {
    super("Analysis cancelled");
    this.name = "ScanCancelledError";
  }
}

/**
 * The ONE place that decides whether a path joins the scan: source-shaped
 * (extension or env file) and no segment that names tool output. Both the
 * directory walk and the candidate loop read this decision.
 */
export function isScanCandidate(relativePath: string): boolean {
  return isScannedPath(relativePath) && !isArtifactPath(relativePath);
}

/**
 * The list a user sees when a folder turns out to be empty. It used to be typed
 * out by hand in the error message, where it drifted: thirteen of the kinds were
 * named and the rest (shell, SQL, terraform, php, and the rest) were not, so the
 * message told the user the scan was narrower than it is.
 */
export function supportedExtensionsLabel(): string {
  return [...SUPPORTED_EXTENSIONS].map((e) => e.slice(1)).join(", ") + ", .env";
}

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
   *
   * `shouldStop` is checked at every phase boundary and between parse batches:
   * an abandoned scan stops within one batch instead of running to completion
   * over files nobody is waiting for any more.
   */
  async analyzeDirectory(
    analysisId: string,
    dirPath: string,
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
    config?: ResolvedScanConfig,
    shouldStop?: () => boolean,
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    if (config) this.scanner.setConfig(config);

    const emit = (progress: number, stage: string) => {
      const event: ProgressEvent = { progress, stage };
      this.logger.debug({ progress, stage }, "Progress event");
      progressCallback?.(event);
    };
    const stop = (): void => {
      if (shouldStop?.()) throw new ScanCancelledError();
    };

    // --- Phase 2: Enumerate files ---
    stop();
    emit(25, "Enumerating files");

    const allFiles: string[] = [];
    const gitignore = new IgnoreMatcher();
    const skippedByGitignore = { files: 0, directories: 0 };
    await this.walkDirectory(dirPath, dirPath, allFiles, gitignore, skippedByGitignore);

    const totalFiles = allFiles.length;
    this.logger.info(
      { totalFiles, repo: `${repo.owner}/${repo.name}` },
      "File enumeration complete",
    );

    // --- Phase 3: Parse + Scan each file ---
    stop();
    emit(30, "Parsing files");

    // Whole-clone batch scans (gitleaks, semgrep) replace per-file process
    // spawns — the facade merges their findings into the per-file loop.
    this.scanner.enableBatchScans();

    const fileAnalyses: FileAnalysis[] = [];
    const languageLines: Record<string, number> = {};
    /** Why a staged file did not join the scan — counted here, not assumed away */
    const dropped = emptyDroppedFiles();
    // Duplicate detection needs the raw lines — collected alongside parsing
    // (content is otherwise not persisted)
    const contentMap = new Map<string, string>();

    const candidateFiles: Array<{ fullPath: string; relativePath: string }> = [];
    for (const filePath of allFiles) {
      const relativePath = filePath.replace(dirPath + "/", "");
      // The scan's one file-selection decision: extension shape + artifact dirs.
      // A path that leaves here left because of the scan's own breadth, and that
      // is a number the city owes the user: a folder of 17 documents rendering 0
      // buildings reads as an empty folder, not as a format the scan does not read.
      if (!isScanCandidate(relativePath)) {
        dropped.unsupportedFormat += 1;
        continue;
      }
      // Scan-config scope: language allowlist + user exclude paths
      if (config?.languageScope?.length) {
        const lang = languageOfPath(relativePath);
        if (!config.languageScope.includes(lang)) continue;
      }
      if (isExcludedPath(relativePath, config?.excludePaths ?? [])) {
        dropped.excluded += 1;
        continue;
      }
      candidateFiles.push({ fullPath: filePath, relativePath });
    }

    const PARALLEL_BATCH_SIZE = 16;
    for (let i = 0; i < candidateFiles.length; i += PARALLEL_BATCH_SIZE) {
      stop();
      const batch = candidateFiles.slice(i, i + PARALLEL_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(
          async ({ fullPath, relativePath }): Promise<FileAnalysis | "tooLarge" | "unreadable"> => {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              // Skip oversized files
              if (content.length > MAX_FILE_SIZE) return "tooLarge";

              const lines = countLines(content);
              const language = detectLanguage(relativePath);
              // Data has lines but no behaviour: no control flow to score, no
              // functions to name, no imports to draw edges from.
              const dataFile = isDataFile(relativePath, language);
              const cyclomatic = dataFile ? 1 : estimateCyclomaticComplexity(content, language);
              // The card's teaching notes. Monolith counts every line (a wall of
              // text is a wall whatever the language), height counts code lines —
              // see analyzer/structure-advice for why these are notes not findings.
              const advice = dataFile
                ? []
                : structureNotes({
                    lines: lines.total,
                    longestLine: content
                      .split(/\r?\n/)
                      .reduce((max, l) => (l.length > max ? l.length : max), 0),
                    cyclomatic,
                  });
              const vulnerabilities = await this.scanner.scanFile(relativePath, content);
              const { imports: rawImports, exports: fileExports } = dataFile
                ? { imports: [], exports: [] }
                : this.scanner.scanFileStructure(relativePath, content);
              const imports = rawImports.map((imp) => ({ ...imp, line: 0 }));

              // Extract functions (simple regex-based)
              const functions = dataFile ? [] : extractFunctions(content);
              const classes = dataFile ? [] : extractClasses(content);
              // Voxel sections (CodeBlocks): blocks from the found structure
              const sections = dataFile
                ? []
                : extractSections(relativePath, content, { functions, classes });

              const analysis: FileAnalysis = {
                path: relativePath,
                language,
                lines,
                bytes: Buffer.byteLength(content, "utf-8"),
                complexity: { cyclomatic },
                advice,
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

              contentMap.set(relativePath, content);
              return analysis;
            } catch {
              return "unreadable";
            }
          },
        ),
      );

      for (const res of results) {
        if (res === "tooLarge") {
          dropped.tooLarge += 1;
          continue;
        }
        if (res === "unreadable") {
          dropped.unreadable += 1;
          continue;
        }
        fileAnalyses.push(res);
        languageLines[res.language] = (languageLines[res.language] || 0) + res.lines.code;
      }
      // A share of the files actually parsed, not a jump: the bar used to sit at
      // 30% for the whole read and then leap to 88%.
      if (candidateFiles.length > 0) {
        const done = Math.min(candidateFiles.length, i + PARALLEL_BATCH_SIZE);
        emit(30 + Math.round((done / candidateFiles.length) * 55), "Parsing files");
      }
    }

    // --- Phase 3b: Batch scans (gitleaks + semgrep + ruff + osv) — one process each on the clone, merged per file ---
    let scanProvenance: {
      gitleaksRan: boolean;
      semgrepRan: boolean;
      depsRan: boolean;
      /** Which engine answered the CVE question: `npm-audit`, `osv`, `pip-audit`. */
      depsRunner: string | null;
      ruffRan: boolean;
      osvRan: boolean;
      churnRan: boolean;
      duplicatesRan: boolean;
      coverageRan: boolean;
    } = {
      gitleaksRan: false,
      semgrepRan: false,
      depsRan: false,
      depsRunner: null as string | null,
      ruffRan: false,
      osvRan: false,
      churnRan: false,
      duplicatesRan: false,
      coverageRan: false,
    };
    stop();
    try {
      emit(88, "Deep scan (semgrep + gitleaks)");
      const batch = await this.scanner.scanRepositoryBatch(dirPath, fileAnalyses, {
        // The "Deep" profile is the only one that promises secrets in git
        // history, and nothing used to read that toggle: repo.fullHistory is a
        // GitHub-clone flag, so a locally scanned folder never got the pass.
        gitHistory: config?.tools.gitleaksHistory === true || repo.fullHistory === true,
      });
      scanProvenance.gitleaksRan = batch.gitleaksRan;
      scanProvenance.semgrepRan = batch.semgrepRan;
      scanProvenance.ruffRan = batch.ruffRan;
      scanProvenance.osvRan = batch.osvRan;
    } catch (e) {
      this.logger.warn({ e }, "Batch scan failed — continuing with regex results");
    }

    // --- Phase 3c: Dependency scan (npm audit) — supply-chain findings ---
    stop();
    try {
      emit(89, "Dependency audit (npm)");
      const deps = await this.scanner.scanDependencies(dirPath, fileAnalyses);
      scanProvenance.depsRan = deps.executed;
      scanProvenance.depsRunner = deps.runner ?? null;
    } catch (e) {
      this.logger.warn({ e }, "Dependency scan failed — continuing without CVE findings");
    }

    // --- Phase 3d: Git churn (hotspot analysis, clone-based scans only) ---
    stop();
    try {
      if (await hasGitHistory(dirPath)) {
        emit(90, "Analyzing git history");
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
    stop();
    try {
      if (contentMap.size > 1) {
        emit(91, "Detecting code duplicates");
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
    stop();
    try {
      emit(92, "Reading coverage reports");
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
    stop();
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
      // What the project itself declared "not source" — a scan that hides this
      // number lets an empty district read as a clean one.
      skippedByGitignore,
      // Files that were staged but never joined the scan, counted at the read
      dropped,
      // Honest provenance: "complete" doesn't imply semgrep/gitleaks ran
      scanProvenance: {
        regex: true,
        gitleaks: scanProvenance.gitleaksRan,
        semgrep: scanProvenance.semgrepRan,
        dependencies: scanProvenance.depsRan,
        /** names the engine that answered the CVE question, so the card never
            credits `npm audit` for a scan only osv-scanner took part in */
        dependencyRunner: scanProvenance.depsRunner,
        osv: scanProvenance.osvRan,
        ruff: scanProvenance.ruffRan,
        churn: scanProvenance.churnRan,
        duplicates: scanProvenance.duplicatesRan,
        coverage: scanProvenance.coverageRan,
      },
    };

    emit(95, "Finalizing results");

    const result: AnalysisResult = {
      id: analysisId,
      repo,
      files: fileAnalyses,
      directories: [], // structure lives in cityMapper's own trie — never consumed here
      summary,
      createdAt: new Date().toISOString(),
      status: "complete",
    };

    emit(100, "Analysis complete");

    this.logger.info(
      {
        analysisId,
        totalFiles: result.summary.totalFiles,
        totalVulns,
        durationMs: Date.now() - startTime,
      },
      "Analysis complete",
    );
    return result;
  }

  /**
   * Recursively walk directory and collect file paths.
   *
   * Each folder's own .gitignore is read before its entries are judged, so a
   * nested rule file applies to exactly the subtree it belongs to — the same
   * reach git gives it. An ignored directory is skipped whole rather than
   * walked and then thrown away.
   */
  private async walkDirectory(
    basePath: string,
    currentPath: string,
    files: string[],
    ignores: IgnoreMatcher,
    skipped: { files: number; directories: number },
  ): Promise<void> {
    const relDir = path.relative(basePath, currentPath).split(path.sep).join("/");
    try {
      ignores.add(relDir, await fs.readFile(path.join(currentPath, ".gitignore"), "utf-8"));
    } catch {
      // no ignore file in this folder — the ones above still apply
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    // Deterministic walk. Directory read order is not sorted by the OS, and the
    // city used to inherit it: the same folder scanned twice produced different
    // file ids, and anything keyed on them moved.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      // The same artifact decision the candidate loop makes — applied to the
      // directory name here, so a tool-output tree is skipped whole instead of
      // walked and thrown away. Must stay in sync with SKIP_DIRS in
      // frontend/src/hooks/useLocalAnalysis.ts
      if (isArtifactPath(relPath)) {
        continue;
      }
      if (/^\.(hidden|DS_Store)$/.test(entry.name)) continue;

      // Symlinks in untrusted repos could point anywhere on disk (e.g.
      // /etc/passwd) — never follow them into reads or recursion.
      if (entry.isSymbolicLink()) continue;

      const kind = entry.isDirectory() ? "dir" : "file";
      if (ignores.isIgnored(relPath, kind)) {
        if (entry.isDirectory()) skipped.directories++;
        else skipped.files++;
        continue;
      }

      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files, ignores, skipped);
      } else {
        files.push(fullPath);
      }
    }
  }
}
