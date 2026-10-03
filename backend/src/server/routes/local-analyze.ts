import type { Request, Response } from "express";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import { supportedExtensionsLabel } from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, GitHubRepo } from "../../models/index.js";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { deleteJobProgress } from "./job-progress.js";
import { makeSkeleton, makeProgressWriter, failJob } from "./job-progress.js";
import { resolveConfig, type ResolvedScanConfig } from "../../services/security/scan-config.js";

/** Upload caps — a local dev folder should always fit comfortably */
const MAX_FILES = 3000;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // matches the pipeline's MAX_FILE_SIZE
const MAX_NAME_LEN = 80;
const MAX_PATH_LEN = 512;
/**
 * The .git folder rides along so the scanner can read real git history
 * (churn, author districts). Binary payloads arrive base64-encoded and live
 * in their own budget — git metadata must never crowd out source files.
 */
const GIT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const isGitPath = (rel: string): boolean => rel === ".git" || rel.startsWith(".git/");

// ── Staged-directory registry ──────────────────────────────────────────────
// Staged copies outlive the scan so the test runner can execute the
// project's own tests from the city ("run my tests"). A TTL sweeper prunes
// directories whose analysis is old — nothing accumulates forever.
const STAGED_DIRS = new Map<string, { dir: string; lastUsed: number }>();
const STAGED_TTL_MS =
  Math.max(1, Number(process.env.CODECITY_UPLOAD_TTL_HOURS ?? 24)) * 60 * 60 * 1000;

/** The one directory this app stages into; nothing outside it is ever removed. */
function uploadsRoot(): string {
  // An escape hatch for tests and for a machine whose /tmp is too small — the
  // sweeper only ever looks inside this root.
  return process.env.CODECITY_UPLOAD_DIR ?? path.join(os.tmpdir(), "codecity-uploads");
}

/** A staged dir is a direct child named by the id the route generated. */
const STAGED_DIR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function registerUploadDir(analysisId: string, dir: string): void {
  STAGED_DIRS.set(analysisId, { dir, lastUsed: Date.now() });
}

export function getStagedDir(analysisId: string): string | null {
  const entry = STAGED_DIRS.get(analysisId);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  return entry.dir;
}

export function pruneStaleUploadDirs(now: number = Date.now()): Promise<void> {
  // `now` injectable so tests can fast-forward the clock
  const jobs: Array<Promise<unknown>> = [];
  for (const [id, entry] of STAGED_DIRS) {
    if (now - entry.lastUsed > STAGED_TTL_MS) {
      STAGED_DIRS.delete(id);
      jobs.push(fs.rm(entry.dir, { recursive: true, force: true }).catch(() => {}));
    }
  }
  // The registry lives in RAM, so a restart forgets every folder it staged —
  // and the copies of the user's source stayed behind (212 of them on this
  // machine). Sweep the staging root itself: only direct children, only the
  // uuid-shaped names this route makes, only real directories, only past TTL.
  // A symlinked child is left alone rather than followed out of the root.
  jobs.push(
    fs
      .readdir(uploadsRoot(), { withFileTypes: true })
      .then((entries) =>
        Promise.all(
          entries
            .filter((e) => e.isDirectory() && !e.isSymbolicLink() && STAGED_DIR_NAME.test(e.name))
            .map(async (e) => {
              const dir = path.join(uploadsRoot(), e.name);
              const stat = await fs.stat(dir).catch(() => null);
              if (!stat || Date.now() - stat.mtimeMs <= STAGED_TTL_MS) return;
              return fs.rm(dir, { recursive: true, force: true }).catch(() => {});
            }),
        ),
      )
      .catch(() => undefined),
  );
  return Promise.all(jobs).then(() => undefined);
}

export interface UploadedFile {
  path: string;
  content: string;
  /** "base64" for binary .git payloads — everything else is utf-8 text */
  encoding?: "base64";
}

/** Normalize + validate an uploaded relative path; null when unsafe */
export function safeRelativePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LEN) return null;
  const p = raw.replaceAll("\\", "/");
  if (p.includes("\0")) return null;
  if (path.isAbsolute(p)) return null;
  // Strict: no parent segments and no drive letters at all — legitimate file
  // picks from the browser never contain them
  if (/(^|\/)\.\.($|\/)/.test(p) || /^[a-zA-Z]:\//.test(p)) return null;
  const resolved = path.resolve("/", p).slice(1); // collapses ./ and // against a fake root
  if (resolved.length === 0 || resolved.endsWith("/")) return null;
  return resolved;
}

/** Sanitize the display name of a picked folder */
function safeDisplayName(raw: string): string {
  const cleaned = String(raw ?? "")
    .replaceAll(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return cleaned || "local folder";
}

/**
 * POST /api/analyze-local — analyze a folder picked in the browser.
 * Body: { name: string, files: Array<{ path, content }> }
 * Responds 202 { id, statusUrl } immediately; the analysis runs in the
 * background with progress on GET /api/status/:id.
 *
 * `createOrchestrator` is called per request on purpose: the scanner holds the
 * resolved config and per-run adapter state, so one shared instance would let
 * two analyses running at the same time answer with each other's profile.
 */
export async function handleLocalAnalyze(
  req: Request,
  res: Response,
  createOrchestrator: (config: ResolvedScanConfig) => AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
): Promise<void> {
  const body = req.body as { name?: unknown; files?: unknown; config?: unknown } | undefined;
  const name = safeDisplayName(typeof body?.name === "string" ? body.name : "");
  const files = body?.files;
  const { config, errors: configErrors } = resolveConfig(body?.config);
  if (configErrors.length > 0) {
    res.status(400).json({ error: "Invalid scan config", details: configErrors });
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "No files received — pick a folder and try again" });
    return;
  }
  if (files.length > MAX_FILES) {
    res.status(400).json({
      error: `Folder too large: ${files.length} files (maximum ${MAX_FILES}). Skip node_modules/dist — CodeCity ignores them anyway.`,
    });
    return;
  }

  // Validate + normalize everything BEFORE touching the disk
  const cleaned: UploadedFile[] = [];
  let totalBytes = 0;
  let gitBytes = 0;
  for (const f of files as Array<{ path?: unknown; content?: unknown; encoding?: unknown }>) {
    if (typeof f?.path !== "string" || typeof f?.content !== "string") continue;
    const rel = safeRelativePath(f.path);
    if (!rel) continue; // silently drop unsafe paths — the picker only sends real files
    const encoding = f.encoding === "base64" ? "base64" : undefined;
    const byteLen = f.content.length; // chars ≈ bytes upper bound for UTF-8 code files
    if (isGitPath(rel)) {
      if (encoding !== "base64") continue; // binary git data must arrive exactly
      if (byteLen > GIT_MAX_FILE_BYTES * 1.4 || gitBytes + byteLen > GIT_MAX_TOTAL_BYTES * 1.4) {
        continue; // base64 inflates ~4/3 — cap on the encoded size with headroom
      }
      gitBytes += byteLen;
      cleaned.push({ path: rel, content: f.content, encoding });
      continue;
    }
    if (byteLen > MAX_FILE_BYTES) continue; // pipeline skips oversized files anyway
    totalBytes += byteLen;
    if (totalBytes > MAX_TOTAL_BYTES) {
      res.status(400).json({
        error: `Folder too large: over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB of source code. Exclude build artifacts and try again.`,
      });
      return;
    }
    cleaned.push({ path: rel, content: f.content });
  }
  if (!cleaned.some((f) => !isGitPath(f.path))) {
    res.status(400).json({
      error:
        "No analyzable source files in that folder (supported: ts, tsx, js, jsx, py, go, rs, java, rb, html, css, json, yaml)",
    });
    return;
  }

  // Isolated upload dir under the OS temp dir. The staged copy is the user's
  // source code, so it is created owner-only: /tmp is one shared directory, and
  // a world-readable copy of somebody's repository is a leak the product itself
  // would cause.
  const analysisId = crypto.randomUUID();
  const uploadDir = path.join(uploadsRoot(), analysisId);
  try {
    await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    await fs.chmod(uploadDir, 0o700).catch(() => {});
    for (const f of cleaned) {
      const target = path.resolve(uploadDir, f.path);
      if (!target.startsWith(uploadDir + path.sep)) continue; // belt and braces
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const data =
        f.encoding === "base64"
          ? Buffer.from(f.content, "base64")
          : Buffer.from(f.content, "utf-8");
      await fs.writeFile(
        target,
        data,
        f.encoding === "base64" ? undefined : { encoding: "utf-8", mode: 0o600 },
      );
    }
  } catch (error) {
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : "Failed to stage uploaded files";
    res.status(500).json({ error: message });
    return;
  }
  registerUploadDir(analysisId, uploadDir);

  const repo: GitHubRepo = {
    owner: "local",
    name,
    branch: "local",
    cloneUrl: "",
    analyzedAt: new Date().toISOString(),
  };

  analysisStore.set(analysisId, makeSkeleton(analysisId, repo));

  res.status(202).json({
    id: analysisId,
    status: "analyzing",
    statusUrl: `/api/status/${analysisId}`,
  });

  void runLocalAnalysis(
    analysisId,
    uploadDir,
    repo,
    createOrchestrator(config),
    analysisStore,
    config,
  ).catch(() => {});
}

/** Background runner for local-folder analyses — never awaited */
async function runLocalAnalysis(
  analysisId: string,
  uploadDir: string,
  repo: GitHubRepo,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
  config?: ResolvedScanConfig,
): Promise<void> {
  const onEvent = makeProgressWriter(analysisId);
  try {
    const result = await orchestrator.analyzeDirectory(
      analysisId,
      uploadDir,
      repo,
      onEvent,
      config,
    );
    deleteJobProgress(analysisId);

    if (result.status === "failed" || result.summary.totalFiles === 0) {
      const message =
        result.error ??
        `No analyzable files found in that folder — CodeCity reads: ${supportedExtensionsLabel()}`;
      failJob(analysisId, message, analysisStore);
      return;
    }

    analysisStore.set(result.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    failJob(analysisId, message, analysisStore);
  }
  // The staged copy is KEPT: the test runner reuses it ("run my tests from
  // the city"). A TTL sweeper prunes stale dirs (pruneStaleUploadDirs).
}
