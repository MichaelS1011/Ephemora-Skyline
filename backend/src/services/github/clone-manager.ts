/**
 * CloneManager — Manages temporary directory creation and git cloning operations.
 *
 * Responsibilities:
 * - Create isolated temp directories per repo
 * - Execute git clone with depth optimization
 * - Clean up old clones to prevent disk exhaustion
 * - Track clone state for concurrency control
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type pino from 'pino';
import type { GitHubRepo } from '../../models/index.js';

interface CloneState {
  repo: GitHubRepo;
  clonePath: string;
  startTime: number;
  status: 'pending' | 'cloning' | 'complete' | 'failed' | 'expired';
}

export class CloneManager {
  private logger: pino.Logger;
  private tempBase: string;
  private maxAge: number; // ms, default 24 hours
  private maxDiskMB: number; // max total disk usage, default 2GB
  private activeClones: Map<string, CloneState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(logger: pino.Logger) {
    this.logger = logger.child({ service: 'clone-manager' });
    this.tempBase = path.join(os.tmpdir(), 'codecity-clones');
    this.maxAge = parseInt(process.env.CLONE_MAX_AGE || '86400000', 10);
    this.maxDiskMB = parseInt(process.env.CLONE_MAX_DISK_MB || '2048', 10);
  }

  /** Ensure temp base directory exists */
  private async ensureTempDir(): Promise<void> {
    await fs.mkdir(this.tempBase, { recursive: true });
  }

  /**
   * Allow only safe characters in git ref/URL segments — owner, name and
   * branch are user input and end up as git arguments below.
   */
  private sanitizeSegment(value: string): string {
    const safe = value.replace(/[^a-zA-Z0-9._-]/g, '');
    if (safe.length === 0 || safe.startsWith('-')) {
      throw new Error(`Invalid repository identifier: ${JSON.stringify(value)}`);
    }
    return safe;
  }

  /**
   * Provide GITHUB_TOKEN to git without putting it on the command line
   * (URL-embedded tokens leak into `ps` output and error messages).
   * Returns env vars to merge into the git process.
   */
  private async withTokenEnv(): Promise<{ env: NodeJS.ProcessEnv; cleanup: () => Promise<void> }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { env: { GIT_TERMINAL_PROMPT: '0' }, cleanup: async () => {} };
    }
    // Tiny askpass helper: git calls it for username and password prompts,
    // GitHub accepts the token in both positions.
    const scriptPath = path.join(os.tmpdir(), `codecity-askpass-${process.pid}.sh`);
    await fs.writeFile(scriptPath, '#!/bin/sh\necho "$CODECITY_GITHUB_TOKEN"\n', { mode: 0o700 });
    return {
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: scriptPath,
        CODECITY_GITHUB_TOKEN: token,
      },
      cleanup: async () => {
        await fs.rm(scriptPath, { force: true }).catch(() => {});
      },
    };
  }

  /** Clone a repository into an isolated temp directory */
  async cloneRepo(repo: GitHubRepo): Promise<string> {
    const key = `${repo.owner}/${repo.name}@${repo.branch}`;

    // Check if already cloning
    const existing = this.activeClones.get(key);
    if (existing && existing.status === 'cloning') {
      throw new Error(`Clone already in progress for ${key}`);
    }

    await this.ensureTempDir();

    // Defense in depth: user-supplied owner/name/branch must survive only as
    // plain identifier segments (no spaces, no metacharacters, no leading dash
    // that git could read as a flag). Combined with argument-array execution
    // below, no shell or flag injection surface remains.
    const safeOwner = this.sanitizeSegment(repo.owner);
    const safeName = this.sanitizeSegment(repo.name);
    const safeBranch = this.sanitizeSegment(repo.branch);

    const clonePath = path.join(this.tempBase, `${safeOwner}_${safeName}_${safeBranch}`);
    const state: CloneState = {
      repo,
      clonePath,
      startTime: Date.now(),
      status: 'pending',
    };

    this.activeClones.set(key, state);

    const { env: gitEnv, cleanup: cleanupTokenEnv } = await this.withTokenEnv();

    try {
      state.status = 'cloning';
      this.logger.info({ clonePath, repo: key }, 'Starting clone');

      // Clean existing if present (stale partial clone)
      try {
        await fs.rm(clonePath, { recursive: true, force: true });
      } catch {
        // Ignore if directory doesn't exist
      }

      const depth = parseInt(process.env.GIT_CLONE_DEPTH || '1', 10);

      const args = ['clone', '--single-branch', '--branch', safeBranch];
      if (depth > 0) args.push(`--depth=${depth}`);
      args.push(`https://github.com/${safeOwner}/${safeName}.git`, clonePath);

      await this.runGit(args, gitEnv);

      state.status = 'complete';
      state.startTime = Date.now();

      this.logger.info({ clonePath, repo: key }, 'Clone completed successfully');
      return clonePath;
    } catch (error) {
      this.activeClones.delete(key);
      this.logger.error({ error, repo: key }, 'Clone failed');
      throw error;
    } finally {
      await cleanupTokenEnv();
    }
  }

  /** Clone a repository into a temp directory (public API for orchestrator) */
  async cloneToTemp(repo: GitHubRepo): Promise<string> {
    return this.cloneRepo(repo);
  }

  /** Remove a clone directory by path (public API for orchestrator cleanup) */
  async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  /** Get the clone path for a repo if it exists and is valid */
  async getCachedClone(repo: GitHubRepo): Promise<string | null> {
    const key = `${repo.owner}/${repo.name}@${repo.branch}`;
    const existing = this.activeClones.get(key);

    if (existing && existing.status === 'complete') {
      // Check age
      const age = Date.now() - existing.startTime;
      if (age > this.maxAge) {
        existing.status = 'expired';
        await this.removeClone(key, existing);
        return null;
      }
      return existing.clonePath;
    }

    // Check disk space
    const totalSize = await this.getTotalDiskUsage();
    if (totalSize > this.maxDiskMB * 1024 * 1024) {
      this.logger.warn({ totalSize, maxDiskMB: this.maxDiskMB }, 'Disk usage exceeded, cleaning up');
      await this.cleanupOldest();
    }

    return null;
  }

  /** Remove a clone directory */
  private async removeClone(key: string, state: CloneState): Promise<void> {
    try {
      await fs.rm(state.clonePath, { recursive: true, force: true });
      this.logger.info({ clonePath: state.clonePath }, 'Clone removed');
    } catch {
      this.logger.warn({ clonePath: state.clonePath }, 'Failed to remove clone (already deleted?)');
    }
    this.activeClones.delete(key);
  }

  /** Get total disk usage of all clones */
  private async getTotalDiskUsage(): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(this.tempBase);
      for (const entry of entries) {
        const dirPath = path.join(this.tempBase, entry);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          total += await this.getDirSize(dirPath);
        }
      }
    } catch {
      // Ignore errors during disk check
    }
    return total;
  }

  /** Recursively get directory size */
  private async getDirSize(dirPath: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this.getDirSize(fullPath);
        } else {
          const fileStats = await fs.stat(fullPath);
          total += fileStats.size;
        }
      }
    } catch {
      // Ignore errors for individual dirs
    }
    return total;
  }

  /** Clean up the oldest clones to free space */
  private async cleanupOldest(): Promise<void> {
    const candidates = Array.from(this.activeClones.values())
      .filter(s => s.status === 'complete')
      .sort((a, b) => a.startTime - b.startTime);

    let freed = 0;
    const target = this.maxDiskMB * 1024 * 1024 * 0.5; // free 50% of max

    for (const state of candidates) {
      if (freed >= target) break;
      const size = await this.getDirSize(state.clonePath);
      await this.removeClone(`${state.repo.owner}/${state.repo.name}@${state.repo.branch}`, state);
      freed += size;
      this.logger.info({ freed }, 'Cleanup freed space');
    }
  }

  /** Clean up expired clones periodically */
  startCleanup(intervalMs: number = 300000): void { // every 5 min
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(async () => {
      for (const [key, state] of this.activeClones) {
        if (state.status === 'complete') {
          const age = Date.now() - state.startTime;
          if (age > this.maxAge) {
            this.logger.info({ key, age }, 'Cleaning up expired clone');
            await this.removeClone(key, state);
          }
        }
      }
    }, intervalMs);
  }

  /** Stop periodic cleanup */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /** Run git with an argument array — no shell involved — with timeout */
  private runGit(args: string[], extraEnv: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = parseInt(process.env.GIT_TIMEOUT || '120', 10) * 1000;
      const proc = execFile('git', args, {
        timeout,
        env: { ...process.env, ...extraEnv },
        maxBuffer: 10 * 1024 * 1024,
      });

      proc.stdout?.on('data', (data) => {
        this.logger.debug({ output: data.toString().trim() }, 'Git output');
      });
      proc.stderr?.on('data', (data) => {
        this.logger.debug({ output: data.toString().trim() }, 'Git stderr');
      });

      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git ${args[0]} failed with exit code ${code}`));
      });
    });
  }

  /** Get count of active clones */
  getActiveCloneCount(): number {
    return this.activeClones.size;
  }

  /** Get clone status for a repo key */
  getCloneStatus(key: string): CloneState | undefined {
    return this.activeClones.get(key);
  }
}
