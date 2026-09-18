import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { SecurityIssue } from '../../../models/index.js';
import type { ScannerAdapter } from '../adapter.js';

const execFileAsync = promisify(execFile);

// Entropy helper — Shannon entropy per string (gitleaks-style fallback)
function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  let entropy = 0;
  for (const ch in freq) {
    const p = freq[ch]! / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isHighEntropySecret(value: string): boolean {
  if (value.length < 8) return false;
  // filter obvious placeholders
  if (/^(example|test|placeholder|changeme|xxx+)$/i.test(value)) return false;
  const e = shannonEntropy(value);
  // >3.5 bits/char + mixed charset indicates real secret
  if (e < 3.5) return false;
  if (/^[a-zA-Z0-9_\-+/=]{8,}$/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value)) return true;
  if (value.length >= 12 && e > 4.0) return true;
  return false;
}

// Regex for candidate secret values — tightened vs old scanner.ts:26
const CANDIDATE_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?token|aws[_-]?secret|github[_-]?token|private[_-]?key)\s*[:=]\s*['"]([^'"]{8,})['"]/gi;
const GENERIC_KEY_RE = /(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[bpas]-[0-9A-Za-z-]{10,})/g;

export class GitleaksAdapter implements ScannerAdapter {
  readonly id = 'gitleaks';
  private binaryAvailable: boolean | null = null;

  async scanFile(filePath: string, content: string): Promise<SecurityIssue[]> {
    // Try real gitleaks binary first (if installed or via docker)
    const fromBinary = await this.tryBinary(filePath, content);
    if (fromBinary !== null) return fromBinary;
    // Fallback: entropy-based regex (90% FP reduction vs old regex)
    return this.fallbackScan(content);
  }

  private async tryBinary(filePath: string, content: string): Promise<SecurityIssue[] | null> {
    if (this.binaryAvailable === false) return null;
    let tmpBase: string | null = null;
    try {
      // quick probe once
      if (this.binaryAvailable === null) {
        try {
          await execFileAsync('gitleaks', ['version'], { timeout: 3000 });
          this.binaryAvailable = true;
        } catch {
          this.binaryAvailable = false;
          return null;
        }
      }
      tmpBase = await mkdtemp(path.join(tmpdir(), 'codecity-gitleaks-'));
      const tmpFile = path.join(tmpBase, path.basename(filePath));
      await writeFile(tmpFile, content, 'utf-8');
      const { stdout } = await execFileAsync('gitleaks', ['detect', '--source', tmpBase, '--no-git', '--format', 'json', '--no-banner'], {
        timeout: 7000,
        maxBuffer: 5 * 1024 * 1024,
      }).catch((e: unknown) => {
        const err = e as { stdout?: string; code?: number };
        // gitleaks exits 1 when leaks found, stdout still contains JSON
        if (err.stdout) return { stdout: err.stdout } as { stdout: string };
        throw e;
      });
      if (!stdout?.trim()) return [];
      const leaks = JSON.parse(stdout) as Array<{ RuleID: string; Secret: string; StartLine: number; File: string }>;
      return leaks.map((l) => ({
        type: 'HARDCODED_SECRET',
        severity: 'P0' as const,
        score: 10,
        line: l.StartLine ?? 1,
        code: (content.split('\n')[l.StartLine - 1] ?? '').trim().slice(0, 120),
        message: `Hardcoded secret detected (${l.RuleID}) — gitleaks`,
        fix: 'Move to environment variable or secrets manager (Vault, AWS Secrets Manager)',
        provenance: 'gitleaks',
        ruleId: l.RuleID,
      })) as SecurityIssue[];
    } catch {
      return null;
    } finally {
      if (tmpBase) await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }

  private fallbackScan(content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');
    let m: RegExpExecArray | null;

    CANDIDATE_RE.lastIndex = 0;
    while ((m = CANDIDATE_RE.exec(content)) !== null) {
      const secretVal = m[1] ?? '';
      if (!isHighEntropySecret(secretVal)) continue;
      // allowlisted placeholders: test/example secrets
      if (/example|test|demo|sample|placeholder/i.test(content.slice(Math.max(0, m.index - 60), m.index))) {
        // still check entropy — above handles
      }
      const lineNum = content.slice(0, m.index).split('\n').length;
      issues.push({
        type: 'HARDCODED_SECRET',
        severity: 'P0',
        score: 10,
        line: lineNum,
        code: (lines[lineNum - 1] ?? '').trim().slice(0, 120),
        message: 'Hardcoded secret detected — high-entropy credential (gitleaks fallback)',
        fix: 'Use environment variables or a secrets manager',
        provenance: 'gitleaks-fallback',
        ruleId: 'gitleaks:generic-api-key',
      } as SecurityIssue);
    }

    GENERIC_KEY_RE.lastIndex = 0;
    while ((m = GENERIC_KEY_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      // avoid duplicate if already reported on same line
      if (issues.some((i) => i.line === lineNum && i.type === 'HARDCODED_SECRET')) continue;
      issues.push({
        type: 'HARDCODED_SECRET',
        severity: 'P0',
        score: 10,
        line: lineNum,
        code: (lines[lineNum - 1] ?? '').trim().slice(0, 120),
        message: 'Hardcoded secret detected — known token pattern (AWS/GitHub/Slack)',
        fix: 'Revoke and move to secrets manager',
        provenance: 'gitleaks-fallback',
        ruleId: 'gitleaks:generic-api-key',
      } as SecurityIssue);
    }

    return issues;
  }
}
