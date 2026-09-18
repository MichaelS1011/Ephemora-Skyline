import { execFile } from 'child_process';
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

export class SemgrepAdapter implements ScannerAdapter {
  readonly id = 'semgrep';
  private binaryAvailable: boolean | null = null;
  private dockerAvailable: boolean | null = null;

  // Per-file fallback is no-op — semgrep is batch-oriented.
  async scanFile(_filePath: string, _content: string): Promise<SecurityIssue[]> {
    return [];
  }

  async scanBatch(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[]> {
    const fromBinary = await this.tryBinary(clonePath, contentByPath);
    if (fromBinary !== null) return fromBinary;
    const fromDocker = await this.tryDocker(clonePath, contentByPath);
    if (fromDocker !== null) return fromDocker;
    return [];
  }

  private async tryBinary(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[] | null> {
    if (this.binaryAvailable === false) return null;
    try {
      if (this.binaryAvailable === null) {
        await execFileAsync('semgrep', ['--version'], { timeout: 3000 });
        this.binaryAvailable = true;
      }
      const tmpOut = path.join(tmpdir(), `codecity-semgrep-${Date.now()}.sarif`);
      try {
        await execFileAsync('semgrep', ['--config', SEMGREP_CONFIG, '--metrics=off', '--sarif', '--quiet', '--sarif-output', tmpOut, clonePath], {
          timeout: parseInt(process.env.SEMGREP_TIMEOUT || '120', 10) * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (e) {
        const err = e as { code?: number };
        // semgrep exits 0 (no findings), 1 (findings), 2 (error) — 0/1 are ok
        if (err.code !== 0 && err.code !== 1) {
          // try without sarif-output: capture stdout
          const { stdout } = await execFileAsync('semgrep', ['--config', SEMGREP_CONFIG, '--metrics=off', '--sarif', '--quiet', clonePath], {
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
