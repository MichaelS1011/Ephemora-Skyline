/**
 * CloneManager — Manages temporary directory creation and git cloning operations.
 *
 * Responsibilities:
 * - Create an isolated temp directory per repo (removed again by cleanup()
 *   once the orchestrator is done — clones are never reused or cached)
 * - Execute git clone with depth optimization via argument array (no shell)
 * - Track clone state for concurrency control
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type pino from "pino";
import type { GitHubRepo } from "../../models/index.js";

interface CloneState {
  repo: GitHubRepo;
  clonePath: string;
  startTime: number;
  status: "pending" | "cloning" | "complete" | "failed" | "expired";
}

export class CloneManager {
  private logger: pino.Logger;
  private tempBase: string;
  private activeClones: Map<string, CloneState> = new Map();

  constructor(logger: pino.Logger) {
    this.logger = logger.child({ service: "clone-manager" });
    this.tempBase = path.join(os.tmpdir(), "codecity-clones");
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
    const safe = value.replace(/[^a-zA-Z0-9._-]/g, "");
    if (safe.length === 0 || safe.startsWith("-")) {
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
      return { env: { GIT_TERMINAL_PROMPT: "0" }, cleanup: async () => {} };
    }
    // Tiny askpass helper: git calls it for username and password prompts,
    // GitHub accepts the token in both positions.
    const scriptPath = path.join(os.tmpdir(), `codecity-askpass-${process.pid}.sh`);
    await fs.writeFile(scriptPath, '#!/bin/sh\necho "$CODECITY_GITHUB_TOKEN"\n', { mode: 0o700 });
    return {
      env: {
        GIT_TERMINAL_PROMPT: "0",
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
    if (existing && existing.status === "cloning") {
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
      status: "pending",
    };

    this.activeClones.set(key, state);

    const { env: gitEnv, cleanup: cleanupTokenEnv } = await this.withTokenEnv();

    try {
      state.status = "cloning";
      this.logger.info({ clonePath, repo: key }, "Starting clone");

      // Clean existing if present (stale partial clone)
      try {
        await fs.rm(clonePath, { recursive: true, force: true });
      } catch {
        // Ignore if directory doesn't exist
      }

      const depth = repo.fullHistory ? 0 : parseInt(process.env.GIT_CLONE_DEPTH || "1", 10);

      const args = ["clone", "--single-branch", "--branch", safeBranch];
      if (depth > 0) args.push(`--depth=${depth}`);
      args.push(`https://github.com/${safeOwner}/${safeName}.git`, clonePath);

      await this.runGit(args, gitEnv);

      state.status = "complete";
      state.startTime = Date.now();

      this.logger.info({ clonePath, repo: key }, "Clone completed successfully");
      return clonePath;
    } finally {
      this.activeClones.delete(key);
      await cleanupTokenEnv();
    }
  }

  /** Remove a clone directory by path (called by the orchestrator after analysis) */
  async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  /** Run git with an argument array — no shell involved — with timeout */
  private runGit(args: string[], extraEnv: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = parseInt(process.env.GIT_TIMEOUT || "120", 10) * 1000;
      const proc = execFile("git", args, {
        timeout,
        env: { ...process.env, ...extraEnv },
        maxBuffer: 10 * 1024 * 1024,
      });

      proc.stdout?.on("data", (data) => {
        this.logger.debug({ output: data.toString().trim() }, "Git output");
      });
      proc.stderr?.on("data", (data) => {
        this.logger.debug({ output: data.toString().trim() }, "Git stderr");
      });

      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git ${args[0]} failed with exit code ${code}`));
      });
    });
  }
}
