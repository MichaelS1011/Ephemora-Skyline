import { execFile } from "child_process";
import pino from "pino";
import { promisify } from "util";
import { mkdtemp, writeFile, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { SecurityIssue } from "../../../models/index.js";
import type { ScannerAdapter } from "../adapter.js";
import { sarifToIssues } from "../sarif-mapper.js";
import { isOffline } from "../network-policy.js";

const execFileAsync = promisify(execFile);

// Registry config can be overridden (e.g. to a local rules dir for offline runs)
const SEMGREP_CONFIG = process.env.SEMGREP_CONFIG || "p/security-audit";
// Versioned image — a floating :latest tag is a supply-chain risk
const SEMGREP_DOCKER_IMAGE = process.env.SEMGREP_DOCKER_IMAGE || "semgrep/semgrep:1.162.0";
// Same minimal-PATH reasoning as gitleaks: try known prefixes, too
const SEMGREP_BIN_FALLBACKS = ["/opt/homebrew/bin/semgrep", "/usr/local/bin/semgrep"];

/**
 * semgrep asks "is there a newer version?" on every start, which is an outbound
 * call nobody asked for and a reason for the probe to be slow. `--metrics=off`
 * covers the other one.
 *
 * Read at call time, not at import: a snapshot taken when this module loads
 * freezes the environment of whoever imported first, and a scan that later
 * inherits a proxy from its caller would silently run without it.
 */
function semgrepEnv(): NodeJS.ProcessEnv {
  return { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: "0", SEMGREP_SEND_METRICS: "off" };
}

export class SemgrepAdapter implements ScannerAdapter {
  readonly id = "semgrep";
  private logger = pino({ name: "semgrep-adapter" });
  private binaryAvailable: boolean | null = null;
  private resolvedBinary: string | null = null;
  private dockerAvailable: boolean | null = null;
  /**
   * Local rule-pack directories for the current scan. Empty means "no pack
   * selected", which is the registry string above — and that string is a
   * network fetch during the scan, so the difference is not cosmetic.
   */
  private ruleDirs: string[] = [];
  /** Whether the last scanBatch() call actually executed semgrep (binary or docker) */
  lastBatchExecuted = false;

  setRuleDirs(dirs: string[]): void {
    this.ruleDirs = [...new Set(dirs)];
  }

  /** `--config` arguments for the binary: one per local pack, or the registry default. */
  private configArgs(): string[] {
    if (this.ruleDirs.length === 0) return ["--config", SEMGREP_CONFIG];
    return this.ruleDirs.flatMap((dir) => ["--config", dir]);
  }

  /** The same packs seen from inside the container, plus the mounts that put them there. */
  private dockerConfigArgs(): { args: string[]; mounts: string[] } {
    if (this.ruleDirs.length === 0) {
      return { args: ["--config", SEMGREP_CONFIG], mounts: [] };
    }
    const args: string[] = [];
    const mounts: string[] = [];
    for (const dir of this.ruleDirs) {
      const target = `/codecity-rules/${path.basename(dir)}`;
      args.push("--config", target);
      mounts.push("-v", `${dir}:${target}:ro`);
    }
    return { args, mounts };
  }

  /** Resolve the semgrep binary once: PATH first, then common prefixes */
  private async resolveBinary(): Promise<string | null> {
    if (this.resolvedBinary) return this.resolvedBinary;
    for (const candidate of ["semgrep", ...SEMGREP_BIN_FALLBACKS]) {
      try {
        await execFileAsync(candidate, ["--version"], { timeout: 15000, env: semgrepEnv() });
        this.resolvedBinary = candidate;
        this.logger.info({ binary: candidate }, "semgrep binary found");
        return candidate;
      } catch (e) {
        // Only "no such file" means the binary is not here. A slow start — the
        // probe is a Python process, and several scans resolve at once — must
        // not turn into "semgrep is not installed", because that silently drops
        // every AST finding while the scan still reports success.
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        this.logger.warn({ candidate, err: e }, "semgrep version probe failed; using it anyway");
        this.resolvedBinary = candidate;
        return candidate;
      }
    }
    return null;
  }

  // Per-file fallback is no-op — semgrep is batch-oriented.
  async scanFile(_filePath: string, _content: string): Promise<SecurityIssue[]> {
    return [];
  }

  async scanBatch(
    clonePath: string,
    contentByPath?: Map<string, string>,
  ): Promise<SecurityIssue[]> {
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

  private async tryBinary(
    clonePath: string,
    contentByPath?: Map<string, string>,
  ): Promise<SecurityIssue[] | null> {
    if (this.binaryAvailable === false) return null;
    // A directory per run, not a name to the millisecond: two scans in flight
    // used to write the same SARIF file, and whichever finished first deleted
    // the other's report — findings that silently go missing under load.
    let outDir: string | null = null;
    try {
      const bin = await this.resolveBinary();
      if (!bin) {
        this.binaryAvailable = false;
        return null;
      }
      this.binaryAvailable = true;
      outDir = await mkdtemp(path.join(tmpdir(), "codecity-semgrep-"));
      const tmpOut = path.join(outDir, "run.sarif");
      const configArgs = this.configArgs();
      try {
        await execFileAsync(
          bin,
          [
            ...configArgs,
            "--metrics=off",
            "--sarif",
            "--quiet",
            "--sarif-output",
            tmpOut,
            clonePath,
          ],
          {
            timeout: parseInt(process.env.SEMGREP_TIMEOUT || "120", 10) * 1000,
            maxBuffer: 10 * 1024 * 1024,
            env: semgrepEnv(),
          },
        );
      } catch (e) {
        const err = e as { code?: number };
        // semgrep exits 0 (no findings), 1 (findings), 2 (error) — 0/1 are ok
        if (err.code !== 0 && err.code !== 1) {
          // try without sarif-output: capture stdout
          const { stdout } = await execFileAsync(
            bin,
            [...configArgs, "--metrics=off", "--sarif", "--quiet", clonePath],
            {
              timeout: parseInt(process.env.SEMGREP_TIMEOUT || "120", 10) * 1000,
              maxBuffer: 10 * 1024 * 1024,
              env: semgrepEnv(),
            },
          ).catch((ex) => {
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
        const raw = await readFile(tmpOut, "utf-8");
        if (!raw.trim()) return [];
        return sarifToIssues(JSON.parse(raw), contentByPath);
      } catch {
        return [];
      }
    } catch (e) {
      // An engine that fails silently is an engine that reports "clean". The
      // binary stays available: one failed run is not proof it is gone, and
      // switching it off for the rest of the process would hide the failure.
      this.logger.warn({ err: e, clonePath }, "semgrep binary run failed");
      return null;
    } finally {
      if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async tryDocker(
    clonePath: string,
    contentByPath?: Map<string, string>,
  ): Promise<SecurityIssue[] | null> {
    if (this.dockerAvailable === false) return null;
    /**
     * The fallback is a convenience for a person who has Docker but never
     * installed semgrep. It is not a convenience for a build runner: the first
     * thing it does there is reach registry-1.docker.io, and a status badge that
     * depends on an image pull is a badge that fails when the registry is slow.
     * `SEMGREP_DOCKER=0` says "this machine's Docker is not an engine source",
     * and the scan then reports semgrep as not run — the same honest answer an
     * absent binary already gives.
     */
    if (/^(0|false|off)$/i.test(process.env.SEMGREP_DOCKER ?? "")) {
      this.dockerAvailable = false;
      return null;
    }
    let outDir: string | null = null;
    try {
      if (this.dockerAvailable === null) {
        await execFileAsync("docker", ["--version"], { timeout: 3000 });
        this.dockerAvailable = true;
      }
      /**
       * The fallback reaches registry-1.docker.io for the image, so offline
       * here means "only an image already on this disk". A scan with a local
       * rule pack still runs — the pack needs no network, the pull would.
       */
      if (isOffline()) {
        try {
          await execFileAsync("docker", ["image", "inspect", SEMGREP_DOCKER_IMAGE], {
            timeout: 5000,
          });
        } catch {
          this.logger.warn(
            { image: SEMGREP_DOCKER_IMAGE },
            "offline: image is not cached locally, the Docker fallback would pull it",
          );
          return null;
        }
      }
      outDir = await mkdtemp(path.join(tmpdir(), "codecity-semgrep-docker-"));
      const tmpOut = path.join(outDir, "run.sarif");
      const { args: configArgs, mounts } = this.dockerConfigArgs();
      // mount clonePath as /src
      await execFileAsync(
        "docker",
        [
          "run",
          "--rm",
          // Same two asks as the binary path, and inside a container the only
          // way to stop them is to tell the container.
          "-e",
          "SEMGREP_ENABLE_VERSION_CHECK=0",
          "-e",
          "SEMGREP_SEND_METRICS=off",
          "-v",
          `${clonePath}:/src:ro`,
          "-v",
          `${path.dirname(tmpOut)}:/out`,
          ...mounts,
          SEMGREP_DOCKER_IMAGE,
          "semgrep",
          ...configArgs,
          "--metrics=off",
          "--sarif",
          "--quiet",
          "--sarif-output",
          `/out/${path.basename(tmpOut)}`,
          "/src",
        ],
        {
          timeout: 90000,
          maxBuffer: 10 * 1024 * 1024,
        },
      ).catch((e) => {
        const err = e as { code?: number };
        if (err.code !== 0 && err.code !== 1) throw e;
        return { stdout: "" } as { stdout: string };
      });
      try {
        const raw = await readFile(tmpOut, "utf-8");
        if (!raw.trim()) return [];
        return sarifToIssues(JSON.parse(raw), contentByPath);
      } catch {
        return [];
      }
    } catch {
      this.dockerAvailable = false;
      return null;
    } finally {
      if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Adapter compat: temp-file semgrep per single content (for tests without clone)
  async scanSingleContent(filePath: string, content: string): Promise<SecurityIssue[]> {
    let tmpBase: string | null = null;
    try {
      if (this.binaryAvailable === false && this.dockerAvailable === false) return [];
      tmpBase = await mkdtemp(path.join(tmpdir(), "codecity-semgrep-single-"));
      const tmpFile = path.join(tmpBase, path.basename(filePath));
      await writeFile(tmpFile, content, "utf-8");
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
