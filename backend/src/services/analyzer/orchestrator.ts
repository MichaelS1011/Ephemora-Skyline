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

import { promises as fs } from 'fs';
import path from 'path';
import pino from 'pino';
import type {
  AnalysisResult,
  FileAnalysis,
  DirectorySummary,
  ProjectSummary,
  GitHubRepo,
  WebSocketEvent,
} from '../../models/index.js';
import type { CloneManager } from '../github/clone-manager.js';
import type { GitHubClient } from '../github/client.js';
import type { SecurityScanner } from '../security/scanner.js';

interface ProgressCallback {
  (event: WebSocketEvent): void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB max per file
const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb',
  '.html', '.css', '.scss', '.json', '.yaml', '.yml',
]);

// Simple language detection by extension
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.py': 'Python', '.go': 'Go',
    '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.json': 'JSON',
    '.yaml': 'YAML', '.yml': 'YAML',
  };
  return langMap[ext] || 'Other';
}

/** Average cyclomatic complexity across a set of files (0 when empty) */
function computeAvgComplexity(files: FileAnalysis[]): number {
  if (files.length === 0) return 0;
  const total = files.reduce((sum, f) => sum + f.complexity.cyclomatic, 0);
  return Math.round((total / files.length) * 100) / 100;
}

// Estimate cyclomatic complexity from code (simple heuristic)
function estimateCyclomaticComplexity(code: string): number {
  const decisions = (code.match(/\b(if|else\s+if|while|for|catch|case|&&|\|\||\?)\b/g) || []).length;
  return Math.max(1, decisions + 1);
}

// Count lines of code
function countLines(content: string): { total: number; code: number; comments: number; blank: number } {
  const lines = content.split('\n');
  let code = 0, comments = 0, blank = 0;

  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') { blank++; continue; }

    if (inBlockComment) {
      comments++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) { comments++; if (!trimmed.includes('*/')) inBlockComment = true; continue; }
    if (trimmed.startsWith('//')) { comments++; continue; }

    code++;
  }

  return { total: lines.length, code, comments, blank };
}

export class AnalysisOrchestrator {
  private logger: pino.Logger;
  private cloneManager: CloneManager;
  private githubClient: GitHubClient;
  private scanner: SecurityScanner;

  constructor(cloneManager: CloneManager, githubClient: GitHubClient, scanner: SecurityScanner) {
    this.logger = pino({ name: 'analysis-orchestrator' });
    this.cloneManager = cloneManager;
    this.githubClient = githubClient;
    this.scanner = scanner;
  }

  /** Run the full analysis pipeline */
  async analyzeRepo(
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
    analysisId: string = crypto.randomUUID(),
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    const emit = (type: WebSocketEvent['type'], payload: Record<string, unknown>) => {
      const event: WebSocketEvent = {
        type,
        payload,
        timestamp: new Date().toISOString(),
      };
      this.logger.debug({ type }, 'Progress event');
      progressCallback?.(event);
    };

    emit('repo_cloned', { repo: `${repo.owner}/${repo.name}` });

    // --- Phase 1: Clone ---
    emit('analysis_progress', { progress: 10, stage: 'Cloning repository', repo: `${repo.owner}/${repo.name}` });

    let clonePath: string;
    try {
      clonePath = await this.cloneManager.cloneRepo(repo);
    } catch (error) {
      this.logger.error({ error, repo }, 'Clone failed, trying API fallback');
      // Fallback: try to use GitHub API directly
      return this.analyzeViaApi(analysisId, repo, progressCallback);
    }

    try {
      // --- Phase 2: Enumerate files ---
      emit('analysis_progress', { progress: 25, stage: 'Enumerating files' });

      const allFiles: string[] = [];
      await this.walkDirectory(clonePath, clonePath, allFiles);

      const totalFiles = allFiles.length;
      this.logger.info({ totalFiles, repo: `${repo.owner}/${repo.name}` }, 'File enumeration complete');

      // --- Phase 3: Parse + Scan each file ---
      emit('analysis_progress', { progress: 30, stage: 'Parsing files', totalFiles });

      // Whole-clone batch scans (gitleaks, semgrep) replace per-file process
      // spawns — the facade merges their findings into the per-file loop.
      this.scanner.enableBatchScans();

      const fileAnalyses: FileAnalysis[] = [];
      const languageLines: Record<string, number> = {};
      const directoryMap: Map<string, { files: FileAnalysis[]; subdirs: Map<string, { files: FileAnalysis[] }> }> = new Map();

      for (let i = 0; i < allFiles.length; i++) {
        const relativePath = allFiles[i]!.replace(clonePath + '/', '');

        // Skip hidden dirs, node_modules, dist, build, .git
        if (/^(node_modules|\.git|dist|build|\.next|coverage|\.turbo)/.test(relativePath)) continue;
        if (!SUPPORTED_EXTENSIONS.has(path.extname(relativePath))) continue;

        try {
          const content = await fs.readFile(allFiles[i]!, 'utf-8');

          // Skip oversized files
          if (content.length > MAX_FILE_SIZE) continue;

          emit('file_parsing_started', { file: relativePath, progress: Math.round((i / totalFiles) * 60) + 30 });

          const lines = countLines(content);
          const language = detectLanguage(relativePath);
          const cyclomatic = estimateCyclomaticComplexity(content);

          const vulnerabilities = await this.scanner.scanFile(relativePath, content);
          const { imports: rawImports, exports: fileExports } = this.scanner.scanFileStructure(relativePath, content);
          const imports = rawImports.map(imp => ({ ...imp, line: 0 }));

          // Extract functions (simple regex-based)
          const functions = this.extractFunctions(content);
          const classes = this.extractClasses(content);

          const fileAnalysis: FileAnalysis = {
            path: relativePath,
            language,
            lines,
            complexity: { cyclomatic: cyclomatic, cognitive: cyclomatic },
            functions,
            classes,
            imports,
            exports: fileExports.map(e => ({
              type: e.type as 'named' | 'default' | 'reexport',
              name: e.name,
              line: 0, // would need AST for line numbers
            })),
            vulnerabilities,
          };

          fileAnalyses.push(fileAnalysis);

          // Update language lines
          languageLines[language] = (languageLines[language] || 0) + lines.code;

          // Update directory map
          const dirPath = path.dirname(relativePath);
          if (!directoryMap.has(dirPath)) {
            directoryMap.set(dirPath, { files: [], subdirs: new Map() });
          }
          directoryMap.get(dirPath)!.files.push(fileAnalysis);

          emit('file_parsed', { file: relativePath, progress: Math.round((i / totalFiles) * 60) + 30 });
        } catch {
          // Skip files that can't be read
        }
      }

      // --- Phase 3b: Batch scans (gitleaks + semgrep) — one process each on the clone, merged per file ---
      let scanProvenance: { gitleaksRan: boolean; semgrepRan: boolean } = { gitleaksRan: false, semgrepRan: false };
      try {
        emit('analysis_progress', { progress: 88, stage: 'Deep scan (semgrep + gitleaks)' });
        scanProvenance = await this.scanner.scanRepositoryBatch(clonePath, fileAnalyses);
      } catch (e) {
        this.logger.warn({ e }, 'Batch scan failed — continuing with regex results');
      }

      // --- Phase 4: Build directories ---
      emit('analysis_progress', { progress: 90, stage: 'Building directory structure' });

      const directories = this.buildDirectoryTree(directoryMap, clonePath);

      // --- Phase 5: Aggregate summary ---
      const totalLines = fileAnalyses.reduce((sum, f) => sum + f.lines.total, 0);
      const totalVulns = fileAnalyses.reduce((sum, f) => sum + f.vulnerabilities.length, 0);
      const vulnerabilitiesBySeverity = this.scanner.countBySeverity(
        fileAnalyses.flatMap(f => f.vulnerabilities),
      );
      const allCyclomatic = fileAnalyses.map(f => f.complexity.cyclomatic);
      const avgCyclomatic = allCyclomatic.length > 0
        ? Math.round(allCyclomatic.reduce((a, b) => a + b, 0) / allCyclomatic.length * 100) / 100
        : 0;
      const maxCyclomatic = allCyclomatic.length > 0 ? Math.max(...allCyclomatic) : 0;

      const summary: ProjectSummary = {
        totalFiles: fileAnalyses.length,
        totalDirectories: directories.length,
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
        },
      };

      emit('analysis_progress', { progress: 95, stage: 'Finalizing results' });

      const result: AnalysisResult = {
        id: analysisId,
        repo,
        files: fileAnalyses,
        directories,
        summary,
        createdAt: new Date().toISOString(),
        status: 'complete',
      };

      emit('analysis_progress', { progress: 100, stage: 'Analysis complete', totalFiles: result.summary.totalFiles });
      emit('analysis_complete', { id: analysisId, totalFiles: result.summary.totalFiles, duration: Date.now() - startTime });

      this.logger.info({ analysisId, totalFiles: result.summary.totalFiles, totalVulns }, 'Analysis complete');
      return result;
    } finally {
      // Clones are never reused — delete immediately so temp disk usage
      // doesn't accumulate across analyses
      await this.cloneManager.cleanup(clonePath).catch(() => {});
    }
  }

  /** Fallback analysis via GitHub API (no clone needed) */
  private async analyzeViaApi(
    analysisId: string,
    repo: GitHubRepo,
    progressCallback?: ProgressCallback,
  ): Promise<AnalysisResult> {
    this.logger.info({ repo: `${repo.owner}/${repo.name}` }, 'Falling back to API-based analysis');

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
          const { imports: rawImports, exports: fileExports } = this.scanner.scanFileStructure(fileList[i]!, content);
          const imports = rawImports.map(imp => ({ ...imp, line: 0 }));

          fileAnalyses.push({
            path: fileList[i]!,
            language,
            lines,
            complexity: { cyclomatic: estimateCyclomaticComplexity(content), cognitive: estimateCyclomaticComplexity(content) },
            functions: this.extractFunctions(content),
            classes: this.extractClasses(content),
            imports,
            exports: fileExports.map(e => ({ type: e.type as 'named' | 'default' | 'reexport', name: e.name, line: 0 })),
            vulnerabilities,
          });
        } catch {
          // Skip files that fail
        }
        emitProgress(30 + Math.round((i / Math.min(totalFiles, 200)) * 60));
      }

      const totalVulns = fileAnalyses.reduce((s, f) => s + f.vulnerabilities.length, 0);
      const vulnBySeverity = this.scanner.countBySeverity(fileAnalyses.flatMap(f => f.vulnerabilities));
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
        status: 'complete',
      };

      emitProgress(100);
      return result;
    } catch (error) {
      this.logger.error({ error }, 'API analysis failed completely');
      return {
        id: analysisId,
        repo,
        files: [],
        directories: [],
        summary: { totalFiles: 0, totalDirectories: 0, totalLines: 0, avgCyclomatic: 0, maxCyclomatic: 0, languages: {}, totalVulnerabilities: 0, vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 }, languagesByLines: {} },
        createdAt: new Date().toISOString(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'API analysis failed',
      };
    }

    function emitProgress(progress: number) {
      progressCallback?.({ type: 'analysis_progress', payload: { progress, stage: 'Analyzing via API' }, timestamp: new Date().toISOString() });
    }
  }

  /** Recursively walk directory and collect file paths */
  private async walkDirectory(basePath: string, currentPath: string, files: string[]): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip sensitive directories
      if (/^(node_modules|\.git|dist|build|\.next|coverage|\.turbo|\.vscode|\.idea)/.test(entry.name)) continue;
      if (/^(\.hidden|__pycache__)/.test(entry.name)) continue;

      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }

  /** Build directory tree from flat file list */
  private buildDirectoryTree(dirMap: Map<string, { files: FileAnalysis[]; subdirs: Map<string, { files: FileAnalysis[] }> }>, basePath: string): DirectorySummary[] {
    const roots: DirectorySummary[] = [];

    for (const [dirPath, data] of dirMap) {
      const relativeDir = dirPath.replace(basePath + '/', '') || '/';
      const children: DirectorySummary[] = [];

      // Add subdirectory summaries
      for (const [subDirPath, subData] of data.subdirs) {
        const relSub = subDirPath.replace(basePath + '/', '') || '/';
        children.push({
          path: relSub,
          fileCount: subData.files.length,
          totalLines: subData.files.reduce((s, f) => s + f.lines.total, 0),
          avgComplexity: computeAvgComplexity(subData.files),
          vulnerabilityCount: subData.files.reduce((s, f) => s + f.vulnerabilities.length, 0),
          children: [],
        });
      }

      roots.push({
        path: relativeDir,
        fileCount: data.files.length,
        totalLines: data.files.reduce((s, f) => s + f.lines.total, 0),
        avgComplexity: computeAvgComplexity(data.files),
        vulnerabilityCount: data.files.reduce((s, f) => s + f.vulnerabilities.length, 0),
        children,
      });
    }

    return roots;
  }

  /** Extract function signatures from source code (regex-based) */
  private extractFunctions(content: string): Array<{ name: string; line: number; parameters: number; complexity: number; isAsync: boolean }> {
    const functions: Array<{ name: string; line: number; parameters: number; complexity: number; isAsync: boolean }> = [];
    const lines = content.split('\n');

    // Match: function name(params), const name = (params) =>, export const name = async (params)
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
      /(\w+)\s*\(([^)]*)\)\s*(?::\s*\w[\w<>,\s?|&\n]*?)?\s*\{(?!\s*\/\*)/g,
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lines[i] || '')) !== null) {
          const name = match[1];
          if (!name) break;
          if (name === 'if' || name === 'for' || name === 'while' || name === 'switch' || name === 'catch') continue;
          const params = match[2] ? match[2].split(',').filter((p: string) => p.trim()).length : 0;
          functions.push({
            name,
            line: i + 1,
            parameters: params,
            complexity: estimateCyclomaticComplexity(lines[i] || ''),
            isAsync: (lines[i] || '').includes('async'),
          });
          break; // One match per line
        }
      }
    }

    return functions.slice(0, 100); // Limit to avoid memory issues
  }

  /** Extract class definitions (regex-based) */
  private extractClasses(content: string): Array<{ name: string; line: number; methods: number }> {
    const classes: Array<{ name: string; line: number; methods: number }> = [];
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      // Count methods in this class (simplified: count indented functions after class declaration)
      const className = match[1]!;
      const classLine = content.slice(0, match.index).split('\n').length;
      const linesAfter = content.split('\n').slice(classLine - 1);
      let methods = 0;
      for (const line of linesAfter) {
        if (/^\s+(?:async\s+)?\w+\s*\(/.test(line)) methods++;
      }

      classes.push({ name: className, line: classLine, methods });
    }

    return classes;
  }
}
