/**
 * SecurityScanner — Facade over ScannerAdapters.
 *
 * RegexAdapter + GitleaksAdapter (Secrets) + SemgrepAdapter (AST, SARIF) hinter gleicher Schnittstelle.
 * Ohne Binary/Docker: Graceful Fallback auf Regex/Gitleaks-Fallback, kein Crash.
 */

import pino from 'pino';
import type { SecurityIssue, FileAnalysis } from '../../models/index.js';
import type { ScannerAdapter } from './adapter.js';
import { RegexAdapter } from './adapters/regex-adapter.js';
import { GitleaksAdapter } from './adapters/gitleaks-adapter.js';
import { SemgrepAdapter } from './adapters/semgrep-adapter.js';

export class SecurityScanner {
  private logger: pino.Logger;
  private adapters: ScannerAdapter[];
  semgrepAdapter: SemgrepAdapter | null = null;

  constructor(adapters?: ScannerAdapter[]) {
    this.logger = pino({ name: 'security-scanner' });
    if (adapters) {
      this.adapters = adapters;
    } else {
      const semgrep = new SemgrepAdapter();
      this.semgrepAdapter = semgrep;
      this.adapters = [new RegexAdapter(), new GitleaksAdapter(), semgrep];
    }
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

  // Sync-Kompat für alte Tests ohne Secrets-Adapter — delegiert nur an RegexAdapter
  scanSync(files: FileAnalysis[]): FileAnalysis[] {
    const regex = this.adapters.find((a) => a.id === 'regex') as unknown as { scanFile: (p: string, c: string) => SecurityIssue[] } | undefined;
    if (!regex) return files.map((f) => ({ ...f, vulnerabilities: [] }));
    return files.map((file) => ({
      ...file,
      vulnerabilities: file.content ? (regex.scanFile(file.path, file.content) as SecurityIssue[]) : [],
    }));
  }

  /** Scan a single file's content string for vulnerabilities (async, merged adapters) */
  async scanFile(filePath: string, content: string): Promise<SecurityIssue[]> {
    const all: SecurityIssue[] = [];
    for (const adapter of this.adapters) {
      const res = await adapter.scanFile(filePath, content);
      all.push(...res);
    }
    // Dedup: gleiche line+type+ruleId nur einmal
    const seen = new Set<string>();
    const deduped = all.filter((i) => {
      const k = `${i.line}:${i.type}:${(i as unknown as { ruleId?: string }).ruleId ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Sort by severity order P0>P1>P2 then line
    const order = { P0: 0, P1: 1, P2: 2 } as const;
    deduped.sort((a, b) => (order[a.severity] - order[b.severity]) || a.line - b.line);
    if (deduped.length > 0) this.logger.info({ filePath, issues: deduped.length }, 'Security scan completed');
    return deduped;
  }

  // Sync-Variante für bestehende sync Tests (ohne Gitleaks)
  scanFileSync(filePath: string, content: string): SecurityIssue[] {
    const regex = this.adapters.find((a) => a.id === 'regex');
    if (!regex) return [];
    const res = (regex as unknown as { scanFile: (p: string, c: string) => SecurityIssue[] }).scanFile(filePath, content);
    return res as SecurityIssue[];
  }

  /** Parse ESM + CJS + dynamic imports and exports from source */
  scanFileStructure(filePath: string, content: string): {
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
        isExternal: !source.startsWith('.') && !source.startsWith('/'),
      });
    };

    let match: RegExpExecArray | null;

    // ── ESM: import { x } / import y / import type … from '…' ────────────
    const esmRegex =
      /import\s+(?:type\s+)?(?:(?:\{([^}]+)\})|(?:([\w$]+))|(?:[\w$]+\s+as\s+([\w$]+)))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = esmRegex.exec(content)) !== null) {
      const named =
        match[1]
          ?.split(',')
          .map((s: string) => s.trim().split(' as ')[0]!.trim())
          .filter(Boolean) ?? [];
      const def = match[2] ?? match[3] ?? '';
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
        .split(',')
        .map((s: string) => s.trim().split(/\s+as\s+/)[0]!.trim())
        .filter(Boolean);
      push(match[2]!, named);
    }

    const cjsSimple =
      /(?:const|let|var)\s+([\w$]+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
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
      exports.push({ type: 'named', name: match[1]! });
    }
    const defaultExportRegex = /export\s+default\s+(?:function|class)\s+([\w$]+)/g;
    while ((match = defaultExportRegex.exec(content)) !== null) {
      exports.push({ type: 'default', name: match[1]! });
    }

    // ── CJS exports: module.exports / exports.x ────────────────────────────
    const cjsExportNamed = /exports\s*\.\s*([\w$]+)\s*=/g;
    while ((match = cjsExportNamed.exec(content)) !== null) {
      exports.push({ type: 'named', name: match[1]! });
    }
    if (/module\.exports\s*=/.test(content)) {
      exports.push({ type: 'default', name: 'default' });
    }

    return { imports, exports };
  }

  /** All configured pattern type strings */
  getPatternTypes(): string[] {
    const all: string[] = [];
    for (const a of this.adapters) {
      if (a.id === 'regex') {
        all.push('CMD_INJECTION','SQL_INJECTION','EVAL_USAGE','DYNAMIC_FUNCTION','PATH_TRAVERSAL','XSS','PROTOTYPE_POLLUTION','UNSAFE_DESERIALIZATION','SETTIMEOUT_STRING','CONSOLE_USAGE','LOOSE_EQUALITY','LOCALSTORAGE_USAGE','INSECURE_HTTP','HARDCODED_SECRET');
      } else if (a.id === 'gitleaks') {
        all.push('HARDCODED_SECRET');
      } else if (a.id === 'semgrep') {
        all.push('XSS','SQL_INJECTION','CMD_INJECTION','PATH_TRAVERSAL','EVAL_USAGE','HARDCODED_SECRET');
      }
    }
    return [...new Set(all)];
  }

  /** Batch SARIF-aware scan — invoked by orchestrator on clonePath (optional, not per-file) */
  async scanBatch(clonePath: string, contentByPath: Map<string, string>): Promise<Map<string, SecurityIssue[]>> {
    if (!this.semgrepAdapter) return new Map();
    const batchIssues = await this.semgrepAdapter.scanBatch(clonePath, contentByPath);
    const byFile = new Map<string, SecurityIssue[]>();
    for (const issue of batchIssues) {
      const fp = (issue as unknown as Record<string, unknown>)._filePath as string | undefined;
      if (!fp) continue;
      // normalize to repo-relative path
      const rel = fp.startsWith(clonePath + '/') ? fp.slice(clonePath.length + 1) : fp;
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
      P0: issues.filter((i) => i.severity === 'P0').length,
      P1: issues.filter((i) => i.severity === 'P1').length,
      P2: issues.filter((i) => i.severity === 'P2').length,
    };
  }
}
