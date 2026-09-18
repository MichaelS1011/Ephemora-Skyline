import { execFile } from 'child_process';
import pino from 'pino';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { SecurityIssue } from '../../../models/index.js';
import type { ScannerAdapter } from '../adapter.js';
import { sarifToIssues } from '../sarif-mapper.js';

const execFileAsync = promisify(execFile);

// Registry config can be overridden (e.g. to a local rules dir for offline runs)
const SEMGREP_CONFIG = process.env.SEMGREP_CONFIG || 'p/security-audit';
// Versioned image — a floating :latest tag is a supply-chain risk
const SEMGREP_DOCKER_IMAGE = process.env.SEMGREP_DOCKER_IMAGE || 'semgrep/semgrep:1.162.0';
// Same minimal-PATH reasoning as gitleaks: try known prefixes, too
const SEMGREP_BIN_FALLBACKS = ['/opt/homebrew/bin/semgrep', '/usr/local/bin/semgrep'];

export class SemgrepAdapter implements ScannerAdapter {
  readonly id = 'semgrep';
  private logger = pino({ name: 'semgrep-adapter' });
  private binaryAvailable: boolean | null = null;
  private resolvedBinary: string | null = null;
  private dockerAvailable: boolean | null = null;
  /** Whether the last scanBatch() call actually executed semgrep (binary or docker) */
  lastBatchExecuted = false;

  /** Resolve the semgrep binary once: PATH first, then common prefixes */
  private async resolveBinary(): Promise<string | null> {
    if (this.resolvedBinary) return this.resolvedBinary;
    for (const candidate of ['semgrep', ...SEMGREP_BIN_FALLBACKS]) {
      try {
        await execFileAsync(candidate, ['--version'], { timeout: 5000 });
        this.resolvedBinary = candidate;
        this.logger.info({ binary: candidate }, 'semgrep binary found');
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  // Per-file fallback is no-op — semgrep is batch-oriented.
  async scanFile(_filePath: string, _content: string): Promise<SecurityIssue[]> {
    return [];
  }

  async scanBatch(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[]> {
    this.lastBatchExecuted = false;
    const fromBinary = await this.tryBinary(clonePath, contentByPath);
    if (fromBinary !== null) {
      this.lastBatchExecuted = true;
      return fromBinary;
    }
    const fromDocker = await this.tryDocker(clonePath, contentByPath);
    if (fromDocker !== null) {
      this.lastBatchExecuted = true;
      return fromDocker;
    }
    return [];
  }

  private async tryBinary(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[] | null> {
    if (this.binaryAvailable === false) return null;
    try {
      const bin = await this.resolveBinary();
      if (!bin) {
        this.binaryAvailable = false;
        return null;
      }
      this.binaryAvailable = true;
      const tmpOut = path.join(tmpdir(), `codecity-semgrep-${Date.now()}.sarif`);
      try {
        await execFileAsync(bin, ['--config', SEMGREP_CONFIG, '--metrics=off', '--sarif', '--quiet', '--sarif-output', tmpOut, clonePath], {
          timeout: parseInt(process.env.SEMGREP_TIMEOUT || '120', 10) * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (e) {
        const err = e as { code?: number };
        // semgrep exits 0 (no findings), 1 (findings), 2 (error) — 0/1 are ok
        if (err.code !== 0 && err.code !== 1) {
          // try without sarif-output: capture stdout
          const { stdout } = await execFileAsync(bin, ['--config', SEMGREP_CONFIG, '--metrics=off', '--sarif', '--quiet', clonePath], {
            timeout: parseInt(process.env.SEMGREP_TIMEOUT || '120', 10) * 1000,
            maxBuffer: 10 * 1024 * 1024,
          }).catch((ex) => {
            const x = ex as { stdout?: string; code?: number };
            if (x.stdout) return { stdout: x.stdout } as { stdout: string };
            throw ex;
          });
          if (stdout?.trim()) {
            const sarif = JSON.parse(stdout);
            return sarifToIssues(sarif, contentByPath);
          }
          return [];
        }
      }
      try {
        const raw = await readFile(tmpOut, 'utf-8');
        await rm(tmpOut, { force: true }).catch(() => {});
        if (!raw.trim()) return [];
        return sarifToIssues(JSON.parse(raw), contentByPath);
      } catch {
        return [];
      }
    } catch {
      this.binaryAvailable = false;
      return null;
    }
  }

  private async tryDocker(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[] | null> {
    if (this.dockerAvailable === false) return null;
    try {
      if (this.dockerAvailable === null) {
        await execFileAsync('docker', ['--version'], { timeout: 3000 });
        this.dockerAvailable = true;
      }
      const tmpOut = path.join(tmpdir(), `codecity-semgrep-docker-${Date.now()}.sarif`);
      // mount clonePath as /src
      await execFileAsync('docker', ['run', '--rm', '-v', `${clonePath}:/src:ro`, '-v', `${path.dirname(tmpOut)}:/out`, SEMGREP_DOCKER_IMAGE, 'semgrep', '--config', SEMGREP_CONFIG, '--metrics=off', '--sarif', '--quiet', '--sarif-output', `/out/${path.basename(tmpOut)}`, '/src'], {
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
      }).catch((e) => {
        const err = e as { code?: number };
        if (err.code !== 0 && err.code !== 1) throw e;
        return { stdout: '' } as { stdout: string };
      });
      try {
        const raw = await readFile(tmpOut, 'utf-8');
        await rm(tmpOut, { force: true }).catch(() => {});
        if (!raw.trim()) return [];
        return sarifToIssues(JSON.parse(raw), contentByPath);
      } catch {
        return [];
      }
    } catch {
      this.dockerAvailable = false;
      return null;
    }
  }

  // Adapter compat: temp-file semgrep per single content (for tests without clone)
  async scanSingleContent(filePath: string, content: string): Promise<SecurityIssue[]> {
    let tmpBase: string | null = null;
    try {
      if (this.binaryAvailable === false && this.dockerAvailable === false) return [];
      tmpBase = await mkdtemp(path.join(tmpdir(), 'codecity-semgrep-single-'));
      const tmpFile = path.join(tmpBase, path.basename(filePath));
      await writeFile(tmpFile, content, 'utf-8');
      const issues = await this.scanBatch(tmpBase, new Map([[path.basename(filePath), content]]));
      // remap file path to original
      for (const i of issues) {
        const hidden = (i as unknown as Record<string, unknown>)._filePath as string | undefined;
        if (hidden && hidden.endsWith(path.basename(filePath))) {
          (i as unknown as Record<string, unknown>)._filePath = filePath;
        }
      }
      return issues.filter((i) => {
        const fp = (i as unknown as Record<string, unknown>)._filePath as string | undefined;
        return !fp || fp.endsWith(path.basename(filePath)) || fp === filePath;
      });
    } catch {
      return [];
    } finally {
      if (tmpBase) await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }
}
