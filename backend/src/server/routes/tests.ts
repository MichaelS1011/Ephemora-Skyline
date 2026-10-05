/**
 * tests — "Run MY tests from the city."
 *
 * Executes the project's OWN test suite inside the staged upload copy —
 * on the user's own machine, exactly what they would run in the terminal.
 * We never bundle a runner: the project brings vitest/jest, we detect it,
 * invoke it with a JSON reporter and map per-file results back onto the
 * city (green shields / cracks).
 *
 * Granularity: full suite or a single test file. Per-test selection comes
 * free later via the runners' -t flag.
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { Request, Response } from "express";
import { getStagedDir } from "./local-analyze.js";
import { isOffline } from "../../services/security/network-policy.js";

const execFileAsync = promisify(execFile);

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_OUTPUT = 32 * 1024 * 1024;

type Runner = "vitest" | "jest";

export interface TestFailure {
  name: string;
  message: string;
}

export interface TestFileResult {
  path: string;
  status: "passed" | "failed";
  tests: number;
  failures: TestFailure[];
}

export interface TestRunResult {
  runner: Runner;
  durationMs: number;
  totalTests: number;
  failedTests: number;
  files: TestFileResult[];
}

interface RunState {
  status: "installing" | "running" | "complete" | "failed";
  stage: string;
  startedAt: number;
  result?: TestRunResult;
  error?: string;
}

/** runId → state (single-user local tool; a small map is plenty) */
const runs = new Map<string, RunState>();

function getRun(id: string): RunState | undefined {
  return runs.get(id);
}

// ── Runner detection ───────────────────────────────────────────────────────

export function detectRunner(pkg: {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}): Runner | null {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const script = pkg.scripts?.test ?? "";
  if (script.includes("vitest") || deps.vitest) return "vitest";
  if (script.includes("jest") || deps.jest) return "jest";
  return null;
}

// ── JSON result parsing ────────────────────────────────────────────────────

interface JestStyleAssertion {
  ancestorTitles?: string[];
  title?: string;
  fullName?: string;
  status?: string;
  failureMessages?: string[];
  location?: { file?: string };
}

interface JestStyleSuite {
  name?: string;
  status?: string;
  assertionResults?: JestStyleAssertion[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** vitest --reporter=json and jest --json share the jest shape */
export function parseJestStyleJson(raw: string): TestRunResult | null {
  // vitest may print non-JSON preamble (vite logs) — find the first "{"
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let parsed: {
    testResults?: JestStyleSuite[];
    numTotalTests?: number;
    numFailedTests?: number;
    success?: boolean;
  };
  try {
    parsed = JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
  const suites = parsed.testResults ?? [];
  const files: TestFileResult[] = [];
  let totalTests = 0;
  let failedTests = 0;
  for (const suite of suites) {
    const filePath = normalizePath(suite.name ?? "");
    const assertions = suite.assertionResults ?? [];
    const failures: TestFailure[] = [];
    let failed = 0;
    for (const a of assertions) {
      totalTests++;
      const name = [...(a.ancestorTitles ?? []), a.title ?? a.fullName ?? ""]
        .filter(Boolean)
        .join(" › ");
      if (a.status === "failed") {
        failed++;
        failedTests++;
        failures.push({
          name,
          message: (a.failureMessages?.[0] ?? "Test failed").split("\n").slice(0, 6).join("\n"),
        });
      }
    }
    files.push({
      path: filePath,
      status: failed > 0 || suite.status === "failed" ? "failed" : "passed",
      tests: assertions.length,
      failures,
    });
  }
  if (files.length === 0) return null;
  return {
    runner: "jest", // shape-wise both are jest-style; caller sets the real runner
    durationMs: 0,
    totalTests,
    failedTests,
    files,
  };
}

// ── Process execution ──────────────────────────────────────────────────────

/**
 * A test run is code from the scanned folder, executed here. The parent process
 * holds the user's credentials (registry tokens, cloud keys, database URLs) in
 * its environment, so the child gets an allowlist instead of an inheritance:
 * what a node run needs to start, and nothing that identifies an account.
 *
 * A suite that genuinely needs the real HOME has to be run in the terminal;
 * that is the cost of running a stranger's tests, and the cheaper choice.
 */
const ENV_ALLOWLIST = [
  "PATH",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "WINSOCKPATH",
  "NVM_BIN",
];

export const RUNNER_HOME = {
  /** npm must not find the user's ~/.npmrc — it can carry a registry token */
  npmCache: (home: string): string => path.join(home, "npm-cache"),
  async prepare(home: string): Promise<void> {
    await fs.mkdir(RUNNER_HOME.npmCache(home), { recursive: true });
    await fs.writeFile(path.join(home, ".npmrc"), "", "utf-8");
  },
};

export function runnerEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CI: "1" };
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env["HOME"] = home;
  env["USERPROFILE"] = home; // npm on windows reads this, not HOME
  env["npm_config_userconfig"] = path.join(home, ".npmrc");
  env["npm_config_cache"] = RUNNER_HOME.npmCache(home);
  return env;
}

/**
 * The selection arrives as extra CLI arguments. A value starting with `-` is not
 * a file name but an option, and `npx vitest --config <path>` would let the
 * caller choose which code the runner loads.
 */
export function sanitizeFileFilters(files: string[], max = 100): string[] {
  return files
    .filter((f) => typeof f === "string" && f.trim() !== "" && !f.trim().startsWith("-"))
    .map((f) => normalizePath(f.trim()))
    .filter((f) => !f.split("/").includes(".."))
    .slice(0, max);
}

async function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT,
      env,
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    // Non-zero exit is a normal test failure — the output is still valuable
    if (typeof err.code === "number") {
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code };
    }
    throw new Error(err.killed ? "Process timed out" : String(error));
  }
}

/**
 * `npx vitest` would download the newest vitest from the registry when the
 * project does not have one, and run it. Fetching code and executing it is not
 * a side effect of pressing "run my tests", so the run only proceeds on what
 * the project already pins: a lockfile, or an installed node_modules.
 */
export type InstallDecision = "install-pinned" | "skip" | "refuse" | "refuse-offline";

export function installDecision(state: {
  nodeModules: boolean;
  lockfile: boolean;
  offline?: boolean;
}): InstallDecision {
  if (state.nodeModules) return "skip";
  // `npm ci` obeys the lockfile, but every tarball still comes off registry.npmjs.org.
  if (state.offline) return "refuse-offline";
  return state.lockfile ? "install-pinned" : "refuse";
}

export const OFFLINE_REFUSAL =
  "This machine is switched off from the network and the staged copy has no node_modules — installing the pinned dependencies would fetch them from registry.npmjs.org. " +
  "Scan a copy that already has node_modules in it, or clear SKYLINE_OFFLINE.";

export const REFUSAL =
  "No lockfile in this project — Ephemora Skyline will not resolve a fresh dependency graph just to run its tests. " +
  "Run npm ci (or npm install) once yourself, or scan a copy that has package-lock.json / pnpm-lock.yaml / yarn.lock in it.";

/** The project's own runner, not a version npx may still fetch from the registry */
export function runnerBinaryPath(runner: Runner): string[] {
  return ["node_modules", ".bin", runner];
}

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
];

async function exists(p: string): Promise<boolean> {
  return fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
}

async function ensureDependencies(
  uploadDir: string,
  setStage: (s: string) => void,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const nodeModules = await exists(path.join(uploadDir, "node_modules"));
  const lockfile = (await Promise.all(LOCKFILES.map((f) => exists(path.join(uploadDir, f))))).some(
    Boolean,
  );
  const decision = installDecision({ nodeModules, lockfile, offline: isOffline() });
  if (decision === "skip") return;
  if (decision === "refuse") throw new Error(REFUSAL);
  if (decision === "refuse-offline") throw new Error(OFFLINE_REFUSAL);
  setStage("Installing pinned dependencies (npm ci) — first run only…");
  const res = await runCmd(
    "npm",
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    uploadDir,
    INSTALL_TIMEOUT_MS,
    env,
  );
  if (res.code !== 0) {
    throw new Error(
      "npm ci failed — the lockfile and package.json disagree, so the pinned versions could not be installed.",
    );
  }
}

// ── The runner ─────────────────────────────────────────────────────────────

export async function executeTestRun(
  runId: string,
  analysisId: string,
  files: string[] | undefined,
): Promise<void> {
  const state = getRun(runId)!;
  let uploadDir = getStagedDir(analysisId);
  if (!uploadDir) {
    state.status = "failed";
    state.error = "The scanned copy of this project is gone (24h TTL) — scan the folder again.";
    return;
  }
  let runnerHome: string | undefined;
  try {
    // One private HOME per run, so the install and the test process never read
    // the real one; removed again at the end of this function
    runnerHome = path.join(os.tmpdir(), "codecity-runner", runId);
    await RUNNER_HOME.prepare(runnerHome);
    const env = runnerEnv(runnerHome);
    // Collect every directory with a supported runner: the project root or
    // any workspace (monorepos like Ephemora itself have backend + frontend)
    const targets: Array<{ dir: string; runner: Runner; wsName: string }> = [];
    try {
      const pkgRaw = await fs.readFile(path.join(uploadDir, "package.json"), "utf-8");
      const runner = detectRunner(JSON.parse(pkgRaw));
      if (runner) targets.push({ dir: uploadDir, runner, wsName: "root" });
    } catch {
      /* no package.json at root — workspaces below */
    }
    if (targets.length === 0) {
      const entries = await fs.readdir(uploadDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const wsPkg = JSON.parse(
            await fs.readFile(path.join(uploadDir, entry.name, "package.json"), "utf-8"),
          );
          const wsRunner = detectRunner(wsPkg);
          if (wsRunner) {
            targets.push({
              dir: path.join(uploadDir, entry.name),
              runner: wsRunner,
              wsName: entry.name,
            });
          }
        } catch {
          /* not a workspace */
        }
      }
    }
    if (targets.length === 0) {
      state.status = "failed";
      state.error = "No supported test runner found — this project needs vitest or jest.";
      return;
    }

    const started = Date.now();
    const filter = sanitizeFileFilters(files ?? []);
    const merged: TestFileResult[] = [];
    let runner: Runner = "vitest";
    let totalTests = 0;
    let failedTests = 0;

    for (const target of targets) {
      runner = target.runner;
      await ensureDependencies(
        target.dir,
        () => {
          state.stage = `Installing dependencies (${target.wsName}) — first run only…`;
        },
        env,
      );
      state.status = "running";
      state.stage = `Running ${runner} (${target.wsName})…`;

      const reportPath = path.join(target.dir, ".codecity-test-report.json");
      // A workspace's runner is often hoisted to the repository root, so both
      // places are checked before the run is refused.
      const candidates = [path.join(target.dir, ...runnerBinaryPath(target.runner))];
      if (target.dir !== uploadDir)
        candidates.push(path.join(uploadDir, ...runnerBinaryPath(target.runner)));
      const where = await Promise.all(candidates.map(exists));
      const binary = candidates[where.indexOf(true)];
      if (!binary) {
        throw new Error(
          `${target.runner} is not installed in ${target.wsName} — Ephemora Skyline does not fetch a runner from the registry to execute it here.`,
        );
      }
      const args =
        target.runner === "vitest"
          ? ["run", "--reporter=json", `--outputFile.json=${reportPath}`, ...filter]
          : ["--json", `--outputFile=${reportPath}`, ...filter];
      const res = await runCmd(binary, args, target.dir, TEST_TIMEOUT_MS, env);

      // The report FILE is immune to stdout buffer truncation
      let reportRaw: string | null = null;
      try {
        reportRaw = await fs.readFile(reportPath, "utf-8");
      } catch {
        reportRaw = null;
      }
      await fs.rm(reportPath, { force: true }).catch(() => {});
      const parsed = parseJestStyleJson(reportRaw ?? res.stdout + "\n" + res.stderr);
      if (!parsed) continue;
      for (const f of parsed.files) {
        merged.push(f);
        totalTests += f.tests;
        failedTests += f.failures.length;
      }
    }

    if (merged.length === 0) {
      state.status = "failed";
      state.error = "The test run produced no parseable results.";
      return;
    }
    state.result = {
      runner,
      durationMs: Date.now() - started,
      totalTests,
      failedTests,
      files: merged,
    };
    state.status = "complete";
  } catch (error) {
    state.status = "failed";
    state.error = error instanceof Error ? error.message : "Test run failed";
  } finally {
    if (runnerHome) await fs.rm(runnerHome, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

/** POST /api/tests/:id/run — id = analysisId, body { files?: string[] } */
export async function handleTestRun(req: Request, res: Response): Promise<void> {
  const analysisId = typeof req.params["id"] === "string" ? req.params["id"] : "";
  if (!analysisId || !getStagedDir(analysisId)) {
    res.status(404).json({ error: "Unknown analysis — scan a folder first" });
    return;
  }
  const body = req.body as { files?: unknown } | undefined;
  const files = Array.isArray(body?.files)
    ? (body?.files as unknown[]).filter((f): f is string => typeof f === "string")
    : undefined;

  const runId = crypto.randomUUID();
  runs.set(runId, { status: "installing", stage: "Preparing…", startedAt: Date.now() });
  // Keep the map bounded: drop runs older than an hour
  for (const [id, r] of runs) {
    if (
      Date.now() - r.startedAt > 60 * 60 * 1000 &&
      r.status !== "running" &&
      r.status !== "installing"
    ) {
      runs.delete(id);
    }
  }
  res.status(202).json({ runId, statusUrl: `/api/tests/run/${runId}` });
  void executeTestRun(runId, analysisId, files).catch(() => {});
}

/** GET /api/tests/run/:runId — poll a test run */
export function handleTestStatus(req: Request, res: Response): void {
  const run = getRun(typeof req.params["runId"] === "string" ? req.params["runId"] : "");
  if (!run) {
    res.status(404).json({ error: "Unknown test run" });
    return;
  }
  res.json({
    status: run.status,
    stage: run.stage,
    result: run.result,
    error: run.error,
  });
}
